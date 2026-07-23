import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { weaveOrphanConcepts } from '@/lib/graphWeaver';
import http from 'http';
import { setGlobalDispatcher, Agent } from 'undici';

// Override global Node.js HTTP server request and headers timeouts (default is 5 mins) to 15 mins
if (http.Server && http.Server.prototype) {
  http.Server.prototype.headersTimeout = 900000;
  http.Server.prototype.requestTimeout = 900000;
  http.Server.prototype.keepAliveTimeout = 900000;
}

// Override global Node.js client-side fetch timeouts (default is 5 mins) to 15 mins
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
    const response = await fetch(`${cleanedUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
      },
      signal: AbortSignal.timeout(900000),
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.15,
        max_tokens: 130000,
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`LM Studio returned an error: ${errText}`);
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
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
        temperature: 0.15
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
        messages: [
          { role: 'user', content: userPrompt }
        ],
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

function cleanAndParseJSON(reply: string): any {
  let jsonString = reply.trim();
  
  // Strip thinking tags if present in reasoning models (e.g. <think>...</think>)
  if (jsonString.includes('</think>')) {
    const parts = jsonString.split('</think>');
    jsonString = parts[parts.length - 1].trim();
  } else if (jsonString.includes('<think>')) {
    const startThink = jsonString.indexOf('<think>');
    const endThink = jsonString.indexOf('</think>');
    if (startThink !== -1 && endThink !== -1) {
      jsonString = (jsonString.substring(0, startThink) + jsonString.substring(endThink + 8)).trim();
    }
  }
  
  // Clean markdown code blocks if present
  if (jsonString.includes('```')) {
    const matches = jsonString.match(/```(?:json)?([\s\S]*?)```/);
    if (matches && matches[1]) {
      jsonString = matches[1].trim();
    }
  }
  
  const firstBrace = jsonString.indexOf('{');
  const lastBrace = jsonString.lastIndexOf('}');
  if (firstBrace !== -1) {
    if (lastBrace !== -1 && lastBrace > firstBrace) {
      jsonString = jsonString.substring(firstBrace, lastBrace + 1);
    } else {
      jsonString = jsonString.substring(firstBrace);
      let openBraces = 0;
      let openBrackets = 0;
      for (let i = 0; i < jsonString.length; i++) {
        if (jsonString[i] === '{') openBraces++;
        else if (jsonString[i] === '}') openBraces--;
        else if (jsonString[i] === '[') openBrackets++;
        else if (jsonString[i] === ']') openBrackets--;
      }
      while (openBrackets > 0) {
        jsonString += ']';
        openBrackets--;
      }
      while (openBraces > 0) {
        jsonString += '}';
        openBraces--;
      }
    }
  }
  return JSON.parse(jsonString);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: ontologyId } = await params;
    const body = await request.json();
    const { prompt, model, templateId, currentOntologyState, activePhase = 1, answers = null, guidanceMode = 'DIRECT', flexibleMode = true } = body;

    if (!prompt || !prompt.trim()) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // Verify ontology exists and load organization details
    const ontology = await db.ontology.findUnique({
      where: { id: ontologyId },
      include: {
        organization: true,
      }
    });

    if (!ontology) {
      return NextResponse.json({ error: 'Ontology not found' }, { status: 404 });
    }

    const activeConfig = await db.llmConfiguration.findFirst({
      where: { isActive: true },
    });
    const provider = activeConfig?.provider || 'LM_STUDIO';

    const orgName = ontology.organization?.name || '';
    const orgDesc = ontology.organization?.description || '';

    const isCart = (orgName || '').toLowerCase().includes('kite') ||
                   (orgDesc || '').toLowerCase().includes('car-t') ||
                   (orgDesc || '').toLowerCase().includes('vein') ||
                   (ontology.industry || '').toLowerCase().includes('car-t') ||
                   (ontology.industry || '').toLowerCase().includes('vein') ||
                   (ontology.industry || '').toLowerCase().includes('cell therapy') ||
                   (ontology.industry || '').toLowerCase().includes('cell & gene');

    let cartInstruction = '';
    if (isCart) {
      cartInstruction = `\nSPECIAL CAR-T / CELL THERAPY MODEL REQUIREMENT: This is a CAR-T / Cell Therapy (autologous vein-to-vein model) organization. You MUST explicitly tailor the processes, metrics, competency questions, and driver trees to autologous cell therapy workflows. This includes patient slot scheduling, leukapheresis, Chain of Custody (COC) and Chain of Identity (COI), ultra-cold / cryogenic logistics, cell manufacturing/engineering (processing, activation, transduction, expansion), Quality Control release testing, and patient re-infusion. Avoid generic small molecule R&D/manufacturing.`;
    }

    const lmStudioUrl = process.env.LM_STUDIO_URL || 'http://localhost:1234/v1';

    // Format User intent by attaching any submitted answers from the Probing flow
    let userIntent = prompt;
    if (answers && Object.keys(answers).length > 0) {
      userIntent += "\n\nUser Clarification Answers:\n" + Object.entries(answers).map(([q, a]) => `- Question: ${q}\n  Answer: ${a}`).join('\n');
    }

    // 1. Classifier / Probing Pass
    // Check if the request is detailed enough. If not, return interactive probing questions
    const classifierSystemPrompt = `You are the AI Ontology Classifier.
We are modeling an ontology for:
${orgName ? `- Organization Name: ${orgName}` : ''}
${orgDesc ? `- Organization Description: ${orgDesc}` : ''}
- Industry: ${ontology.industry || 'General'}
- Business Function: ${ontology.businessFunction || 'General'}
- Business Objective: ${ontology.objective || 'General Expansion'}

Determine if the user's request is specific enough to build or refine the ontology without guessing.
If the prompt is vague (e.g. "add metrics", "make a sales model", "change processes") and lacks concrete labels, names, or clear mappings, you must generate a JSON object containing 2-3 specific, helpful probing questions to clarify their intent (e.g. target processes, key performance indicators, or personas).
Format:
{
  "probingQuestions": [
    "Probing question 1",
    "Probing question 2"
  ]
}

If the prompt contains concrete names, specific guidelines, or answers/clarifications, reply with exactly "PROCEED".`;

    let finalJSON = null;
    let probingResponse = null;

    // Load template if provided to inject causal cycle constraints
    let template = null;
    let metricNames: string[] = [];
    let templateCausalEdges: any[] = [];

    if (templateId) {
      template = await db.promptTemplate.findUnique({
        where: { id: templateId },
      });
      if (template) {
        templateCausalEdges = (template.causalCycles as any[]) || [];
        metricNames = Array.from(new Set(templateCausalEdges.flatMap(c => [c.source, c.target])));
      }
    }

    try {
      // 1. Classifier / Probing Pass (Only if in INTERACTIVE mode)
      if (guidanceMode === 'INTERACTIVE') {
        let classifierReply = await callLLMProvider(classifierSystemPrompt, userIntent);
        
        if (classifierReply.trim().toUpperCase() !== 'PROCEED' && classifierReply.includes('probingQuestions')) {
          try {
            const parsedProbes = cleanAndParseJSON(classifierReply);
            if (parsedProbes.probingQuestions && parsedProbes.probingQuestions.length > 0) {
              probingResponse = parsedProbes.probingQuestions;
            }
          } catch (err) {
            console.warn('Failed to parse classifier probing questions, proceeding to default generation flow.');
          }
        }
      }
      if (!probingResponse) {
        // Include Industry, Function, Objective in base prompts if they exist
        const ontologyContextPrompt = `ONTOLOGY CONTEXT PROFILE:
${orgName ? `- Organization Name: ${orgName}` : ''}
${orgDesc ? `- Organization Description: ${orgDesc}` : ''}
- Industry: ${ontology.industry || 'General'}
- Business Function: ${ontology.businessFunction || 'General'}
- Business Objective: ${ontology.objective || 'General Expansion'}`;

        const baseSystemPrompt = `You are the AI Ontology Modeler Assistant.
Your task is to refine and update a business ontology based on the user's description.
You are running in a Guided Modeler Wizard on Phase ${activePhase} out of 4:
Phase 1: Processes & Entities (Core workflows, actors, and objects)
Phase 2: Process Metrics (Operational and analytical KPIs/indicators)
Phase 3: Competency Questions (CQs that the model must satisfy)
Phase 4: Causal Driver Trees & Causal Cycles (Hypothesis dependency chains between metrics)
${ontologyContextPrompt}${cartInstruction}
You must output a single, valid JSON object representing the COMPLETE updated state of the ontology.
Strictly adhere to the schema below:
{
  "concepts": [
    {
      "label": "ConceptLabel",
      "conceptType": "Entity|Metric|Process|Persona",
      "description": "Short description",
      "attributes": [
        { "name": "attrName", "datatype": "string|integer|float|boolean", "description": "description" }
      ],
      "typeFields": {
        "grouping": "Geography (Optional grouping classification, e.g. Geography for Territory, Region, Nation)",
        "owner": "Role/Actor owning the process (Only if Process)",
        "inputs": ["List of labels of input concepts (Only if Process)"],
        "outputs": ["List of labels of output concepts (Only if Process)"]
      }
    }
  ],
  "relationships": [
    {
      "name": "relationshipName",
      "description": "Short description",
      "source": "SourceConceptLabel",
      "target": "TargetConceptLabel",
      "cardinality": "one-to-many"
    }
  ],
  "competencyQuestions": [
    {
      "question": "Question text?",
      "status": "Draft|Verified",
      "remediation": "Actions if unsatisfied"
    }
  ],
  "driverTrees": [
    {
      "name": "TreeName",
      "edges": [
        { "name": "Positively Drives (1.0)", "source": "SrcMetricLabel", "target": "TgtMetricLabel" }
      ]
    }
  ],
  "perspectives": [
    {
      "name": "PerspectiveName (e.g. Sales Representative View)",
      "description": "Short description",
      "persona": "PersonaConceptLabel",
      "concepts": ["List", "Of", "Concept", "Labels", "Included"]
    }
  ],
  "causalCycles": [
    {
      "name": "CycleFeedbackLoopName",
      "cycleType": "REINFORCING|BALANCING",
      "description": "Short description of feedback cycle",
      "edges": [
        { "source": "SrcMetricLabel", "target": "TgtMetricLabel" }
      ]
    }
  ]
}

Rules:
1. Use CamelCase for concept labels (e.g. "VeintoVeinCycleTime") and camelCase for attributes (e.g. "cycleTimeMs").
2. The relationships "source" and "target" MUST exactly match one of the "label" properties in the "concepts" list.
3. Every "Metric" concept should be connected to the Entity/Process it measures (e.g., source: "DataIntegrityScore", name: "measuresEntity", target: "PatientRegistry").
4. Under "driverTrees" and "causalCycles", the edge "source" and "target" must be Metric concepts. Use names like "Positively Drives (X.Y)" or "Negatively Drives (X.Y)".
5. MANDATORY 100% GRAPH CONNECTIVITY WEAVING: Every concept created MUST have at least ONE directional relationship (source or target). Weave Personas -> Processes -> Events -> Entities -> Systems -> Metrics into connected relational pathways. Zero orphan concepts allowed.
6. INCREMENTAL MODELING & DATA RETENTION (CRITICAL):
   - You MUST carefully preserve all pre-existing concepts, relationships, competency questions, causal cycles, perspectives, and driver trees. Only add new elements, update existing ones, or delete specific ones if explicitly asked by the user.
   - NEVER omit or drop any existing nodes or relationships from the final JSON output unless the user specifically requests their deletion. Keeping the existing seed/imported ontology intact is extremely important.
   - If the user asks to "connect unconnected nodes", you must find logical relationships to connect them, but you MUST NOT delete any unconnected nodes that you are unable to connect. Keep them in the concepts list!
7. UNIQUE CONCEPT LABELS (CRITICAL): Every concept in the 'concepts' list MUST have a unique label. Do NOT create duplicate concept labels with different conceptTypes (e.g. having both an Entity named "PatientRegistry" and a Process named "PatientRegistry" is illegal). If they refer to the same domain concept, consolidate them into a single concept (prefer Process for work tasks, Entity for physical objects/data). If they are distinct, name them clearly (e.g. "PatientRegistryProcess" and "PatientRegistryDataset").
8. UNIQUE CONCEPT RESOLUTION: Avoid near-duplicate labels representing the same concept (e.g. "Patient" and "Patients", or "QualityControlRelease" and "QualifyControlRelease"). Standardize on a single, clean label to keep the graph unified.
${flexibleMode ? `9. FLEXIBLE MODE:
   - You can use natural, clean concept labels without requiring any strict prefixes.` : `9. JTBD & DSRP MODELING:
   - User Jobs to be Done must be represented as Process concepts prefixed with '[JOB] ' (e.g., '[JOB] MinimizeTreatmentDelay').
   - Desired Outcomes must be represented as Metric concepts prefixed with '[OUTCOME] ' (e.g., '[OUTCOME] ReductionInFailureRates').
   - Link '[JOB]' concepts to related personas ('Perspectives') and operational processes. Link '[OUTCOME]' concepts to their jobs ('Relationships') and causal metrics.`}
10. Return ONLY the JSON object. Do not wrap in markdown \`\`\`json blocks or add any other text.
11. REASONING CONSTRAINTS (CRITICAL): Keep your internal thinking/reasoning extremely concise (at most 3-4 sentences). Do NOT generate long reasoning cycles. Transition to the JSON output as quickly as possible.`;

        // Configure Agent 1 (Generator)
        let generatorSystemPrompt = `${baseSystemPrompt}`;
        if (currentOntologyState) {
          generatorSystemPrompt += `\n\nCURRENT ONTOLOGY STATE (JSON):\n${JSON.stringify(currentOntologyState, null, 2)}\n\nApply the user's instructions incrementally to this state, adding, modifying, or deleting nodes/edges as requested, and return the complete updated state structure.`;
        }

        if (metricNames.length > 0) {
          generatorSystemPrompt += `\n\nTEMPLATE CAUSAL CONSTRAINT: Ensure you include these Metric concepts if not already there: ${metricNames.join(', ')}. Treat them as conceptType "Metric".`;
          if (templateCausalEdges.length > 0) {
            generatorSystemPrompt += `\nEnsure the causal edges in driverTrees reflect: ${templateCausalEdges.map(e => `${e.source} -> ${e.target}`).join(', ')}`;
          }
        }

        // Inject PHARMA BUSINESS ACCURACY RULES if industry is pharmaceuticals (Only in strict/non-flexible mode)
        if (!flexibleMode && (ontology.industry || '').toLowerCase().includes('pharm')) {
          generatorSystemPrompt += `
\n\nPHARMA BUSINESS ACCURACY RULES:
1. REVENUE RELATIONSHIP:
   - "Revenue" is driven directly by "PatientsTreated".
   - "PatientsTreated" is driven directly by: "PatientAwareness", "PhysicianAwareness", and "ReimbursementCoverage".
2. REIMBURSEMENT RELATIONSHIP:
   - "ReimbursementCoverage" is directly driven by "ProvenEfficacy" and "HEORAnalytics".
3. PHYSICIAN AWARENESS RELATIONSHIP:
   - "PhysicianAwareness" is directly driven by:
     - "PersonnelPromotion" (Sales Call / Speaker Programs)
     - "PeerToPeerAwareness" (Speaker Programs, Congress Events)
     - "NonPersonnelPromotion" (Digital, Email, Websites, Publications, Clinical Trials)
Ensure you structure the concepts, relationships, and causal driverTrees/causalCycles to strictly incorporate these domain pathways.`;
        }

        // Executing Agent 1: Generation Pass
        const genReply = await callLLMProvider(generatorSystemPrompt, userIntent);
        let genJSON = cleanAndParseJSON(genReply);

        finalJSON = genJSON;

        // Bypassing secondary Auditor & Corrector passes for slow local LM_STUDIO models.
        // Local reasoning models (e.g. gemma-4-12b-qat) perform their own self-auditing internally,
        // and running three sequential passes would exceed Node's default 5-minute HTTP request timeout.
        if (provider !== 'LM_STUDIO') {
          // Executing Agent 2: Audit & Validation Pass
          const auditorSystemPrompt = `You are the AI Business Domain Auditor.
Your job is to review the proposed ontology JSON and audit it for correctness, completeness, and business accuracy.

${ontologyContextPrompt}

${!flexibleMode && (ontology.industry || '').toLowerCase().includes('pharm') ? `PHARMA BUSINESS ACCURACY CHECKLIST (Only apply if pharmaceuticals-related):
1. Does "Revenue" link as a direct outcome of "PatientsTreated"?
2. Is "PatientsTreated" driven by "PatientAwareness", "PhysicianAwareness", and "ReimbursementCoverage"?
3. Is "ReimbursementCoverage" driven by "ProvenEfficacy" and "HEORAnalytics"?
4. Is "PhysicianAwareness" driven by personnel and non-personnel promotions?
5. Ensure every concept label is unique. While forming a connected model is highly encouraged, pre-existing unconnected (orphan) nodes or disconnected subgraphs are fully legal and normal (e.g. from imported files). Do NOT complain about or order the deletion of unconnected nodes or isolated subgraphs.` : `BUSINESS ACCURACY CHECKLIST:
1. Ensure the concepts align logically with the user request and standard business logic.
2. Ensure every concept label is unique. While forming a connected model is highly encouraged and new concepts should be connected, pre-existing unconnected (orphan) nodes or disconnected subgraphs are fully legal and normal (e.g. from imported files). Do NOT complain about or order the deletion of unconnected nodes or isolated subgraphs.
3. Validate that all relationships refer to existing concept labels.`}

Review the proposed JSON:
${JSON.stringify(genJSON, null, 2)}

If the JSON strictly follows all business rules and is structurally correct, reply with exactly "ACCURATE".
Otherwise, list the specific errors and the corrections that need to be made.`;

          let auditReply = await callLLMProvider(auditorSystemPrompt, "Audit the ontology JSON for domain and business accuracy.");

          if (auditReply.trim().toUpperCase() !== 'ACCURATE') {
            // Executing Agent 3: Correction Pass
            const correctorSystemPrompt = `You are the AI Ontology Corrector.
Your task is to fix the ontology JSON according to the Auditor's critique.

Auditor Critique:
${auditReply}

Current JSON:
${JSON.stringify(genJSON, null, 2)}

Apply the auditor's corrections to make the ontology accurate. Ensure all concepts match their types, all source/target labels match, all concept labels are unique (no duplicates or near-duplicates), and do NOT delete any pre-existing unconnected concepts or isolated subgraphs. Return ONLY the final corrected JSON. Do not write any markdown code blocks.`;

            const correctionReply = await callLLMProvider(correctorSystemPrompt, "Output the corrected JSON.");
            finalJSON = cleanAndParseJSON(correctionReply);
          }
        }

        // Apply Deterministic Graph Weaver to guarantee 100% connectivity and rich attributes
        if (finalJSON) {
          finalJSON = weaveOrphanConcepts(finalJSON);
        }
      }
    } catch (llmErr: any) {
      console.warn("LLM Ontology generation/classifier pipeline failed, seeding fallback ontology. Error:", llmErr.message);
      finalJSON = generateFallbackOntology(ontology);
    }

    if (probingResponse) {
      return NextResponse.json({ probingQuestions: probingResponse });
    }

    if (!finalJSON) {
      finalJSON = generateFallbackOntology(ontology);
    }

    const { 
      concepts = [], 
      relationships = [], 
      competencyQuestions = [], 
      driverTrees = [],
      perspectives = [],
      causalCycles = []
    } = finalJSON;

    // Use a transaction to perform Full State Synchronization
    const summary = await db.$transaction(async (tx: any) => {
      // 1. Sync Concepts
      const labelToConcept: Record<string, any> = {};
      const newConceptIds: string[] = [];

      for (const concept of concepts) {
        if (!concept.label) continue;
        const cleanLabel = concept.label.trim();
        
        let conceptType = concept.conceptType || 'Entity';
        if (metricNames.some(m => m.toLowerCase() === cleanLabel.toLowerCase())) {
          conceptType = 'Metric';
        }

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
                create: (concept.attributes || []).map((attr: any) => ({
                  name: attr.name.trim(),
                  datatype: attr.datatype || 'string',
                  description: attr.description || '',
                  required: !!attr.required,
                })),
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
        if (concept.attributes && concept.attributes.length > 0) {
          await tx.attribute.createMany({
            data: concept.attributes.map((attr: any) => ({
              name: attr.name.trim(),
              datatype: attr.datatype || 'string',
              description: attr.description || '',
              required: !!attr.required,
              conceptId: dbConcept.id,
            })),
          });
        }

        labelToConcept[cleanLabel] = dbConcept;
        newConceptIds.push(dbConcept.id);
      }

      // Delete concepts that were omitted in the AI full sync
      await tx.concept.deleteMany({
        where: {
          ontologyId,
          id: { notIn: newConceptIds },
        },
      });

      // 2. Sync Relationships
      await tx.relationship.deleteMany({ where: { ontologyId } });

      let relationshipsCreatedCount = 0;
      const connectedConceptIds = new Set<string>();

      for (const rel of relationships) {
        if (!rel.name || !rel.source || !rel.target) continue;

        const sourceConcept = findConceptByLabel(rel.source, labelToConcept);
        const targetConcept = findConceptByLabel(rel.target, labelToConcept);

        if (sourceConcept && targetConcept) {
          const relData: any = {
            name: rel.name.trim(),
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
      for (const cq of competencyQuestions) {
        if (!cq.question) continue;
        await tx.competencyQuestion.create({
          data: {
            question: cq.question.trim(),
            status: cq.status || 'Draft',
            remediation: cq.remediation || '',
            ontologyId,
          },
        });
      }

      // 4. Sync Driver Trees & Edges
      await tx.driverTree.deleteMany({ where: { ontologyId } });

      let driverTreeCreated = false;
      const dbEdges: any[] = [];
      
      for (const tree of driverTrees) {
        if (!tree.name) continue;
        const dbTree = await tx.driverTree.create({
          data: {
            name: tree.name.trim(),
            ontologyId,
          },
        });
        driverTreeCreated = true;

        if (tree.edges && tree.edges.length > 0) {
          for (const edge of tree.edges) {
            if (!edge.source || !edge.target) continue;

            const sourceConcept = findConceptByLabel(edge.source, labelToConcept);
            const targetConcept = findConceptByLabel(edge.target, labelToConcept);

            if (sourceConcept && targetConcept) {
              const dbEdge = await tx.driverEdge.create({
                data: {
                  name: edge.name || 'Positively Drives (1.0)',
                  sourceId: sourceConcept.id,
                  targetId: targetConcept.id,
                  treeId: dbTree.id,
                },
              });
              dbEdges.push({ source: edge.source.trim(), target: edge.target.trim(), dbId: dbEdge.id });
            }
          }
        }
      }

      // If no driver trees returned, fallback to seed template driver trees if applicable
      if (!driverTreeCreated && templateCausalEdges.length > 0) {
        const dbTree = await tx.driverTree.create({
          data: {
            name: `${template?.businessFunction || 'Causal'} Performance Tree`,
            ontologyId,
          },
        });
        driverTreeCreated = true;
        for (const edge of templateCausalEdges) {
          const sourceConcept = findConceptByLabel(edge.source, labelToConcept);
          const targetConcept = findConceptByLabel(edge.target, labelToConcept);

          if (sourceConcept && targetConcept) {
            const dbEdge = await tx.driverEdge.create({
              data: {
                name: `${edge.polarity === '+' ? 'Positively' : 'Negatively'} Drives (${edge.weight})`,
                sourceId: sourceConcept.id,
                targetId: targetConcept.id,
                treeId: dbTree.id,
              },
            });
            dbEdges.push({ source: edge.source, target: edge.target, dbId: dbEdge.id });
          }
        }
      }

      // 5. Sync Perspectives
      await tx.perspective.deleteMany({ where: { ontologyId } });
      for (const pers of (perspectives || [])) {
        if (!pers.name) continue;

        let personaId = null;
        if (pers.persona) {
          const personaConcept = findConceptByLabel(pers.persona, labelToConcept);
          if (personaConcept) personaId = personaConcept.id;
        }

        const conceptIdsToConnect = (pers.concepts || [])
          .map((label: string) => findConceptByLabel(label, labelToConcept)?.id)
          .filter((id: string) => !!id);

        await tx.perspective.create({
          data: {
            name: pers.name.trim(),
            description: pers.description || '',
            personaId,
            ontologyId,
            concepts: {
              connect: conceptIdsToConnect.map((id: string) => ({ id })),
            },
          },
        });
      }

      // 6. Sync Causal Cycles (Feedback Loops)
      await tx.causalCycle.deleteMany({ where: { ontologyId } });
      for (const cycle of (causalCycles || [])) {
        if (!cycle.name) continue;

        const cycleEdgeIds = [];
        for (const edge of (cycle.edges || [])) {
          if (!edge.source || !edge.target) continue;
          
          // Match with edges created in this transaction
          const matchedEdge = dbEdges.find(e => 
            e.source.toLowerCase() === edge.source.trim().toLowerCase() && 
            e.target.toLowerCase() === edge.target.trim().toLowerCase()
          );
          if (matchedEdge) {
            cycleEdgeIds.push({ id: matchedEdge.dbId });
          }
        }

        await tx.causalCycle.create({
          data: {
            name: cycle.name.trim(),
            cycleType: cycle.cycleType || 'REINFORCING',
            description: cycle.description || '',
            ontologyId,
            edges: {
              connect: cycleEdgeIds,
            },
          },
        });
      }

      const stats = {
        conceptsCreated: newConceptIds.length,
        relationshipsCreated: relationshipsCreatedCount,
        cqsCreated: competencyQuestions.length,
        driverTreeCreated,
        perspectivesCreated: perspectives.length,
        causalCyclesCreated: causalCycles.length,
      };
      return stats;
    });

    const summaryText = `✨ **Ontology Generation Complete!**\n\n- **Concepts Created**: ${summary.conceptsCreated}\n- **Relationships Created**: ${summary.relationshipsCreated}\n- **Competency Questions**: ${summary.cqsCreated}\n- **Driver Tree Generated**: ${summary.driverTreeCreated ? 'Yes' : 'No'}\n- **Persona Perspectives**: ${summary.perspectivesCreated}\n- **Causal Cycles**: ${summary.causalCyclesCreated}`;

    return NextResponse.json({
      summary: summaryText,
      stats: summary,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to generate ontology' }, { status: 500 });
  }
}

function generateFallbackOntology(ontology: any): any {
  const industry = ontology.industry || 'General';
  const businessFunction = ontology.businessFunction || 'General';
  const objective = ontology.objective || 'General Expansion';
  const orgName = ontology.organization?.name || '';
  const orgDesc = ontology.organization?.description || '';

  const isCart = (orgName || '').toLowerCase().includes('kite') ||
                 (orgDesc || '').toLowerCase().includes('car-t') ||
                 (orgDesc || '').toLowerCase().includes('vein') ||
                 (industry || '').toLowerCase().includes('car-t') ||
                 (industry || '').toLowerCase().includes('vein') ||
                 (industry || '').toLowerCase().includes('cell therapy') ||
                 (industry || '').toLowerCase().includes('cell & gene');

  // Base domain structures
  let concepts: any[] = [];
  let relationships: any[] = [];
  let competencyQuestions: any[] = [];
  let driverTrees: any[] = [];
  let causalCycles: any[] = [];
  let perspectives: any[] = [];

  const isPharma = (industry.toLowerCase().includes('pharm') || industry.toLowerCase().includes('life') || 
                    industry.toLowerCase().includes('biotech') || ontology.name.toLowerCase().includes('pharma') || isCart);

  const isCartProcess = businessFunction.toLowerCase().includes('enroll') || 
                        businessFunction.toLowerCase().includes('schedul') || 
                        businessFunction.toLowerCase().includes('v2v') || 
                        businessFunction.toLowerCase().includes('vein') || 
                        businessFunction.toLowerCase().includes('apheresis') || 
                        businessFunction.toLowerCase().includes('logistics') || 
                        businessFunction.toLowerCase().includes('supply') || 
                        businessFunction.toLowerCase().includes('manufactur') || 
                        businessFunction.toLowerCase().includes('qual') || 
                        businessFunction.toLowerCase().includes('cell');

  if (isCart && isCartProcess) {
    concepts = [
      { label: "PatientBatch", conceptType: "Entity", description: "The autologous patient batch containing patient leukapheresis cells." },
      { label: "ChainOfIdentity", conceptType: "Entity", description: "The critical COI tracking record linking the patient to their specific CAR-T product." },
      { label: "CryoCourier", conceptType: "Persona", description: "Specialized cold-chain courier certified to transport LN2 shippers." },
      { label: "[JOB] TrackVeinToVeinLogistics", conceptType: "Process", description: "Logistical operation tracking shipment from apheresis site to manufacturing slot.", typeFields: { owner: "V2VLogisticsCoordinator" } },
      { label: "LN2ShipperTemperature", conceptType: "Metric", description: "Specialized cryogenic dry shipper sensor temperature reading." },
      { label: "VeinToVeinCycleTime", conceptType: "Metric", description: "Total duration from leukapheresis collection to final patient cell infusion." }
    ];
    relationships = [
      { name: "performsJob", description: "Courier executes cold-chain transport tracking", source: "CryoCourier", target: "[JOB] TrackVeinToVeinLogistics" },
      { name: "tracksBatch", description: "Logistics tracking monitors patient cell batch", source: "[JOB] TrackVeinToVeinLogistics", target: "PatientBatch" },
      { name: "hasCOI", description: "Patient cell batch has Chain of Identity record", source: "PatientBatch", target: "ChainOfIdentity" },
      { name: "monitorsTemp", description: "Logistics process tracks LN2 container temperature", source: "[JOB] TrackVeinToVeinLogistics", target: "LN2ShipperTemperature" },
      { name: "measuresCycleTime", description: "Vein-to-vein time measures logistics process duration", source: "VeinToVeinCycleTime", target: "[JOB] TrackVeinToVeinLogistics" }
    ];
    competencyQuestions = [
      { question: "What is the average vein-to-vein time for autologous batches?", status: "Draft" },
      { question: "Have any dry shippers exceeded -150C during transit?", status: "Draft" }
    ];
  } else if (isPharma) {
    if (businessFunction.toLowerCase().includes('access') || businessFunction.toLowerCase().includes('reimburse') || businessFunction.toLowerCase().includes('formulary')) {
      concepts = [
        { label: "PayerSegment", conceptType: "Entity", description: "Target healthcare insurance provider segment (e.g., Commercial, Medicare Advantage)." },
        { label: "ValueDossier", conceptType: "Entity", description: "AMCP formatted health economics value dossier for drug reimbursement." },
        { label: "[JOB] SubmitFormularyDossier", conceptType: "Process", description: "Process of compiling and filing HEOR dossiers to P&T boards.", typeFields: { owner: "MarketAccessDirector" } },
        { label: "FormularyStatus", conceptType: "Entity", description: "Current tier placement and coverage rules on standard drug lists." },
        { label: "MedicaidCeilingPrice", conceptType: "Metric", description: "Calculated government pricing limit and discount cap." },
        { label: "ValueBasedReimbursementRate", conceptType: "Metric", description: "Payer reimbursement rate based on patient real-world outcomes." },
        { label: "[OUTCOME] AccelerateFormularyApproval", conceptType: "Metric", description: "Minimize time-to-formulary inclusion and approval cycles." },
        { label: "MarketAccessDirector", conceptType: "Persona", description: "Manages pricing, contracting, and payer submissions." }
      ];
      relationships = [
        { name: "performsJob", description: "Director manages and executes the formulary submission process.", source: "MarketAccessDirector", target: "[JOB] SubmitFormularyDossier", cardinality: "one-to-many" },
        { name: "utilizesDossier", description: "The submission process utilizes AMCP value dossiers.", source: "[JOB] SubmitFormularyDossier", target: "ValueDossier", cardinality: "one-to-many" },
        { name: "submittedTo", description: "Value dossiers are submitted to target payer segments.", source: "ValueDossier", target: "PayerSegment", cardinality: "one-to-many" },
        { name: "determinesStatus", description: "Payer evaluation determines the product formulary status.", source: "PayerSegment", target: "FormularyStatus", cardinality: "one-to-one" },
        { name: "measuresProcess", description: "Reimbursement rate measures submission pricing effectiveness.", source: "ValueBasedReimbursementRate", target: "[JOB] SubmitFormularyDossier", cardinality: "one-to-one" },
        { name: "constrainsPricing", description: "Government ceiling prices constrain general reimbursement rates.", source: "MedicaidCeilingPrice", target: "ValueBasedReimbursementRate", cardinality: "one-to-many" },
        { name: "drivesOutcome", description: "Reimbursement rate directly affects overall formulary approval.", source: "ValueBasedReimbursementRate", target: "[OUTCOME] AccelerateFormularyApproval", cardinality: "one-to-one" }
      ];
      competencyQuestions = [
        { question: "What is the average HEOR dossier validation time for Medicare Advantage plans?", status: "Draft", remediation: "Verify data logger timestamps." },
        { question: "Do value-based pricing terms align with Phase III outcomes data?", status: "Draft", remediation: "Review payer risk contracts." }
      ];
      driverTrees = [
        {
          name: "Market Access Performance Tree",
          edges: [
            { name: "Positively Drives (0.8)", source: "ValueBasedReimbursementRate", target: "[OUTCOME] AccelerateFormularyApproval" },
            { name: "Negatively Drives (0.5)", source: "MedicaidCeilingPrice", target: "ValueBasedReimbursementRate" }
          ]
        }
      ];
    } else if (businessFunction.toLowerCase().includes('marketing') || businessFunction.toLowerCase().includes('brand')) {
      concepts = [
        { label: "PhysicianSegment", conceptType: "Entity", description: "Target prescriber audience profile based on patient volume." },
        { label: "BrandCampaign", conceptType: "Entity", description: "Multi-channel campaign built around approved indications." },
        { label: "[JOB] MapIndicationMessaging", conceptType: "Process", description: "Developing digital and print messaging aligned with FDA guidelines.", typeFields: { owner: "BrandManager" } },
        { label: "KOLSpeakerBureau", conceptType: "Entity", description: "Key Opinion Leader network certified for product presentations." },
        { label: "AdPromoComplianceRate", conceptType: "Metric", description: "Percentage of campaign assets cleared by OPDP regulations." },
        { label: "BrandShareOfVoice", conceptType: "Metric", description: "Relative presence of brand messaging in target segments." },
        { label: "[OUTCOME] MaximizePhysicianEngagement", conceptType: "Metric", description: "Achieve highest target prescriber interaction rate." },
        { label: "BrandManager", conceptType: "Persona", description: "Coordinates campaign assets and regulatory approvals." }
      ];
      relationships = [
        { name: "managesCampaign", description: "Brand manager manages the brand campaign execution.", source: "BrandManager", target: "BrandCampaign", cardinality: "one-to-many" },
        { name: "executesProcess", description: "Campaign delivery requires mapping the indication messaging.", source: "BrandCampaign", target: "[JOB] MapIndicationMessaging", cardinality: "one-to-many" },
        { name: "engagesBureau", description: "Messaging mapping utilizes the KOL speaker bureau network.", source: "[JOB] MapIndicationMessaging", target: "KOLSpeakerBureau", cardinality: "one-to-many" },
        { name: "targetsSegment", description: "Speaker bureau activities target specific physician segments.", source: "KOLSpeakerBureau", target: "PhysicianSegment", cardinality: "one-to-many" },
        { name: "measuresProcess", description: "Compliance rate measures indication messaging adherence.", source: "AdPromoComplianceRate", target: "[JOB] MapIndicationMessaging", cardinality: "one-to-one" },
        { name: "measuresCampaign", description: "Share of voice measures brand campaign market presence.", source: "BrandShareOfVoice", target: "BrandCampaign", cardinality: "one-to-one" },
        { name: "drivesOutcome", description: "Share of voice drives physician engagement.", source: "BrandShareOfVoice", target: "[OUTCOME] MaximizePhysicianEngagement", cardinality: "one-to-one" }
      ];
      competencyQuestions = [
        { question: "What is the OPDP ad-promo approval turnaround time for brand assets?", status: "Draft", remediation: "Review regulatory log." }
      ];
      driverTrees = [
        {
          name: "Pharma Brand Performance Tree",
          edges: [
            { name: "Positively Drives (0.9)", source: "AdPromoComplianceRate", target: "BrandShareOfVoice" },
            { name: "Positively Drives (0.7)", source: "BrandShareOfVoice", target: "[OUTCOME] MaximizePhysicianEngagement" }
          ]
        }
      ];
    } else {
      concepts = [
        { label: "PhysicianRepDetailing", conceptType: "Process", description: "Medical representative detail visit to targeted physician.", typeFields: { owner: "MedicalRepresentative" } },
        { label: "DrugSampleInventory", conceptType: "Entity", description: "Physically distributed therapeutic samples." },
        { label: "PhysicianSignatureLog", conceptType: "Entity", description: "Electronic records verifying sample receipts." },
        { label: "PhysicianPrescriptionRate", conceptType: "Metric", description: "Prescribing volume within targeted indication list." },
        { label: "PDMASampleDiscrepancyCount", conceptType: "Metric", description: "Number of signature discrepancies during PDMA auditing." },
        { label: "[OUTCOME] MaximizeDetailingAdherence", conceptType: "Metric", description: "Prescriber message recall velocity." },
        { label: "MedicalRepresentative", conceptType: "Persona", description: "Conducts detailing visits in designated sales territory." }
      ];
      relationships = [
        { name: "requiresSignature", description: "Sample distribution requires e-signature receipt.", source: "DrugSampleInventory", target: "PhysicianSignatureLog", cardinality: "one-to-one" },
        { name: "performsDetailing", description: "Medical rep conducts the detailing visit.", source: "MedicalRepresentative", target: "PhysicianRepDetailing", cardinality: "one-to-many" }
      ];
      competencyQuestions = [
        { question: "Does the detailing message recall align with field training guidelines?", status: "Draft", remediation: "Audit detail slides." }
      ];
      driverTrees = [
        {
          name: "Pharma Sales Performance Tree",
          edges: [
            { name: "Positively Drives (0.85)", source: "PhysicianPrescriptionRate", target: "[OUTCOME] MaximizeDetailingAdherence" },
            { name: "Negatively Drives (0.6)", source: "PDMASampleDiscrepancyCount", target: "PhysicianPrescriptionRate" }
          ]
        }
      ];
      causalCycles = [
        {
          name: "Sample Compliance Feedback Loop",
          cycleType: "BALANCING",
          description: "High discrepancy counts trigger increased auditing, which reduces sample discrepancies over time.",
          edges: [
            { source: "PDMASampleDiscrepancyCount", target: "PhysicianPrescriptionRate" },
            { source: "PhysicianPrescriptionRate", target: "PDMASampleDiscrepancyCount" }
          ]
        }
      ];
      perspectives = [
        {
          name: "Medical Sales Representative Perspective",
          description: "Focuses on rep activities, sample distributions, and detailing success metrics.",
          persona: "MedicalRepresentative",
          concepts: ["PhysicianRepDetailing", "DrugSampleInventory", "PhysicianSignatureLog", "MedicalRepresentative"]
        }
      ];
    }
  } else {
    concepts = [
      { label: "TargetCustomer", conceptType: "Entity", description: "Primary customer segment." },
      { label: "OperationalProcess", conceptType: "Process", description: "Core workflow steps.", typeFields: { owner: "BusinessAnalyst" } },
      { label: "OperationalCycleTime", conceptType: "Metric", description: "Execution duration." },
      { label: "[OUTCOME] MaximizeServiceVelocity", conceptType: "Metric", description: "Service velocity outcome metric." },
      { label: "BusinessAnalyst", conceptType: "Persona", description: "Models and audits workflows." }
    ];
    relationships = [
      { name: "analyzesProcess", description: "Analyst reviews operational process.", source: "BusinessAnalyst", target: "OperationalProcess", cardinality: "one-to-many" },
      { name: "servesCustomer", description: "Operational process serves the target customer segment.", source: "OperationalProcess", target: "TargetCustomer", cardinality: "one-to-many" },
      { name: "measuresProcess", description: "Cycle time measures process duration.", source: "OperationalCycleTime", target: "OperationalProcess", cardinality: "one-to-one" },
      { name: "drivesOutcome", description: "Cycle time directly drives overall service velocity.", source: "OperationalCycleTime", target: "[OUTCOME] MaximizeServiceVelocity", cardinality: "one-to-one" }
    ];
    competencyQuestions = [
      { question: "Does cycle time meet standard SLA constraints?", status: "Draft", remediation: "Review time logs." }
    ];
    driverTrees = [
      {
        name: "General Operations Tree",
        edges: [
          { name: "Negatively Drives (0.85)", source: "OperationalCycleTime", target: "[OUTCOME] MaximizeServiceVelocity" }
        ]
      }
    ];
  }

  return {
    concepts,
    relationships,
    competencyQuestions,
    driverTrees,
    causalCycles,
    perspectives
  };
}

function findConceptByLabel(rawLabel: string, labelToConcept: Record<string, any>): any | undefined {
  if (!rawLabel) return undefined;
  const clean = rawLabel.trim().toLowerCase();
  
  // 1. Try exact match first
  if (labelToConcept[rawLabel.trim()]) {
    return labelToConcept[rawLabel.trim()];
  }
  
  // 2. Try exact case-insensitive match
  for (const key of Object.keys(labelToConcept)) {
    if (key.trim().toLowerCase() === clean) {
      return labelToConcept[key];
    }
  }
  
  // 3. Try removing prefixes like [JOB] or [OUTCOME]
  const removePrefix = (s: string) => {
    return s.replace(/^\[(job|outcome|metric|process|entity|persona)\]\s*/i, '').trim();
  };
  
  const cleanNoPrefix = removePrefix(clean);
  for (const key of Object.keys(labelToConcept)) {
    const keyCleanNoPrefix = removePrefix(key.toLowerCase());
    if (keyCleanNoPrefix === cleanNoPrefix) {
      return labelToConcept[key];
    }
  }

  // 4. Try matching alphanumeric characters only
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
