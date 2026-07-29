import type { SeedSource } from '@/lib/seed/types';

/**
 * Curated starter map for Pfizer — Vaccine Supply Chain (mRNA, e.g. Comirnaty): drug substance →
 * fill-finish → QC release → ultra-cold distribution → administration, with cold-chain and
 * pharmacovigilance tracking. Standards-aligned, deterministic seed (docs/V3_FLOW.md §3); general
 * names borrowed from Pistoia PGO (CC BY 4.0). 5-type concept model.
 */
export const pfizerVaccineSupplySeed: SeedSource = {
  classes: [
    { label: 'Vaccine', conceptType: 'Entity', upperOntologyTag: 'Entity', description: 'The finished mRNA vaccine product.', attributes: [{ name: 'productName', datatype: 'string', description: 'Commercial product name.' }, { name: 'presentation', datatype: 'string', description: 'Vial/dose presentation.' }] },
    { label: 'DrugSubstance', conceptType: 'Entity', upperOntologyTag: 'Entity', description: 'Bulk mRNA active substance manufactured upstream.' },
    { label: 'Batch', conceptType: 'Entity', upperOntologyTag: 'Entity', description: 'A manufacturing lot of finished product.', attributes: [{ name: 'lotNumber', datatype: 'string', description: 'Lot identifier.' }, { name: 'expiryDate', datatype: 'string', description: 'Expiration date.' }] },
    { label: 'ColdChainShipment', conceptType: 'Entity', upperOntologyTag: 'Entity', description: 'An ultra-cold (-70°C) shipment moving product downstream.', attributes: [{ name: 'trackingId', datatype: 'string', description: 'Courier tracking id.' }, { name: 'setpoint', datatype: 'float', description: 'Target temperature °C.' }] },
    { label: 'ManufacturingSite', conceptType: 'Agent', upperOntologyTag: 'Agent', description: 'The plant producing drug substance or finished product.' },
    { label: 'DistributionCenter', conceptType: 'Agent', upperOntologyTag: 'Agent', description: 'A hub that receives and forwards cold-chain shipments.' },
    { label: 'VaccinationSite', conceptType: 'Agent', upperOntologyTag: 'Agent', description: 'A pharmacy/clinic administering doses.' },
    { label: 'Provider', conceptType: 'Agent', upperOntologyTag: 'Agent', description: 'The healthcare professional administering the dose.' },
    { label: 'Patient', conceptType: 'Agent', upperOntologyTag: 'Agent', description: 'The vaccine recipient.' },
    { label: 'Regulator', conceptType: 'Agent', upperOntologyTag: 'Agent', description: 'The authority approving the product (FDA/EMA).' },
    { label: 'FillFinish', conceptType: 'Process', upperOntologyTag: 'Process', description: 'Fill-finish manufacturing that produces the finished vaccine.' },
    { label: 'QualityRelease', conceptType: 'Process', upperOntologyTag: 'Process', description: 'Batch QC release authorizing distribution.' },
    { label: 'Distribution', conceptType: 'Process', upperOntologyTag: 'Process', description: 'The downstream cold-chain distribution workflow.' },
    { label: 'DoseAdministration', conceptType: 'Event', upperOntologyTag: 'Event', description: 'The timed event of administering a dose to a patient.', attributes: [{ name: 'administeredDate', datatype: 'string', description: 'Date administered.' }] },
    { label: 'AdverseEvent', conceptType: 'Event', upperOntologyTag: 'Event', description: 'A post-vaccination adverse event.', attributes: [{ name: 'grade', datatype: 'integer', description: 'Severity grade.' }] },
    { label: 'StorageExcursion', conceptType: 'Event', upperOntologyTag: 'Event', description: 'A cold-chain temperature excursion outside the allowed range.' },
    { label: 'CoverageRate', conceptType: 'Metric', upperOntologyTag: 'Quality', description: 'Population vaccination coverage / uptake.', attributes: [{ name: 'percent', datatype: 'float', description: 'Coverage percent.' }] },
  ],
  relationships: [
    { name: 'producedAt', source: 'Batch', target: 'ManufacturingSite', upperOntologyTag: 'Relation', description: 'A batch is produced at a manufacturing site.' },
    { name: 'derivedFrom', source: 'Vaccine', target: 'DrugSubstance', upperOntologyTag: 'Relation', description: 'The vaccine is derived from a drug substance.' },
    { name: 'yields', source: 'FillFinish', target: 'Vaccine', upperOntologyTag: 'Relation', description: 'Fill-finish yields the finished vaccine.' },
    { name: 'releasedBy', source: 'Batch', target: 'QualityRelease', upperOntologyTag: 'Relation', description: 'A batch is authorized by quality release.' },
    { name: 'packagedInto', source: 'Batch', target: 'ColdChainShipment', upperOntologyTag: 'Relation', cardinality: 'one-to-many', description: 'A batch is packaged into cold-chain shipments.' },
    { name: 'shippedTo', source: 'ColdChainShipment', target: 'DistributionCenter', upperOntologyTag: 'Relation', description: 'A shipment is sent to a distribution center.' },
    { name: 'distributesTo', source: 'DistributionCenter', target: 'VaccinationSite', upperOntologyTag: 'Relation', cardinality: 'one-to-many', description: 'A distribution center forwards product to vaccination sites.' },
    { name: 'administeredAt', source: 'DoseAdministration', target: 'VaccinationSite', upperOntologyTag: 'Relation', description: 'A dose is administered at a vaccination site.' },
    { name: 'administers', source: 'Provider', target: 'DoseAdministration', upperOntologyTag: 'Relation', cardinality: 'one-to-many', description: 'A provider administers doses.' },
    { name: 'receives', source: 'Patient', target: 'DoseAdministration', upperOntologyTag: 'Relation', description: 'A patient receives a dose.' },
    { name: 'triggers', source: 'DoseAdministration', target: 'AdverseEvent', upperOntologyTag: 'Relation', cardinality: 'one-to-many', description: 'A dose may trigger adverse events.' },
    { name: 'affects', source: 'StorageExcursion', target: 'ColdChainShipment', upperOntologyTag: 'Relation', description: 'An excursion affects a shipment.' },
    { name: 'approves', source: 'Regulator', target: 'Vaccine', upperOntologyTag: 'Relation', description: 'A regulator approves the vaccine.' },
    { name: 'measuredBy', source: 'Vaccine', target: 'CoverageRate', upperOntologyTag: 'Relation', description: 'Uptake is measured by coverage rate.' },
  ],
};
