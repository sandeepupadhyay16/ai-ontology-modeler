import { weaveOrphanConcepts } from '@/lib/graphWeaver';
import { callLLMProvider, cleanAndParseJSON } from '@/lib/llm';

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
