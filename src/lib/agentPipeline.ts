import { db } from '@/lib/db';
import { weaveOrphanConcepts } from '@/lib/graphWeaver';
import { cleanAndParseJSON, normalizeOntologyJSON, NormalizedOntology, formatCompressedState } from '@/lib/schemaNormalizer';
import { detectDomainTaxonomies, formatTaxonomyGuidance } from '@/lib/domainTaxonomyRegistry';
import { OntologyQualityReport, evaluateOntologyQuality } from '@/lib/qualityEvaluator';
import http from 'http';
import { setGlobalDispatcher, Agent } from 'undici';

// Configure Node.js HTTP request timeouts for long-running LLM calls
if (http.Server && http.Server.prototype) {
  http.Server.prototype.headersTimeout = 900000;
  http.Server.prototype.requestTimeout = 900000;
  http.Server.prototype.keepAliveTimeout = 900000;
}

setGlobalDispatcher(new Agent({
  headersTimeout: 900000,
  bodyTimeout: 900000,
  connectTimeout: 900000,
}));

export interface PipelineStageResult {
  stage: number;
  stageName: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  output: any;
  durationMs: number;
}

export type { OntologyQualityReport };
export { evaluateOntologyQuality };

// Low-level provider invocation
export async function callLLMProvider(systemPrompt: string, userPrompt: string): Promise<string> {
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
        max_tokens: 25000,
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`LM Studio returned an error: ${errText}`);
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
        response_format: { type: 'json_object' },
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
        temperature: 0.15,
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
          },
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
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          system_instruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            temperature: 0.15,
            response_mime_type: 'application/json',
          },
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

export { cleanAndParseJSON };

// Stage 1: Requirements & Intent Parser
export async function runIntentParser(prompt: string, ontologyContext: any) {
  const systemPrompt = `You are the AI Requirements & Intent Parser for Enterprise Ontologies.
Analyze the user request within the context of:
- Organization: ${ontologyContext.orgName || 'Enterprise'}
- Industry: ${ontologyContext.industry || 'General'}
- Business Function: ${ontologyContext.businessFunction || 'General'}
- AI Mission: ${ontologyContext.aiMissions?.join(', ') || 'Domain Expansion'}

CRITICAL RULES:
1. NO INTERNAL REASONING: Do NOT emit internal thoughts, scratchpad monologue, or thinking tags (<think>...</think>).
2. START IMMEDIATELY: Start on token 1 with the opening '{' brace.
3. RAW JSON ONLY: Respond ONLY with a valid JSON object matching this schema:
{
  "parsedIntent": "Clear executive summary of modeling intent",
  "targetIndustry": "Industry name",
  "targetFunction": "Business Function",
  "targetProcess": "Primary process focus",
  "aiMissionTags": ["Mission tag 1", "Mission tag 2"],
  "isVague": false,
  "probingQuestions": []
}`;

  try {
    const reply = await callLLMProvider(systemPrompt, prompt);
    const parsed = cleanAndParseJSON(reply);
    if (parsed && parsed.parsedIntent) return parsed;
    throw new Error('Invalid intent parse');
  } catch (e) {
    return {
      parsedIntent: prompt,
      targetIndustry: ontologyContext.industry || 'Biopharmaceuticals',
      targetFunction: ontologyContext.businessFunction || 'Supply Chain',
      targetProcess: 'Primary Workflow',
      aiMissionTags: ontologyContext.aiMissions || ['Domain Modeling'],
      isVague: false,
      probingQuestions: [],
    };
  }
}

// Stage 2: Domain SME & Industry Taxonomist
export async function runDomainTaxonomist(intentOutput: any, ontologyContext: any) {
  const contextStr = `${ontologyContext.name || ''} ${ontologyContext.industry || ''} ${ontologyContext.orgName || ''} ${ontologyContext.businessFunction || ''} ${intentOutput?.parsedIntent || ''}`.toLowerCase();

  const detectedTaxonomies = detectDomainTaxonomies(contextStr);
  const bestTaxonomy = detectedTaxonomies[0];

  let taxonomyRules = bestTaxonomy 
    ? formatTaxonomyGuidance(bestTaxonomy)
    : `
ENTERPRISE TAXONOMY STANDARDS:
- Standard Entities: Customer, Order, Product, Facility, Operator, System.
- Standard Processes: OrderFulfillment, QualityAudit, InventoryReplenishment, SLACompliance.
- Standard Metrics: CycleTime, DefectRate, Throughput, SLACompliancePercent.
`;

  const systemPrompt = `You are the Industry SME & Domain Taxonomist.
Apply canonical industry standards to expand taxonomy requirements strictly aligned with the given domain topic.
${taxonomyRules}

CRITICAL RULES:
1. NO INTERNAL REASONING: Do NOT emit internal thoughts, scratchpad monologue, or thinking tags (<think>...</think>).
2. START IMMEDIATELY: Start on token 1 with the opening '{' brace.
3. RAW JSON ONLY: Respond ONLY with a valid JSON object matching this schema:
{
  "domainTaxonomy": "Summary of taxonomy standards applied",
  "recommendedConcepts": ["Entity1", "Process1", "Metric1"],
  "standardCompetencyQuestions": [
    "Competency Question 1?",
    "Competency Question 2?"
  ]
}`;

  try {
    const reply = await callLLMProvider(systemPrompt, `Generate domain taxonomy for intent: ${intentOutput.parsedIntent}`);
    const parsed = cleanAndParseJSON(reply);
    if (parsed && Array.isArray(parsed.recommendedConcepts)) return parsed;
    throw new Error('Invalid taxonomy parse');
  } catch (e) {
    if (bestTaxonomy) {
      return {
        domainTaxonomy: `${bestTaxonomy.name} Taxonomy Standard`,
        recommendedConcepts: [
          ...bestTaxonomy.entities.slice(0, 3),
          ...bestTaxonomy.processes.slice(0, 2),
          ...bestTaxonomy.metrics.slice(0, 2),
        ],
        standardCompetencyQuestions: bestTaxonomy.sampleCQs || [
          'What is the overall operational cycle time?',
          'Which quality checkpoints experience bottlenecks?',
        ],
      };
    }
    return {
      domainTaxonomy: 'Enterprise Domain Taxonomy',
      recommendedConcepts: ['Customer', 'OrderProcess', 'CycleTime', 'DefectRate'],
      standardCompetencyQuestions: [
        'What is the overall cycle time for processing requests?',
        'Which quality checkpoints experience bottlenecks?',
      ],
    };
  }
}

// Stage 3: Semantic & Process Modeler (Multi-Agent Deep Decomposition)
export async function runProcessModeler(intentOutput: any, taxonomyOutput: any, ontologyContext: any, currentState: any): Promise<NormalizedOntology> {
  const systemPrompt = `You are the Lead Enterprise Semantic & Business Process Modeler Agent.
Your job is to generate a comprehensive, richly structured, fully connected domain ontology knowledge graph.

ONTOLOGY CONTEXT:
- Industry: ${ontologyContext.industry}
- Business Function: ${ontologyContext.businessFunction}
- Modeling Intent: ${intentOutput.parsedIntent}
- Domain Taxonomy: ${JSON.stringify(taxonomyOutput.recommendedConcepts || [])}

COMPREHENSIVE MODELING MANDATE:
1. MULTI-TIER COVERAGE: Create 10 to 18 granular, high-impact domain concepts spanning ALL enterprise tiers:
   - Personas & Stakeholders (Actors executing tasks)
   - Operational Processes & Sub-processes (Core workflows and activities)
   - Core Entities & Master Data (Domain objects, assets, records)
   - Enterprise Data Systems (Platforms, CRM, ERP, Data stores)
   - Key Performance Indicators & Metrics (Operational and business KPIs)
   - Workflow Events & Milestones (Triggers and alerts)
2. 100% GRAPH CONNECTIVITY: Connect ALL concepts via directional relationships. Zero orphan concepts allowed.
   - Personas -> executes -> Processes
   - Processes -> produces/updates -> Entities
   - Processes -> loggedInto/integratesWith -> Systems
   - Metrics -> measures/evaluates -> Processes/Entities
   - Events -> triggers -> Processes
3. ATTRIBUTES: Provide 2 to 4 typed attributes per concept (datatype: "string" | "integer" | "float" | "dateTime" | "boolean").
4. COMPETENCY QUESTIONS: Provide 3 to 5 realistic, domain-specific questions answerable by traversing the graph.
5. DRIVER TREES: Include at least 1 Performance Driver Tree linking Metric concepts with polarity and weights.

CRITICAL RULES (FOLLOW STRICTLY):
1. NO INTERNAL REASONING OR MONOLOGUE: You MUST NOT emit internal reasoning, thinking monologue, chain-of-thought tokens, or scratchpad text (<think>...</think> or reasoning buffer). Commit directly to outputting valid JSON from token 1.
2. IMMEDIATE COMMITMENT: Start your output immediately with the opening brace '{'.
3. OUTPUT FORMAT: Respond ONLY with a single, valid JSON object. NEVER include markdown code fences, conversational preamble, thinking tags, or closing commentary.
4. CONCISENESS: Keep each concept description under 20 words. Keep attribute descriptions under 8 words.
5. UNIQUE LABELS: Every concept label MUST be unique and CamelCase.

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

  let userPrompt = `Generate new complete ontology for intent: ${intentOutput.parsedIntent}`;
  if (currentState && currentState.concepts?.length > 0) {
    const compressed = formatCompressedState(currentState);
    userPrompt = `Update the current ontology state incrementally:\n${compressed}\n\nApply updates while preserving existing relevant concepts and relationships.`;
  }

  try {
    const reply = await callLLMProvider(systemPrompt, userPrompt);
    const parsed = cleanAndParseJSON(reply);
    let normalized = normalizeOntologyJSON(parsed);

    // Quality retry if initial generation is sparse
    if ((!normalized.concepts || normalized.concepts.length < 6 || !normalized.relationships || normalized.relationships.length < 4) && (!currentState || !currentState.concepts?.length)) {
      console.warn(`Stage 3 initial generation sparse (${normalized.concepts?.length || 0} concepts). Retrying with emphasis...`);
      const retrySystemPrompt = `${systemPrompt}\n\nCRITICAL ENFORCEMENT: Your previous response was too sparse. You MUST generate between 10 and 18 distinct concepts across all tiers with at least 10 relationships.`;
      try {
        const retryReply = await callLLMProvider(retrySystemPrompt, userPrompt);
        const retryParsed = cleanAndParseJSON(retryReply);
        const retryNormalized = normalizeOntologyJSON(retryParsed);
        if (retryNormalized.concepts && retryNormalized.concepts.length >= (normalized.concepts?.length || 0)) {
          normalized = retryNormalized;
        }
      } catch (retryErr: any) {
        console.warn('Stage 3 retry encountered error, proceeding with initial parsed output:', retryErr.message);
      }
    }

    if (!normalized.concepts || normalized.concepts.length === 0) {
      throw new Error('No concepts extracted');
    }

    return weaveOrphanConcepts(normalized);
  } catch (err: any) {
    console.warn('Process Modeler generation failed, applying resilient fallback:', err.message);
    const fallback = normalizeOntologyJSON({
      concepts: (taxonomyOutput?.recommendedConcepts || ['CoreEntity', 'PrimaryProcess', 'PerformanceMetric']).map((label: string) => ({
        label,
        conceptType: label.includes('Process') ? 'Process' : label.includes('Metric') ? 'Metric' : 'Entity',
        description: `Domain concept for ${label}`,
      })),
      relationships: [
        { name: 'measuresPerformance', source: 'PerformanceMetric', target: 'PrimaryProcess', cardinality: 'one-to-one' },
        { name: 'producesOutput', source: 'PrimaryProcess', target: 'CoreEntity', cardinality: 'one-to-many' }
      ],
      competencyQuestions: (taxonomyOutput?.standardCompetencyQuestions || ['What is the core cycle time?']).map((q: string) => ({ question: q, status: 'Ratified' })),
      driverTrees: [],
    });
    return weaveOrphanConcepts(fallback);
  }
}

