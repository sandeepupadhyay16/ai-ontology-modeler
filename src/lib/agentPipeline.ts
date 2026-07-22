import { db } from '@/lib/db';
import { weaveOrphanConcepts } from '@/lib/graphWeaver';
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

export interface OntologyQualityReport {
  healthScore: number; // 0 - 100
  cqCoveragePercent: number;
  orphanConceptCount: number;
  conceptCount: number;
  relationshipCount: number;
  causalCycleCount: number;
  issues: Array<{
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    code: string;
    message: string;
    autoFixable: boolean;
    remediationAction?: any;
  }>;
}

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

export function cleanAndParseJSON(reply: string): any {
  let jsonString = reply.trim();
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
  if (jsonString.includes('```')) {
    const matches = jsonString.match(/```(?:json)?([\s\S]*?)```/);
    if (matches && matches[1]) {
      jsonString = matches[1].trim();
    }
  }
  const firstBrace = jsonString.indexOf('{');
  const lastBrace = jsonString.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    jsonString = jsonString.substring(firstBrace, lastBrace + 1);
  }
  return JSON.parse(jsonString);
}

// Stage 1: Requirements & Intent Parser
export async function runIntentParser(prompt: string, ontologyContext: any) {
  const systemPrompt = `You are the AI Requirements & Intent Parser for Enterprise Ontologies.
Analyze the user request within the context of:
- Organization: ${ontologyContext.orgName || 'Enterprise'}
- Industry: ${ontologyContext.industry || 'General'}
- Business Function: ${ontologyContext.businessFunction || 'General'}
- AI Mission: ${ontologyContext.aiMissions?.join(', ') || 'Domain Expansion'}

Output JSON specifying:
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
    return cleanAndParseJSON(reply);
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

  const isCart = contextStr.includes('car-t') || contextStr.includes('cart') || contextStr.includes('cell therapy') || contextStr.includes('leukapheresis') || contextStr.includes('vein-to-vein');
  const isRwd = contextStr.includes('rwd') || contextStr.includes('real world') || contextStr.includes('evidence') || contextStr.includes('heor') || contextStr.includes('registry') || contextStr.includes('observational');

  let taxonomyRules = `
ENTERPRISE TAXONOMY STANDARDS:
- Standard Entities: Customer, Order, Product, Facility, Operator, System.
- Standard Processes: OrderFulfillment, QualityAudit, InventoryReplenishment, SLACompliance.
- Standard Metrics: CycleTime, DefectRate, Throughput, SLACompliancePercent.
`;

  if (isCart) {
    taxonomyRules = `
CAR-T CELL THERAPY TAXONOMY STANDARDS:
- Standard Entities: Patient, LeukapheresisSample, CryoVial, CellBatch, InfusionKit, MedicalCenter.
- Standard Processes: PatientSlotBooking, LeukapheresisHarvest, CryoTransit, TransductionAndExpansion, QualityReleaseTesting, PatientInfusion.
- Standard Metrics: VeintoVeinCycleTime, CellViabilityRate, CryopreservationTempDelta, BatchSuccessRate.
`;
  } else if (isRwd) {
    taxonomyRules = `
REAL WORLD EVIDENCE (RWD / HEOR) TAXONOMY STANDARDS:
- Standard Entities: PatientRegistry, EHRPipeline, ConsentRecord, ObservationalStudyProtocol, ClinicalDataset, OutcomeEndpoint.
- Standard Processes: DataExtractionProcess, PatientConsentVerification, DataCurationProcess, HEORAnalysisProcess, StudyProtocolDrafting.
- Standard Metrics: DataIngestionLatency, PatientEnrollmentCount, DataIntegrityScore, EvidenceGenerationCycleTime.
`;
  }

  const systemPrompt = `You are the Industry SME & Domain Taxonomist.
Apply canonical industry standards to expand taxonomy requirements strictly aligned with the given domain topic.
${taxonomyRules}

User Intent: ${JSON.stringify(intentOutput)}

Output JSON:
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
    return cleanAndParseJSON(reply);
  } catch (e) {
    return {
      domainTaxonomy: isRwd ? 'Real World Evidence Taxonomy' : isCart ? 'CAR-T Logistics Taxonomy' : 'Enterprise Domain Taxonomy',
      recommendedConcepts: isRwd 
        ? ['PatientRegistry', 'EHRPipeline', 'DataCollectionProcess', 'DataIntegrityScore']
        : isCart 
        ? ['Patient', 'LeukapheresisSample', 'VeintoVeinCycleTime', 'CellViabilityRate']
        : ['Customer', 'OrderProcess', 'CycleTime', 'DefectRate'],
      standardCompetencyQuestions: isRwd
        ? [
            'What is the average data ingestion latency across FHIR EHR pipelines?',
            'What percentage of enrolled registry patients have logged consent protocols?',
          ]
        : [
            'What is the overall cycle time for processing requests?',
            'Which quality checkpoints experience bottlenecks?',
          ],
    };
  }
}

// Stage 3: Semantic & Process Modeler (Multi-Agent Deep Decomposition)
export async function runProcessModeler(intentOutput: any, taxonomyOutput: any, ontologyContext: any, currentState: any) {
  const systemPrompt = `You are the Lead Enterprise Semantic & Business Process Modeler Agent.
Your job is to build a deeply detailed, highly granular, fully connected enterprise domain ontology graph strictly tailored to the specific domain (e.g. Real World Evidence, Supply Chain, Logistics, or Finance).

STRICT DOMAIN ALIGNMENT MANDATE:
- ONLY include concepts, personas, processes, metrics, and entities that are directly relevant to the user's specific domain.
- Do NOT mix up unrelated domain concepts (e.g. do NOT include cell manufacturing / leukapheresis concepts in an RWD / Evidence ontology; do NOT include freight routing in a banking AML ontology).

UNLIMITED EXPANSION MANDATE:
- Do NOT limit the number of concepts or competency questions artificially. A complex business area requires thorough, multi-layered modeling.
- You MUST create concepts across all canonical tiers:
  1. Personas & Stakeholders (e.g. ClinicalResearcher, DataScientist, ComplianceAnalyst, Operator)
  2. Core Entities (e.g. PatientRegistry, ClinicalDataset, EHRRecord, OrderContainer)
  3. Operational Processes & Sub-processes (e.g. DataExtractionProcess, ProtocolApproval, SarFiling, QualityAudit)
  4. Operational & Workflow Events (e.g. DataValidationEvent, AnomalyAlertEvent, PipelineSyncEvent)
  5. Enterprise Systems & Data Sources (e.g. FHIREHRPipeline, AMLEngine, DataWarehouse)
  6. Key Performance Indicators & Metrics (e.g. DataIngestionLatency, OverallCycleTime, DataIntegrityScore)

MANDATORY CONNECTIVITY WEAVING:
- EVERY single concept created MUST be connected via directional relationships (source -> target).
- Zero orphan concepts allowed. Connect Personas -> Processes -> Entities -> Metrics -> Systems.
- Use canonical relationship verbs: executes, produces, governedBy, monitors, calculates, integratesWith, populates.

REQUIRED ATTRIBUTES:
- Include 2-4 typed attributes for every entity/system concept (datatype: "string" | "float" | "integer" | "dateTime" | "boolean").

Context:
- Industry: ${ontologyContext.industry}
- Function: ${ontologyContext.businessFunction}
- Intent: ${intentOutput.parsedIntent}
- Taxonomy: ${JSON.stringify(taxonomyOutput)}

Return a complete, schema-compliant JSON object:
{
  "concepts": [
    {
      "label": "ConceptName",
      "conceptType": "Entity|Process|Metric|Persona|System|Event|DataSource",
      "description": "Description text",
      "attributes": [{ "name": "attr1", "datatype": "string", "required": true, "description": "desc" }]
    }
  ],
  "relationships": [
    {
      "name": "relationshipName",
      "source": "SourceConceptLabel",
      "target": "TargetConceptLabel",
      "cardinality": "one-to-many"
    }
  ],
  "competencyQuestions": [
    { "question": "Detailed competency question?", "status": "Ratified" }
  ],
  "driverTrees": [
    {
      "name": "Main Performance Driver Tree",
      "edges": [{ "name": "Drives (+1.0)", "source": "SrcMetric", "target": "TgtMetric" }]
    }
  ],
  "causalCycles": [
    {
      "name": "Operational Feedback Loop",
      "cycleType": "REINFORCING",
      "description": "Loop description",
      "edges": [{ "source": "SrcMetric", "target": "TgtMetric" }]
    }
  ]
}`;

  const userPrompt = currentState && currentState.concepts?.length > 0
    ? `Update the current ontology state incrementally:\n${JSON.stringify(currentState, null, 2)}`
    : `Generate new complete ontology for intent: ${intentOutput.parsedIntent}`;

  const reply = await callLLMProvider(systemPrompt, userPrompt);
  const parsedJSON = cleanAndParseJSON(reply);
  return weaveOrphanConcepts(parsedJSON);
}

// Stage 4: Quality & Logic Validator
export function evaluateOntologyQuality(ontologyJSON: any): OntologyQualityReport {
  const concepts = ontologyJSON.concepts || [];
  const relationships = ontologyJSON.relationships || [];
  const competencyQuestions = ontologyJSON.competencyQuestions || [];
  const causalCycles = ontologyJSON.causalCycles || [];

  const conceptLabels = new Set(concepts.map((c: any) => (c.label || '').trim().toLowerCase()));

  // 1. Detect Orphan Concepts
  const connectedLabels = new Set<string>();
  for (const rel of relationships) {
    if (rel.source) connectedLabels.add(rel.source.trim().toLowerCase());
    if (rel.target) connectedLabels.add(rel.target.trim().toLowerCase());
  }

  const orphanConcepts = concepts.filter(
    (c: any) => !connectedLabels.has((c.label || '').trim().toLowerCase())
  );

  // 2. CQ Coverage Calculation
  let coveredCQs = 0;
  for (const cq of competencyQuestions) {
    const qLower = (cq.question || '').toLowerCase();
    const matchesConcept = concepts.some((c: any) => qLower.includes((c.label || '').toLowerCase()));
    if (matchesConcept) coveredCQs++;
  }
  const cqCoveragePercent = competencyQuestions.length > 0
    ? Math.round((coveredCQs / competencyQuestions.length) * 100)
    : 100;

  // 3. Health Score Deduction
  let healthScore = 100;
  const issues: OntologyQualityReport['issues'] = [];

  if (orphanConcepts.length > 0) {
    const penalty = Math.min(25, orphanConcepts.length * 5);
    healthScore -= penalty;
    issues.push({
      severity: orphanConcepts.length > 3 ? 'HIGH' : 'MEDIUM',
      code: 'ORPHAN_NODES',
      message: `Found ${orphanConcepts.length} unconnected concept(s): ${orphanConcepts.map((c: any) => c.label).slice(0, 4).join(', ')}`,
      autoFixable: true,
      remediationAction: 'CONNECT_ORPHANS',
    });
  }

  if (cqCoveragePercent < 80) {
    healthScore -= 15;
    issues.push({
      severity: 'MEDIUM',
      code: 'LOW_CQ_COVERAGE',
      message: `Competency question coverage is ${cqCoveragePercent}%. Some questions cannot be answered by graph pathways.`,
      autoFixable: true,
      remediationAction: 'ENRICH_CQ_CONCEPTS',
    });
  }

  if (relationships.length === 0 && concepts.length > 1) {
    healthScore -= 30;
    issues.push({
      severity: 'HIGH',
      code: 'NO_RELATIONSHIPS',
      message: 'No relationships defined between concepts in ontology.',
      autoFixable: true,
      remediationAction: 'GENERATE_RELATIONSHIPS',
    });
  }

  return {
    healthScore: Math.max(0, healthScore),
    cqCoveragePercent,
    orphanConceptCount: orphanConcepts.length,
    conceptCount: concepts.length,
    relationshipCount: relationships.length,
    causalCycleCount: causalCycles.length,
    issues,
  };
}
