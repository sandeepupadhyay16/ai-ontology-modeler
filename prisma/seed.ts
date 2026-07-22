import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Clearing existing database tables...');
  await prisma.promptTemplate.deleteMany({});
  await prisma.dataMapping.deleteMany({});
  await prisma.dataSource.deleteMany({});
  await prisma.systemLink.deleteMany({});
  await prisma.system.deleteMany({});
  await prisma.solutionLink.deleteMany({});
  await prisma.businessCapability.deleteMany({});
  await prisma.businessSolution.deleteMany({});
  await prisma.solutionOwner.deleteMany({});
  await prisma.ontology.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.businessProcess.deleteMany({});
  await prisma.businessFunction.deleteMany({});
  await prisma.organization.deleteMany({});
  console.log('Existing tables cleared.');

  console.log('Seeding deep, domain-exhaustive enterprise ontologies with 100% solution coverage...');

  // =============================================================
  // Organization 1: BMS (Bristol Myers Squibb)
  // =============================================================
  const orgBMS = await prisma.organization.create({
    data: {
      name: 'BMS',
      industry: 'Biopharmaceuticals',
      description: 'Global biopharmaceutical enterprise specializing in oncology, hematology, and immunology therapeutics.',
    },
  });

  const bmsRweFn = await prisma.businessFunction.create({
    data: {
      name: 'Real World Evidence',
      category: 'CORE',
      description: 'Observational studies, health economics data registries, and real-world clinical analytics.',
      organizationId: orgBMS.id,
    },
  });

  const bmsRweProcess1 = await prisma.businessProcess.create({
    data: {
      name: 'Real World Evidence Process Integration & Registry',
      description: 'Patient registry onboarding, longitudinal EHR ingestion, and protocol alignment.',
      businessFunctionId: bmsRweFn.id,
    },
  });

  const bmsRweProcess2 = await prisma.businessProcess.create({
    data: {
      name: 'Real World Evidence Operations Mapping',
      description: 'Protocol execution, milestone telemetry, and HEOR reporting cycles.',
      businessFunctionId: bmsRweFn.id,
    },
  });

  const bmsSolution1 = await prisma.project.create({
    data: {
      name: 'Real World Evidence Process Integration & Registry',
      description: 'Unified data ingestion and registry integration suite for observational oncology trials.',
      businessFunctionId: bmsRweFn.id,
    },
  });

  const bmsSolution2 = await prisma.project.create({
    data: {
      name: 'Real World Evidence Operations Mapping',
      description: 'Operational analytics platform for tracking study protocol cycle times and HEOR milestones.',
      businessFunctionId: bmsRweFn.id,
    },
  });

  // BMS Ontology 1: Integration & Registry (20+ Concepts & Relationships)
  const bmsOntology1 = await prisma.ontology.create({
    data: {
      name: 'Real World Evidence Process Integration & Registry Ontology',
      namespaceUri: 'http://bms.com/ontologies/rwe-integration-registry',
      layer: 'ENTERPRISE',
      version: '1.4.0',
      description: 'BIOPHARMA-aligned domain graph mapping clinical registries, EHR pipelines, consent protocols, and HEOR outcome endpoints.',
      industry: 'Biopharmaceuticals',
      businessFunction: 'Real World Evidence',
      objective: 'Streamline patient registry onboarding and accelerate RWE observational study cycle times.',
      organizationId: orgBMS.id,
      businessFunctionId: bmsRweFn.id,
      businessProcessId: bmsRweProcess1.id,
      projectId: bmsSolution1.id,
      aiMissions: ['Real World Evidence Integration', 'Registry Automation', 'HEOR Analytics'],
      tags: ['RWE', 'EHR', 'Observational Study', 'Registry', 'Oncology'],
    },
  });

  // BMS Ontology 2: Operations Mapping
  const bmsOntology2 = await prisma.ontology.create({
    data: {
      name: 'Optimize Real World Evidence Operational Cycle Times Ontology',
      namespaceUri: 'http://bms.com/ontologies/rwe-operations-mapping',
      layer: 'PROJECT',
      version: '1.1.0',
      description: 'Operational ontology tracking study protocol drafting, site IRB approval, data lock, and value dossier creation.',
      industry: 'Biopharmaceuticals',
      businessFunction: 'Real World Evidence',
      objective: 'Reduce overall RWE study operational cycle time by 25%.',
      organizationId: orgBMS.id,
      businessFunctionId: bmsRweFn.id,
      businessProcessId: bmsRweProcess2.id,
      projectId: bmsSolution2.id,
      aiMissions: ['Cycle Time Optimization', 'HEOR Analytics', 'Protocol Automation'],
      tags: ['RWE Operations', 'Protocol Approval', 'IRB', 'Data Lock', 'Value Evidence'],
    },
  });

  // Concepts for BMS Ontology 1
  const bC1 = await prisma.concept.create({ data: { label: 'PatientRegistry', conceptType: 'Entity', ontologyId: bmsOntology1.id } });
  const bC2 = await prisma.concept.create({ data: { label: 'EHRDataPipeline', conceptType: 'System', ontologyId: bmsOntology1.id } });
  const bC3 = await prisma.concept.create({ data: { label: 'ObservationalStudyProtocol', conceptType: 'Entity', ontologyId: bmsOntology1.id } });
  const bC4 = await prisma.concept.create({ data: { label: 'PatientConsentRecord', conceptType: 'Entity', ontologyId: bmsOntology1.id } });
  const bC5 = await prisma.concept.create({ data: { label: 'HEOROutcomeEndpoint', conceptType: 'Metric', ontologyId: bmsOntology1.id } });
  const bC6 = await prisma.concept.create({ data: { label: 'PrincipalInvestigator', conceptType: 'Persona', ontologyId: bmsOntology1.id } });
  const bC7 = await prisma.concept.create({ data: { label: 'DataExtractionEvent', conceptType: 'Event', ontologyId: bmsOntology1.id } });
  const bC8 = await prisma.concept.create({ data: { label: 'RegistryOnboardingProcess', conceptType: 'Process', ontologyId: bmsOntology1.id } });
  const bC9 = await prisma.concept.create({ data: { label: 'BiomarkerDataset', conceptType: 'Entity', ontologyId: bmsOntology1.id } });
  const bC10 = await prisma.concept.create({ data: { label: 'ClinicalInclusionCriteria', conceptType: 'Entity', ontologyId: bmsOntology1.id } });
  const bC11 = await prisma.concept.create({ data: { label: 'DataGovernanceAuditor', conceptType: 'Persona', ontologyId: bmsOntology1.id } });
  const bC12 = await prisma.concept.create({ data: { label: 'FHIRDataGateway', conceptType: 'System', ontologyId: bmsOntology1.id } });
  const bC13 = await prisma.concept.create({ data: { label: 'OverallSurvivalRate', conceptType: 'Metric', ontologyId: bmsOntology1.id } });
  const bC14 = await prisma.concept.create({ data: { label: 'AdverseEventReport', conceptType: 'Entity', ontologyId: bmsOntology1.id } });
  const bC15 = await prisma.concept.create({ data: { label: 'DataIngestionLatency', conceptType: 'Metric', ontologyId: bmsOntology1.id } });

  await prisma.relationship.createMany({
    data: [
      { name: 'governedBy', sourceId: bC1.id, targetId: bC3.id, ontologyId: bmsOntology1.id },
      { name: 'ingestsDataVia', sourceId: bC1.id, targetId: bC2.id, ontologyId: bmsOntology1.id },
      { name: 'requiresConsent', sourceId: bC1.id, targetId: bC4.id, ontologyId: bmsOntology1.id },
      { name: 'measuresOutcome', sourceId: bC3.id, targetId: bC5.id, ontologyId: bmsOntology1.id },
      { name: 'supervisedBy', sourceId: bC3.id, targetId: bC6.id, ontologyId: bmsOntology1.id },
      { name: 'triggersEvent', sourceId: bC8.id, targetId: bC7.id, ontologyId: bmsOntology1.id },
      { name: 'populatesRegistry', sourceId: bC7.id, targetId: bC1.id, ontologyId: bmsOntology1.id },
      { name: 'containsBiomarker', sourceId: bC1.id, targetId: bC9.id, ontologyId: bmsOntology1.id },
      { name: 'definesCriteria', sourceId: bC3.id, targetId: bC10.id, ontologyId: bmsOntology1.id },
      { name: 'auditedBy', sourceId: bC2.id, targetId: bC11.id, ontologyId: bmsOntology1.id },
      { name: 'routesThrough', sourceId: bC2.id, targetId: bC12.id, ontologyId: bmsOntology1.id },
      { name: 'calculatesSurvival', sourceId: bC5.id, targetId: bC13.id, ontologyId: bmsOntology1.id },
      { name: 'logsAdverseEvent', sourceId: bC1.id, targetId: bC14.id, ontologyId: bmsOntology1.id },
      { name: 'monitorsLatency', sourceId: bC12.id, targetId: bC15.id, ontologyId: bmsOntology1.id },
      { name: 'evaluatesInvestigator', sourceId: bC6.id, targetId: bC8.id, ontologyId: bmsOntology1.id },
    ],
  });

  await prisma.competencyQuestion.createMany({
    data: [
      { question: 'Which observational registries have active patient consent for genomic profiling?', status: 'Ratified', ontologyId: bmsOntology1.id },
      { question: 'What is the real-time data ingestion latency across FHIR EHR pipelines?', status: 'Ratified', ontologyId: bmsOntology1.id },
      { question: 'Which Principal Investigators have onboarded over 500 cohort patients this quarter?', status: 'Ratified', ontologyId: bmsOntology1.id },
      { question: 'What are the QALY HEOR outcome endpoints generated for oncology cohort studies?', status: 'Ratified', ontologyId: bmsOntology1.id },
      { question: 'What percentage of enrolled registry patients have logged adverse events within 30 days?', status: 'Ratified', ontologyId: bmsOntology1.id },
    ],
  });

  // Concepts for BMS Ontology 2
  const b2C1 = await prisma.concept.create({ data: { label: 'StudyProtocolDrafting', conceptType: 'Process', ontologyId: bmsOntology2.id } });
  const b2C2 = await prisma.concept.create({ data: { label: 'IRBApprovalWorkflow', conceptType: 'Process', ontologyId: bmsOntology2.id } });
  const b2C3 = await prisma.concept.create({ data: { label: 'DataLockMilestone', conceptType: 'Event', ontologyId: bmsOntology2.id } });
  const b2C4 = await prisma.concept.create({ data: { label: 'ValueDossier', conceptType: 'Entity', ontologyId: bmsOntology2.id } });
  const b2C5 = await prisma.concept.create({ data: { label: 'OverallStudyCycleTime', conceptType: 'Metric', ontologyId: bmsOntology2.id } });
  const b2C6 = await prisma.concept.create({ data: { label: 'StudyDirector', conceptType: 'Persona', ontologyId: bmsOntology2.id } });
  const b2C7 = await prisma.concept.create({ data: { label: 'SiteFeasibilityAssessment', conceptType: 'Process', ontologyId: bmsOntology2.id } });
  const b2C8 = await prisma.concept.create({ data: { label: 'ProtocolAmendmentCycle', conceptType: 'Process', ontologyId: bmsOntology2.id } });
  const b2C9 = await prisma.concept.create({ data: { label: 'BudgetApprovalStatus', conceptType: 'Entity', ontologyId: bmsOntology2.id } });
  const b2C10 = await prisma.concept.create({ data: { label: 'ClinicalDataManager', conceptType: 'Persona', ontologyId: bmsOntology2.id } });

  await prisma.relationship.createMany({
    data: [
      { name: 'precedes', sourceId: b2C1.id, targetId: b2C2.id, ontologyId: bmsOntology2.id },
      { name: 'leadsTo', sourceId: b2C2.id, targetId: b2C3.id, ontologyId: bmsOntology2.id },
      { name: 'producesDossier', sourceId: b2C3.id, targetId: b2C4.id, ontologyId: bmsOntology2.id },
      { name: 'evaluatedByMetric', sourceId: b2C1.id, targetId: b2C5.id, ontologyId: bmsOntology2.id },
      { name: 'managedBy', sourceId: b2C1.id, targetId: b2C6.id, ontologyId: bmsOntology2.id },
      { name: 'requiresFeasibility', sourceId: b2C1.id, targetId: b2C7.id, ontologyId: bmsOntology2.id },
      { name: 'triggersAmendment', sourceId: b2C2.id, targetId: b2C8.id, ontologyId: bmsOntology2.id },
      { name: 'approvedByBudget', sourceId: b2C7.id, targetId: b2C9.id, ontologyId: bmsOntology2.id },
      { name: 'managedByDataManager', sourceId: b2C3.id, targetId: b2C10.id, ontologyId: bmsOntology2.id },
    ],
  });

  await prisma.competencyQuestion.createMany({
    data: [
      { question: 'What is the average IRB approval duration across study sites?', status: 'Ratified', ontologyId: bmsOntology2.id },
      { question: 'Which protocol drafting bottlenecks add over 14 days to the study cycle time?', status: 'Ratified', ontologyId: bmsOntology2.id },
      { question: 'How many protocol amendments were executed prior to final data lock?', status: 'Ratified', ontologyId: bmsOntology2.id },
    ],
  });

  // =============================================================
  // Organization 2: Kite Pharma
  // =============================================================
  const orgKite = await prisma.organization.create({
    data: {
      name: 'Kite Pharma',
      industry: 'Biopharmaceuticals',
      description: 'Global pioneer in CAR-T autologous cell therapy and autologous vein-to-vein oncology therapeutics.',
    },
  });

  const kiteSupplyFn = await prisma.businessFunction.create({
    data: {
      name: 'Cell Therapy Supply Chain',
      category: 'CORE',
      description: 'Vein-to-vein cryogenic tracking, apheresis logistics, and cell manufacturing.',
      organizationId: orgKite.id,
    },
  });

  const kiteV2VProcess = await prisma.businessProcess.create({
    data: {
      name: 'Vein-to-Vein CAR-T Operations',
      description: 'Patient scheduling, leukapheresis, cryogenic shipping, and infusion.',
      businessFunctionId: kiteSupplyFn.id,
    },
  });

  const kiteSolution1 = await prisma.project.create({
    data: {
      name: 'Vein-to-Vein Operations Platform',
      description: 'Real-time telemetry and chain of custody tracking platform for CAR-T cell batches.',
      businessFunctionId: kiteSupplyFn.id,
    },
  });

  const kiteOntology1 = await prisma.ontology.create({
    data: {
      name: 'Cell Therapy Vein-to-Vein Logistics & Cold-Chain Ontology',
      namespaceUri: 'http://kitepharma.com/ontologies/cell-therapy-logistics',
      layer: 'ENTERPRISE',
      version: '1.3.0',
      description: 'Comprehensive semantic model for autologous cell therapy vein-to-vein operations, apheresis scheduling, and cold-chain integrity.',
      industry: 'Biopharmaceuticals',
      businessFunction: 'Cell Therapy Supply Chain',
      objective: 'Ensure zero vein-to-vein transport failures and 100% cold-chain compliance.',
      organizationId: orgKite.id,
      businessFunctionId: kiteSupplyFn.id,
      businessProcessId: kiteV2VProcess.id,
      projectId: kiteSolution1.id,
      aiMissions: ['Cell Therapy Logistics', 'Cold-Chain Monitoring', 'Yield Optimization'],
      tags: ['CAR-T', 'Apheresis', 'Cryogenic', 'Vein-to-Vein', 'Supply Chain'],
    },
  });

  const kC1 = await prisma.concept.create({ data: { label: 'LeukapheresisBatch', conceptType: 'Entity', ontologyId: kiteOntology1.id } });
  const kC2 = await prisma.concept.create({ data: { label: 'CryoTransportContainer', conceptType: 'System', ontologyId: kiteOntology1.id } });
  const kC3 = await prisma.concept.create({ data: { label: 'ChainOfIdentity', conceptType: 'Entity', ontologyId: kiteOntology1.id } });
  const kC4 = await prisma.concept.create({ data: { label: 'VeintoVeinCycleTime', conceptType: 'Metric', ontologyId: kiteOntology1.id } });
  const kC5 = await prisma.concept.create({ data: { label: 'ApheresisCoordinator', conceptType: 'Persona', ontologyId: kiteOntology1.id } });
  const kC6 = await prisma.concept.create({ data: { label: 'ViralVectorLot', conceptType: 'Entity', ontologyId: kiteOntology1.id } });
  const kC7 = await prisma.concept.create({ data: { label: 'BioreactorExpansionProcess', conceptType: 'Process', ontologyId: kiteOntology1.id } });
  const kC8 = await prisma.concept.create({ data: { label: 'CellViabilityRate', conceptType: 'Metric', ontologyId: kiteOntology1.id } });
  const kC9 = await prisma.concept.create({ data: { label: 'CryoTemperatureSpikeEvent', conceptType: 'Event', ontologyId: kiteOntology1.id } });
  const kC10 = await prisma.concept.create({ data: { label: 'QualityReleaseOfficer', conceptType: 'Persona', ontologyId: kiteOntology1.id } });

  await prisma.relationship.createMany({
    data: [
      { name: 'shippedIn', sourceId: kC1.id, targetId: kC2.id, ontologyId: kiteOntology1.id },
      { name: 'trackedByCOI', sourceId: kC1.id, targetId: kC3.id, ontologyId: kiteOntology1.id },
      { name: 'measuredByMetric', sourceId: kC1.id, targetId: kC4.id, ontologyId: kiteOntology1.id },
      { name: 'managedBy', sourceId: kC1.id, targetId: kC5.id, ontologyId: kiteOntology1.id },
      { name: 'engineeredWith', sourceId: kC1.id, targetId: kC6.id, ontologyId: kiteOntology1.id },
      { name: 'expandedIn', sourceId: kC1.id, targetId: kC7.id, ontologyId: kiteOntology1.id },
      { name: 'evaluatedByViability', sourceId: kC7.id, targetId: kC8.id, ontologyId: kiteOntology1.id },
      { name: 'monitoredForSpikes', sourceId: kC2.id, targetId: kC9.id, ontologyId: kiteOntology1.id },
      { name: 'approvedByQuality', sourceId: kC1.id, targetId: kC10.id, ontologyId: kiteOntology1.id },
    ],
  });

  await prisma.competencyQuestion.createMany({
    data: [
      { question: 'What is the average vein-to-vein turnaround time per treatment center?', status: 'Ratified', ontologyId: kiteOntology1.id },
      { question: 'Which cryo transport containers logged temperature spikes above -150C in transit?', status: 'Ratified', ontologyId: kiteOntology1.id },
      { question: 'What is the batch success rate for CAR-T expansion processes across manufacturing suites?', status: 'Ratified', ontologyId: kiteOntology1.id },
    ],
  });

  console.log('Successfully re-seeded database with deep concept coverage and 100% solution ontologies!');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
