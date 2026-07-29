import type { SeedSource } from '@/lib/seed/types';

/**
 * Curated starter map for Kite Pharma — CAR-T cell & gene therapy, "vein-to-vein" commercial
 * logistics (the flow behind products like Yescarta / Tecartus): patient leukapheresis →
 * cryogenic shipment → manufacturing → QC release → reinfusion, tracked end-to-end by chain of
 * identity/custody.
 *
 * This is the standards-aligned, deterministic seed of docs/V3_FLOW.md §3. General-pharma entity
 * names are borrowed from the Pistoia Alliance Pharma General Ontology (PGO, CC BY 4.0); the
 * cell-therapy vocabulary follows AABB / FACT-JACIE chain-of-custody practice. Nothing here is
 * fetched/parsed — live vocabulary ingestion is the deferred `fromStandardVocab` loader.
 *
 * Concept types use the 5-category model (Entity / Agent / Process / Event / Metric). Every class
 * and relationship carries a `businessJustification` — the "why it's in the model" rationale.
 */
export const kiteCellTherapySeed: SeedSource = {
  classes: [
    {
      label: 'Patient', conceptType: 'Agent', upperOntologyTag: 'Agent',
      description: 'The patient receiving the autologous CAR-T therapy — the start and end of the vein-to-vein journey.',
      businessJustification: 'The entire chain exists to serve one patient; every batch and event traces back to a specific patient, so this is the anchor of the whole model.',
      attributes: [
        { name: 'patientId', datatype: 'string', description: 'De-identified patient identifier.' },
        { name: 'indication', datatype: 'string', description: 'Disease the therapy targets (e.g. large B-cell lymphoma).' },
      ],
    },
    {
      label: 'TreatingPhysician', conceptType: 'Agent', upperOntologyTag: 'Agent',
      description: 'The prescribing/treating physician at the authorized treatment center.',
      businessJustification: 'The accountable clinical decision-maker who drives prescribing and post-infusion safety monitoring.',
    },
    {
      label: 'ApheresisCenter', conceptType: 'Agent', upperOntologyTag: 'Agent',
      description: 'The certified site that performs leukapheresis to collect the patient’s T-cells.',
      businessJustification: 'Collection quality here determines whether a viable product can be manufactured at all — a critical upstream dependency.',
    },
    {
      label: 'ManufacturingSite', conceptType: 'Agent', upperOntologyTag: 'Agent',
      description: 'The facility that engineers the collected cells into the CAR-T product.',
      businessJustification: 'Slot capacity here is the primary constraint on how many patients can be treated in a given window.',
    },
    {
      label: 'Payer', conceptType: 'Agent', upperOntologyTag: 'Agent',
      description: 'The organization responsible for reimbursement/coverage of the therapy.',
      businessJustification: 'Reimbursement approval gates whether the therapy is commercially viable for a given patient.',
    },
    {
      label: 'Therapy', conceptType: 'Entity', upperOntologyTag: 'Entity',
      description: 'The autologous CAR-T product prescribed for the patient (e.g. axicabtagene ciloleucel).',
      businessJustification: 'The finished product is the revenue-bearing asset and the unit of regulatory accountability.',
      attributes: [
        { name: 'productName', datatype: 'string', description: 'Commercial product name.' },
        { name: 'lotNumber', datatype: 'string', description: 'Patient-specific lot identifier.' },
      ],
    },
    {
      label: 'PatientBatch', conceptType: 'Entity', upperOntologyTag: 'Entity',
      description: 'The patient-specific batch of cells tracked through manufacturing — autologous, never pooled.',
      businessJustification: 'The autologous batch is the physical thread of custody; losing or mislabeling it means restarting from the patient.',
      attributes: [{ name: 'batchId', datatype: 'string', description: 'Unique batch identifier bound to one patient.' }],
    },
    {
      label: 'CryoShipment', conceptType: 'Entity', upperOntologyTag: 'Entity',
      description: 'A cryogenic cold-chain shipment of collected cells or finished product.',
      businessJustification: 'Cold-chain integrity in transit is a top operational risk — a single excursion can scrap an irreplaceable batch.',
      attributes: [
        { name: 'temperatureLog', datatype: 'string', description: 'Cold-chain temperature record.' },
        { name: 'trackingId', datatype: 'string', description: 'Courier tracking identifier.' },
      ],
    },
    {
      label: 'ReimbursementCoverage', conceptType: 'Entity', upperOntologyTag: 'Entity',
      description: 'The coverage/authorization under which the therapy is reimbursed.',
      businessJustification: 'Defines the commercial terms under which a patient can actually receive therapy.',
    },
    {
      label: 'Leukapheresis', conceptType: 'Process', upperOntologyTag: 'Process',
      description: 'The collection procedure that separates and harvests the patient’s T-cells.',
      businessJustification: 'The first value-adding step; its yield and timing set the ceiling for the entire downstream chain.',
    },
    {
      label: 'Manufacturing', conceptType: 'Process', upperOntologyTag: 'Process',
      description: 'Cell engineering: activation, transduction, expansion, and formulation into the product.',
      businessJustification: 'The core value-add and the main driver of both cost and cycle time.',
    },
    {
      label: 'QCRelease', conceptType: 'Process', upperOntologyTag: 'Process',
      description: 'Quality-control release testing that authorizes the product for reinfusion.',
      businessJustification: 'The regulatory gate that authorizes patient dosing — a compliance-critical control and a common bottleneck.',
    },
    {
      label: 'ChainOfIdentity', conceptType: 'Process', upperOntologyTag: 'Process',
      description: 'End-to-end identity linkage (COI) guaranteeing the product returns to the correct patient.',
      businessJustification: 'A regulator-mandated patient-safety control ensuring the right product reaches the right patient.',
    },
    {
      label: 'ChainOfCustody', conceptType: 'Process', upperOntologyTag: 'Process',
      description: 'Documented custody transfers (COC) across every handoff in the journey.',
      businessJustification: 'The auditable custody trail required for compliance and for investigating any deviation.',
    },
    {
      label: 'ReinfusionEvent', conceptType: 'Event', upperOntologyTag: 'Event',
      description: 'The timed clinical event of administering the CAR-T product back into the patient.',
      businessJustification: 'The moment of value delivery and the anchor for outcome and safety tracking.',
      attributes: [{ name: 'infusionDate', datatype: 'string', description: 'Date of reinfusion.' }],
    },
    {
      label: 'AdverseEvent', conceptType: 'Event', upperOntologyTag: 'Event',
      description: 'A safety event following reinfusion (e.g. cytokine release syndrome, neurotoxicity).',
      businessJustification: 'Pharmacovigilance-critical: CRS/neurotoxicity drive REMS obligations and treatment-site readiness requirements.',
      attributes: [
        { name: 'grade', datatype: 'integer', description: 'Severity grade.' },
        { name: 'onsetDate', datatype: 'string', description: 'Date the event began.' },
      ],
    },
    {
      label: 'VeinToVeinTime', conceptType: 'Metric', upperOntologyTag: 'Quality',
      description: 'Turnaround time from leukapheresis collection to reinfusion — the headline logistics KPI.',
      businessJustification: 'The headline operational KPI; shorter turnaround improves outcomes and expands the treatable population.',
      attributes: [{ name: 'days', datatype: 'float', description: 'Elapsed days, vein to vein.' }],
    },
  ],
  relationships: [
    { name: 'treatedBy', source: 'Patient', target: 'TreatingPhysician', upperOntologyTag: 'Relation', description: 'A patient is treated by a physician.', businessJustification: 'Assigns clinical accountability for the patient to a specific clinician.' },
    { name: 'undergoes', source: 'Patient', target: 'Leukapheresis', upperOntologyTag: 'Relation', description: 'A patient undergoes leukapheresis.', businessJustification: 'Marks the patient’s entry point into the manufacturing journey.' },
    { name: 'performedAt', source: 'Leukapheresis', target: 'ApheresisCenter', upperOntologyTag: 'Relation', description: 'Leukapheresis is performed at an apheresis center.', businessJustification: 'Ties collection quality and scheduling to a specific certified site.' },
    { name: 'produces', source: 'Leukapheresis', target: 'PatientBatch', upperOntologyTag: 'Relation', description: 'Leukapheresis produces a patient-specific batch.', businessJustification: 'Establishes the custody origin of the patient-specific batch.' },
    { name: 'shippedAs', source: 'PatientBatch', target: 'CryoShipment', upperOntologyTag: 'Relation', cardinality: 'one-to-many', description: 'A batch travels as cryogenic shipments.', businessJustification: 'Connects the irreplaceable batch to the cold-chain risk of each transit leg.' },
    { name: 'processedBy', source: 'PatientBatch', target: 'Manufacturing', upperOntologyTag: 'Relation', description: 'A batch is processed by manufacturing.', businessJustification: 'Associates the batch with its cost- and cycle-time-defining manufacturing run.' },
    { name: 'performedAtSite', source: 'Manufacturing', target: 'ManufacturingSite', upperOntologyTag: 'Relation', description: 'Manufacturing runs at a manufacturing site.', businessJustification: 'Binds capacity constraints to a physical facility.' },
    { name: 'releasedBy', source: 'PatientBatch', target: 'QCRelease', upperOntologyTag: 'Relation', description: 'A batch is authorized by QC release.', businessJustification: 'Represents the compliance gate that must pass before dosing.' },
    { name: 'yields', source: 'Manufacturing', target: 'Therapy', upperOntologyTag: 'Relation', description: 'Manufacturing yields the finished therapy.', businessJustification: 'Traces the revenue-bearing product back to its manufacturing run.' },
    { name: 'tracksIdentityOf', source: 'ChainOfIdentity', target: 'PatientBatch', upperOntologyTag: 'Relation', description: 'Chain of identity tracks the batch back to its patient.', businessJustification: 'Encodes the patient-safety guarantee that product matches patient.' },
    { name: 'tracksCustodyOf', source: 'ChainOfCustody', target: 'CryoShipment', upperOntologyTag: 'Relation', cardinality: 'one-to-many', description: 'Chain of custody tracks each shipment handoff.', businessJustification: 'Provides the auditable handoff trail regulators require.' },
    { name: 'receives', source: 'Patient', target: 'ReinfusionEvent', upperOntologyTag: 'Relation', description: 'A patient receives the reinfusion.', businessJustification: 'Connects value delivery back to the originating patient.' },
    { name: 'administers', source: 'ReinfusionEvent', target: 'Therapy', upperOntologyTag: 'Relation', description: 'The reinfusion event administers the therapy.', businessJustification: 'Records the clinical act that triggers outcome and safety monitoring.' },
    { name: 'triggers', source: 'ReinfusionEvent', target: 'AdverseEvent', upperOntologyTag: 'Relation', cardinality: 'one-to-many', description: 'A reinfusion may trigger adverse events.', businessJustification: 'Captures the causal link used for pharmacovigilance and REMS reporting.' },
    { name: 'measuredBy', source: 'PatientBatch', target: 'VeinToVeinTime', upperOntologyTag: 'Relation', description: 'A batch’s journey is measured by vein-to-vein time.', businessJustification: 'Ties each batch’s journey to the KPI that governs operational performance.' },
    { name: 'coveredBy', source: 'Therapy', target: 'ReimbursementCoverage', upperOntologyTag: 'Relation', description: 'A therapy is covered by reimbursement coverage.', businessJustification: 'Links the product to the commercial terms enabling patient access.' },
    { name: 'authorizes', source: 'Payer', target: 'ReimbursementCoverage', upperOntologyTag: 'Relation', description: 'A payer authorizes coverage.', businessJustification: 'Represents the payer decision that unlocks reimbursement.' },
  ],
};
