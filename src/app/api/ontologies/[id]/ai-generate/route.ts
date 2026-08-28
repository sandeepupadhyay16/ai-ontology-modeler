import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { weaveOrphanConcepts } from '@/lib/graphWeaver';
import { cleanAndParseJSON, normalizeOntologyJSON, inferDatatypeFromName, formatCompressedState } from '@/lib/schemaNormalizer';
import { detectDomainTaxonomies, formatTaxonomyGuidance } from '@/lib/domainTaxonomyRegistry';
import http from 'http';
import { setGlobalDispatcher, Agent } from 'undici';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Override global Node.js HTTP server request and headers timeouts to 15 mins
if (http.Server && http.Server.prototype) {
  http.Server.prototype.headersTimeout = 900000;
  http.Server.prototype.requestTimeout = 900000;
  http.Server.prototype.keepAliveTimeout = 900000;
}

// Override global Node.js client-side fetch timeouts to 15 mins
setGlobalDispatcher(new Agent({
  headersTimeout: 900000,
  bodyTimeout: 900000,
  connectTimeout: 900000
}));

async function callLLMProvider(systemPrompt: string, userPrompt: string): Promise<string> {
  const activeConfig = await db.llmConfiguration.findFirst({
    where: { isActive: true },
  });

  const provider = activeConfig?.provider || 'LM_STUDIO';
  const modelName = activeConfig?.modelName || 'lmstudio-community';
  const apiKey = activeConfig?.apiKey || '';
  const baseUrl = activeConfig?.baseUrl || 'http://localhost:1234/v1';

  if (provider === 'LM_STUDIO') {
    let cleanedUrl = baseUrl.trim().replace(/\/$/, '');
    if (!cleanedUrl.endsWith('/v1')) {
      cleanedUrl = `${cleanedUrl}/v1`;
    }

    const payload = {
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.15,
      max_tokens: 25000,
    };

    const response = await fetch(`${cleanedUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
      },
      signal: AbortSignal.timeout(900000),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`LM Studio returned HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content || '';
  }

  if (provider === 'OPENAI') {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.15,
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI returned an error: ${errText}`);
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  if (provider === 'ANTHROPIC') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelName,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        max_tokens: 4000,
        temperature: 0.15
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic returned an error: ${errText}`);
    }
    const data = await response.json();
    return data.content?.[0]?.text || '';
  }

  if (provider === 'GOOGLE') {
    const isInteractionsModel = modelName.includes('3.5') || modelName.includes('interactions');
    
    if (isInteractionsModel) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/interactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          model: modelName,
          input: userPrompt,
          system_instruction: systemPrompt,
          response_format: {
            type: 'text',
            mime_type: 'application/json',
          }
        }),
      });
      
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini returned an error: ${errText}`);
      }
      
      const data = await response.json();
      const outputStep = data.steps?.find((s: any) => s.type === 'model_output');
      return outputStep?.content?.[0]?.text || '';
    } else {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: userPrompt }]
            }
          ],
          system_instruction: {
            parts: [{ text: systemPrompt }]
          },
          generationConfig: {
            temperature: 0.15,
            response_mime_type: 'application/json',
          }
        }),
      });
      
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini returned an error: ${errText}`);
      }
      
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: ontologyId } = await params;
  const body = await request.json();
  const { prompt, currentOntologyState, answers = null, guidanceMode = 'DIRECT', flexibleMode = true, templateId = null } = body;

  if (!prompt || !prompt.trim()) {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
  }

  // Set up SSE Stream with TextEncoder
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const sendEvent = async (data: any) => {
    try {
      await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    } catch {
      // Catch client disconnects silently
    }
  };

  // Run the generation asynchronously while streaming heartbeats and status events
  (async () => {
    let heartbeatTimer: NodeJS.Timeout | null = null;
    const startTime = Date.now();

    try {
      await sendEvent({ type: 'status', message: '🔍 Initializing domain ontology context & taxonomy standard...' });

      // Start 5-second keep-alive heartbeats so Cloudflare NEVER times out (100s limit defeated)
      heartbeatTimer = setInterval(async () => {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        await sendEvent({
          type: 'heartbeat',
          message: `⏳ Synthesizing domain ontology graph (${elapsed}s elapsed)...`,
          elapsedSec: elapsed,
        });
      }, 5000);

      // Verify ontology exists and load organization details
      const ontology = await db.ontology.findUnique({
        where: { id: ontologyId },
        include: {
          organization: true,
        },
      });

      if (!ontology) {
        await sendEvent({ type: 'error', error: 'Ontology not found' });
        return;
      }

      const orgName = ontology.organization?.name || '';
      const orgDesc = ontology.organization?.description || '';
      const ontologyDesc = ontology.description || '';

      // Load PromptTemplate if provided or if matched by industry/businessFunction
      let templateCausalCycles: any[] = [];
      if (templateId) {
        const template = await db.promptTemplate.findUnique({ where: { id: templateId } });
        if (template?.causalCycles && Array.isArray(template.causalCycles)) {
          templateCausalCycles = template.causalCycles;
        }
      }

      // Format User intent by attaching any submitted answers from the Probing flow
      let userIntent = prompt;
      if (answers && Object.keys(answers).length > 0) {
        userIntent += "\n\nUser Clarification Answers:\n" + Object.entries(answers).map(([q, a]) => `- Question: ${q}\n  Answer: ${a}`).join('\n');
      }

      // Dynamic Domain Detection across prompt, description, and metadata
      const fullContextStr = `${userIntent} ${ontology.name} ${ontologyDesc} ${orgName} ${orgDesc} ${ontology.industry || ''} ${ontology.businessFunction || ''}`.toLowerCase();

      const detectedTaxonomies = detectDomainTaxonomies(fullContextStr);
      let domainGuidance = '';
      if (detectedTaxonomies.length > 0) {
        domainGuidance = detectedTaxonomies.slice(0, 2).map(t => formatTaxonomyGuidance(t)).join('\n');
      }

      let probingResponse = null;

      // Optional Classifier only if in INTERACTIVE mode and prompt is extremely short/ambiguous
      if (guidanceMode === 'INTERACTIVE' && userIntent.trim().split(/\s+/).length < 6) {
        const classifierSystemPrompt = `You are the AI Ontology Classifier.
Determine if the user's modeling request is specific enough to construct or update the ontology graph.
If vague, set "decision": "CLARIFY" and provide 2-3 specific probing questions.
Otherwise, set "decision": "PROCEED".

CRITICAL RULES:
1. NO INTERNAL REASONING: Do NOT emit internal thoughts, scratchpad monologue, or thinking tags (<think>...</think>).
2. START IMMEDIATELY: Start on token 1 with the opening '{' brace.
3. RAW JSON ONLY: Respond ONLY with a valid JSON object matching this schema:
{
  "decision": "PROCEED" | "CLARIFY",
  "probingQuestions": ["Question 1", "Question 2"]
}`;

        try {
          const classifierReply = await callLLMProvider(classifierSystemPrompt, userIntent);
          const parsedClassifier = cleanAndParseJSON(classifierReply);
          if (parsedClassifier && parsedClassifier.decision === 'CLARIFY' && Array.isArray(parsedClassifier.probingQuestions) && parsedClassifier.probingQuestions.length > 0) {
            probingResponse = parsedClassifier.probingQuestions;
          }
        } catch {
          console.warn("Classifier pass bypassed, proceeding to direct generation.");
        }
      }

      if (probingResponse) {
        await sendEvent({ type: 'probing', probingQuestions: probingResponse, isVague: true });
        return;
      }

      const ontologyContextPrompt = `ONTOLOGY CONTEXT:
- Organization: ${orgName || 'Enterprise'} (${orgDesc || ''})
- Domain Focus: ${ontology.name} (${ontologyDesc || ontology.industry || 'General'})
- Business Function: ${ontology.businessFunction || 'General Operations'}
- Modeling Intent: ${userIntent}`;

      const baseSystemPrompt = `You are the Lead Enterprise Semantic & Business Process Modeler Agent.
Your job is to generate a comprehensive, richly structured, fully connected domain ontology knowledge graph matching the user's specific domain requirements.
${ontologyContextPrompt}
${domainGuidance}

COMPREHENSIVE MODELING MANDATE:
1. MULTI-TIER COVERAGE: You MUST create 10 to 18 granular, high-impact domain concepts spanning all enterprise tiers:
   - Personas & Stakeholders (Actors executing tasks)
   - Operational Processes & Sub-processes (Core workflows and activities)
   - Core Entities & Master Data (Domain objects, assets, records)
   - Enterprise Data Systems (Platforms, CRM, ERP, Data stores)
   - Key Performance Indicators & Metrics (Operational and business KPIs)
   - Workflow Events & Milestones (Triggers and alerts)
2. MANDATORY 100% GRAPH CONNECTIVITY: Connect ALL concepts via directional relationships (source -> target). Zero isolated or orphan concepts allowed.
   - Personas -> executes -> Processes
   - Processes -> produces/updates -> Entities
   - Processes -> loggedInto/integratesWith -> Systems
   - Metrics -> measures/evaluates -> Processes/Entities
   - Events -> triggers -> Processes
3. ATTRIBUTES: Provide 2 to 4 typed attributes for every concept (datatype: "string" | "integer" | "float" | "dateTime" | "boolean").
4. COMPETENCY QUESTIONS: Provide 3 to 5 realistic, domain-specific questions answerable by traversing the graph.
5. DRIVER TREES: Include at least 1 Performance Driver Tree linking Metric concepts with polarity (+/-) and weights.

CRITICAL RULES (FOLLOW STRICTLY):
1. NO INTERNAL REASONING OR MONOLOGUE: You MUST NOT emit internal reasoning, thinking monologue, chain-of-thought tokens, or scratchpad text (<think>...</think> or reasoning buffer). Commit directly to outputting valid JSON from token 1.
2. IMMEDIATE COMMITMENT: Begin your output directly with the opening brace '{'.
3. OUTPUT FORMAT: Respond ONLY with a single, valid JSON object matching the schema below. NEVER include markdown code fences (\`\`\`json), conversational preamble, thinking tags, or closing commentary.
4. CONCISENESS OF TEXT: Keep each concept description concise (1-2 sentences, max 20 words). Keep attribute descriptions under 8 words.
5. UNIQUE LABELS: Every concept label in the "concepts" list MUST be unique and CamelCase.

SCHEMA SPECIFICATION:
{
  "concepts": [
    {
      "label": "ConceptName",
      "conceptType": "Entity" | "Process" | "Metric" | "Persona" | "System" | "Event" | "DataSource",
      "description": "Clear domain description (under 20 words)",
      "attributes": [
        { "name": "fieldName", "datatype": "string", "description": "desc", "required": true }
      ]
    }
  ],
  "relationships": [
    {
      "name": "executes" | "produces" | "governedBy" | "monitors" | "calculates" | "isAssociatedWith",
      "source": "ExactSourceConceptLabel",
      "target": "ExactTargetConceptLabel",
      "cardinality": "one-to-many" | "one-to-one"
    }
  ],
  "competencyQuestions": [
    { "question": "Clear business question answerable by graph?", "status": "Ratified" }
  ],
  "driverTrees": [
    {
      "name": "Performance Driver Tree",
      "edges": [
        { "name": "Positively Drives (0.85)", "source": "SrcMetricLabel", "target": "TgtMetricLabel", "polarity": "+", "weight": 0.85 }
      ]
    }
  ]
}

CONCRETE EXAMPLE (abbreviated — your output should have 10-18 concepts):
{
  "concepts": [
    { "label": "SalesRepresentative", "conceptType": "Persona", "description": "Field rep executing physician detailing visits", "attributes": [{"name": "repId", "datatype": "string", "description": "Unique rep ID", "required": true}, {"name": "territory", "datatype": "string", "description": "Assigned territory", "required": true}] },
    { "label": "PhysicianDetailingVisit", "conceptType": "Process", "description": "Scheduled visit to present product data to prescriber", "attributes": [{"name": "visitDate", "datatype": "dateTime", "description": "Visit timestamp", "required": true}, {"name": "durationMinutes", "datatype": "integer", "description": "Visit length", "required": false}] },
    { "label": "PrescriptionConversionRate", "conceptType": "Metric", "description": "Percentage of detailing visits resulting in new prescriptions", "attributes": [{"name": "currentValue", "datatype": "float", "description": "Current rate", "required": true}, {"name": "targetThreshold", "datatype": "float", "description": "Target KPI", "required": true}] }
  ],
  "relationships": [
    { "name": "executes", "source": "SalesRepresentative", "target": "PhysicianDetailingVisit", "cardinality": "one-to-many" },
    { "name": "measures", "source": "PrescriptionConversionRate", "target": "PhysicianDetailingVisit", "cardinality": "one-to-one" }
  ],
  "competencyQuestions": [
    { "question": "Which sales representatives have the highest prescription conversion rate this quarter?", "status": "Ratified" }
  ],
  "driverTrees": [
    { "name": "Sales Performance", "edges": [{"name": "Positively Drives (0.9)", "source": "PrescriptionConversionRate", "target": "TerritoryRevenue", "polarity": "+", "weight": 0.9}] }
  ]
}`;

      let generatorSystemPrompt = `${baseSystemPrompt}`;

      if (templateCausalCycles.length > 0) {
        generatorSystemPrompt += `\n\nREQUIRED CAUSAL CYCLES & FEEDBACK LOOPS:\n${JSON.stringify(templateCausalCycles, null, 2)}\nIncorporate these feedback cycles into your "causalCycles" output.`;
      }

      if (currentOntologyState && currentOntologyState.concepts?.length > 0) {
        const compressedState = formatCompressedState(currentOntologyState);
        generatorSystemPrompt += `\n\n${compressedState}\n\nApply user instructions incrementally, preserving existing nodes and edges, and return the complete updated state.`;
      }

      await sendEvent({ type: 'status', message: '🧠 Model is reasoning and synthesizing domain ontology graph...' });

      // Executing Generation Pass
      const genReply = await callLLMProvider(generatorSystemPrompt, userIntent);
      const parsedRaw = cleanAndParseJSON(genReply);

      if (!parsedRaw || (typeof parsedRaw === 'object' && Object.keys(parsedRaw).length === 0)) {
        throw new Error("Local model returned an unparseable or empty response. Please verify the model output in LM Studio.");
      }

      await sendEvent({ type: 'status', message: '✨ Normalizing concepts, typed attributes & relationships...' });

      // Normalize model variations (string attributes, string CQs, synonyms, root wrappers)
      let normalized = normalizeOntologyJSON(parsedRaw);

      // Quality Gate: If output is too sparse (< 6 concepts or < 4 relationships) on fresh generation, retry once with an emphasis prompt
      if ((!normalized.concepts || normalized.concepts.length < 6 || !normalized.relationships || normalized.relationships.length < 4) && (!currentOntologyState || !currentOntologyState.concepts?.length)) {
        console.warn(`Initial generation sparse (${normalized.concepts?.length || 0} concepts, ${normalized.relationships?.length || 0} rels). Retrying with high-density mandate...`);
        await sendEvent({ type: 'status', message: '⚡ Elevating graph density to satisfy enterprise coverage standards...' });
        const retrySystemPrompt = `${generatorSystemPrompt}\n\nCRITICAL ENFORCEMENT: Your previous response was too sparse. You MUST generate between 10 and 18 distinct concepts spanning Personas, Processes, Entities, Systems, and Metrics, with at least 10 relationships connecting them.`;
        try {
          const retryReply = await callLLMProvider(retrySystemPrompt, userIntent);
          const retryParsed = cleanAndParseJSON(retryReply);
          const retryNormalized = normalizeOntologyJSON(retryParsed);
          if (retryNormalized.concepts && retryNormalized.concepts.length >= (normalized.concepts?.length || 0)) {
            normalized = retryNormalized;
          }
        } catch (retryErr: any) {
          console.warn('Retry pass encountered error, proceeding with initial normalized output:', retryErr.message);
        }
      }

      if (!normalized.concepts || normalized.concepts.length === 0) {
        throw new Error("No domain concepts were extracted from model output. Please re-run with a detailed prompt.");
      }

      await sendEvent({ type: 'status', message: '🔗 Eliminating orphan nodes & establishing 100% graph connectivity...' });

      // Apply Deterministic Graph Weaver to guarantee 100% connectivity and rich attributes
      const finalJSON = weaveOrphanConcepts(normalized);

      const { 
        concepts = [], 
        relationships = [], 
        competencyQuestions = [], 
        driverTrees = [],
        perspectives = [],
        causalCycles = (templateCausalCycles.length > 0 ? templateCausalCycles : [])
      } = finalJSON;

      await sendEvent({ type: 'status', message: '💾 Executing atomic synchronization to enterprise knowledge base...' });

      // Execute atomic full state synchronization
      const summary = await db.$transaction(async (tx: any) => {
        // 1. Sync Concepts
        const labelToConcept: Record<string, any> = {};
        const newConceptIds: string[] = [];

        for (const concept of concepts) {
          if (!concept || !concept.label) continue;
          const cleanLabel = String(concept.label).trim();
          if (!cleanLabel) continue;
          const conceptType = concept.conceptType || 'Entity';

          const normalizedAttrs = Array.isArray(concept.attributes)
            ? concept.attributes.map((attr: any) => {
                const name = typeof attr === 'string' ? attr.trim() : String(attr?.name || attr?.attributeName || '').trim();
                const datatype = typeof attr === 'object' && attr?.datatype ? attr.datatype : inferDatatypeFromName(name);
                const description = typeof attr === 'object' && attr?.description ? attr.description : '';
                const required = typeof attr === 'object' ? !!attr.required : false;
                return { name, datatype, description, required };
              }).filter((a: any) => Boolean(a && a.name))
            : [];

          // Upsert Concept
          let dbConcept = await tx.concept.findFirst({
            where: { label: cleanLabel, ontologyId },
          });

          if (!dbConcept) {
            dbConcept = await tx.concept.create({
              data: {
                label: cleanLabel,
                conceptType,
                typeFields: concept.typeFields || {},
                ontologyId,
                attributes: {
                  create: normalizedAttrs,
                },
              },
            });
          } else {
            dbConcept = await tx.concept.update({
              where: { id: dbConcept.id },
              data: {
                conceptType,
                typeFields: concept.typeFields || {},
              },
            });
          }

          // Replace attributes
          await tx.attribute.deleteMany({ where: { conceptId: dbConcept.id } });
          if (normalizedAttrs.length > 0) {
            await tx.attribute.createMany({
              data: normalizedAttrs.map((attr: any) => ({
                ...attr,
                conceptId: dbConcept.id,
              })),
            });
          }

          labelToConcept[cleanLabel] = dbConcept;
          newConceptIds.push(dbConcept.id);
        }

        // Delete concepts that were omitted in full sync (only if we have new concepts to replace them)
        if (newConceptIds.length > 0) {
          await tx.concept.deleteMany({
            where: {
              ontologyId,
              id: { notIn: newConceptIds },
            },
          });
        }

        // 2. Sync Relationships
        await tx.relationship.deleteMany({ where: { ontologyId } });

        let relationshipsCreatedCount = 0;
        const connectedConceptIds = new Set<string>();

        for (const rel of relationships) {
          if (!rel || !rel.source || !rel.target) continue;

          const sourceConcept = findConceptByLabel(rel.source, labelToConcept);
          const targetConcept = findConceptByLabel(rel.target, labelToConcept);

          if (sourceConcept && targetConcept) {
            const relData: any = {
              name: String(rel.name || 'isAssociatedWith').trim(),
              description: rel.description || '',
              cardinality: rel.cardinality || 'one-to-many',
              sourceId: sourceConcept.id,
              targetId: targetConcept.id,
              ontologyId,
            };
            if (rel.propertyType && rel.propertyType !== 'ObjectProperty') {
              relData.propertyType = rel.propertyType;
            }

            await tx.relationship.create({ data: relData });
            connectedConceptIds.add(sourceConcept.id);
            connectedConceptIds.add(targetConcept.id);
            relationshipsCreatedCount++;
          }
        }

        // 2b. Auto-stitch any remaining unconnected orphan concepts
        const primaryConceptId = newConceptIds[0];
        if (primaryConceptId) {
          for (const conceptId of newConceptIds) {
            if (!connectedConceptIds.has(conceptId) && conceptId !== primaryConceptId) {
              await tx.relationship.create({
                data: {
                  name: 'isAssociatedWith',
                  description: 'Auto-stitched relationship to eliminate orphan node',
                  cardinality: 'one-to-many',
                  sourceId: conceptId,
                  targetId: primaryConceptId,
                  ontologyId,
                },
              });
              connectedConceptIds.add(conceptId);
              relationshipsCreatedCount++;
            }
          }
        }

        // 3. Sync Competency Questions
        await tx.competencyQuestion.deleteMany({ where: { ontologyId } });
        let cqsCreatedCount = 0;
        for (const cq of competencyQuestions) {
          if (!cq) continue;
          const qText = String((cq as any)?.question || (cq as any)?.text || cq || '').trim();
          if (!qText) continue;

          await tx.competencyQuestion.create({
            data: {
              question: qText,
              status: (cq as any)?.status || 'Ratified',
              remediation: (cq as any)?.remediation || '',
              ontologyId,
            },
          });
          cqsCreatedCount++;
        }

        // 4. Sync Driver Trees & Edges
        await tx.driverTree.deleteMany({ where: { ontologyId } });
        let driverTreeCreated = false;
        const dbEdges: any[] = [];
        
        for (const tree of driverTrees) {
          if (!tree || !tree.name) continue;
          const dbTree = await tx.driverTree.create({
            data: {
              name: String(tree.name).trim(),
              ontologyId,
            },
          });
          driverTreeCreated = true;

          if (tree.edges && Array.isArray(tree.edges)) {
            for (const edge of tree.edges) {
              if (!edge || !edge.source || !edge.target) continue;

              const sourceConcept = findConceptByLabel(edge.source, labelToConcept);
              const targetConcept = findConceptByLabel(edge.target, labelToConcept);

              if (sourceConcept && targetConcept) {
                const dbEdge = await tx.driverEdge.create({
                  data: {
                    name: edge.name || 'Positively Drives (1.0)',
                    sourceId: sourceConcept.id,
                    targetId: targetConcept.id,
                    treeId: dbTree.id,
                    polarity: edge.polarity || '+',
                    weight: typeof edge.weight === 'number' ? edge.weight : 1.0,
                  },
                });
                dbEdges.push({ source: String(edge.source).trim(), target: String(edge.target).trim(), dbId: dbEdge.id });
              }
            }
          }
        }

        // 5. Sync Perspectives
        await tx.perspective.deleteMany({ where: { ontologyId } });
        let perspectivesCreatedCount = 0;
        for (const pers of (perspectives || [])) {
          if (!pers || !pers.name) continue;

          let personaId = null;
          if (pers.persona) {
            const personaConcept = findConceptByLabel(pers.persona, labelToConcept);
            if (personaConcept) personaId = personaConcept.id;
          }

          const conceptIdsToConnect = (pers.concepts || [])
            .map((label: string) => findConceptByLabel(label, labelToConcept)?.id)
            .filter((id: string) => Boolean(id));

          await tx.perspective.create({
            data: {
              name: String(pers.name).trim(),
              description: pers.description || '',
              personaId,
              ontologyId,
              concepts: {
                connect: conceptIdsToConnect.map((id: string) => ({ id })),
              },
            },
          });
          perspectivesCreatedCount++;
        }

        // 6. Sync Causal Cycles
        await tx.causalCycle.deleteMany({ where: { ontologyId } });
        let causalCyclesCreatedCount = 0;
        for (const cycle of (causalCycles || [])) {
          if (!cycle || !cycle.name) continue;

          const cycleEdgeIds = [];
          for (const edge of (cycle.edges || [])) {
            if (!edge || !edge.source || !edge.target) continue;
            
            const matchedEdge = dbEdges.find(e => 
              e.source.toLowerCase() === String(edge.source).trim().toLowerCase() && 
              e.target.toLowerCase() === String(edge.target).trim().toLowerCase()
            );
            if (matchedEdge) {
              cycleEdgeIds.push({ id: matchedEdge.dbId });
            }
          }

          await tx.causalCycle.create({
            data: {
              name: String(cycle.name).trim(),
              cycleType: cycle.cycleType || 'REINFORCING',
              description: cycle.description || '',
              ontologyId,
              edges: {
                connect: cycleEdgeIds,
              },
            },
          });
          causalCyclesCreatedCount++;
        }

        return {
          conceptsCreated: newConceptIds.length,
          relationshipsCreated: relationshipsCreatedCount,
          cqsCreated: cqsCreatedCount,
          driverTreeCreated,
          perspectivesCreated: perspectivesCreatedCount,
          causalCyclesCreated: causalCyclesCreatedCount,
        };
      });

      const summaryText = `✨ **Ontology Generation Complete!**\n\n- **Concepts Created**: ${summary.conceptsCreated}\n- **Relationships Created**: ${summary.relationshipsCreated}\n- **Competency Questions**: ${summary.cqsCreated}\n- **Driver Tree Generated**: ${summary.driverTreeCreated ? 'Yes' : 'No'}\n- **Persona Perspectives**: ${summary.perspectivesCreated}\n- **Causal Cycles**: ${summary.causalCyclesCreated}`;

      await sendEvent({
        type: 'complete',
        success: true,
        summary: summaryText,
        stats: summary,
      });
    } catch (error: any) {
      console.error("ai-generate error:", error);
      await sendEvent({ type: 'error', error: error.message || 'Failed to generate ontology' });
    } finally {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      try {
        await writer.close();
      } catch {}
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

function findConceptByLabel(rawLabel: string, labelToConcept: Record<string, any>): any | undefined {
  if (!rawLabel) return undefined;
  const clean = rawLabel.trim().toLowerCase();
  
  if (labelToConcept[rawLabel.trim()]) {
    return labelToConcept[rawLabel.trim()];
  }
  
  for (const key of Object.keys(labelToConcept)) {
    if (key.trim().toLowerCase() === clean) {
      return labelToConcept[key];
    }
  }
  
  const removePrefix = (s: string) => {
    return s.replace(/^\[(job|outcome|metric|process|entity|persona|system|event)\]\s*/i, '').trim();
  };
  
  const cleanNoPrefix = removePrefix(clean);
  for (const key of Object.keys(labelToConcept)) {
    const keyCleanNoPrefix = removePrefix(key.toLowerCase());
    if (keyCleanNoPrefix === cleanNoPrefix) {
      return labelToConcept[key];
    }
  }

  const alphaNum = (s: string) => s.replace(/[^a-z0-9]/g, '');
  const cleanAlphaNum = alphaNum(cleanNoPrefix);
  for (const key of Object.keys(labelToConcept)) {
    const keyAlphaNum = alphaNum(removePrefix(key.toLowerCase()));
    if (keyAlphaNum === cleanAlphaNum) {
      return labelToConcept[key];
    }
  }

  return undefined;
}
