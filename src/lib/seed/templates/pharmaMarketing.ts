import type { SeedSource } from '@/lib/seed/types';

/**
 * Curated starter map for Pharma × Marketing.
 *
 * Class names and IRIs are BORROWED from standard vocabularies (schema.org for the
 * general/medical terms) rather than parsed from them — this is the "standards-aligned,
 * deterministic" seed of docs/V3_FLOW.md §3. IRIs are hints for later alignment; they are
 * not fetched or required to resolve. Live vocabulary ingestion is the deferred
 * `fromStandardVocab` loader.
 */
export const pharmaMarketingSeed: SeedSource = {
  classes: [
    {
      label: 'Brand',
      conceptType: 'Entity',
      upperOntologyTag: 'Entity',
      description: 'A marketed pharmaceutical brand or product.',
      uri: 'https://schema.org/Brand',
      attributes: [
        { name: 'brandName', datatype: 'string', description: 'Commercial brand name.' },
        { name: 'therapeuticArea', datatype: 'string', description: 'Therapeutic area the brand serves.' },
      ],
    },
    {
      label: 'Campaign',
      conceptType: 'Process',
      upperOntologyTag: 'Process',
      description: 'A time-bound marketing campaign promoting a brand to a target audience.',
      attributes: [
        { name: 'startDate', datatype: 'string', description: 'Campaign start date.' },
        { name: 'endDate', datatype: 'string', description: 'Campaign end date.' },
        { name: 'budget', datatype: 'float', description: 'Allocated campaign budget.' },
      ],
    },
    {
      label: 'HealthcareProfessional',
      conceptType: 'Agent',
      upperOntologyTag: 'Agent',
      description: 'A prescribing or influencing healthcare professional (HCP) targeted by marketing.',
      uri: 'https://schema.org/Physician',
      attributes: [
        { name: 'specialty', datatype: 'string', description: 'Clinical specialty.' },
        { name: 'prescribingDecile', datatype: 'integer', description: 'Prescribing volume decile.' },
      ],
    },
    {
      label: 'Patient',
      conceptType: 'Agent',
      upperOntologyTag: 'Agent',
      description: 'A patient the therapy is ultimately intended for.',
      uri: 'https://schema.org/Patient',
    },
    {
      label: 'Channel',
      conceptType: 'Entity',
      upperOntologyTag: 'Entity',
      description: 'A marketing channel through which a campaign is delivered (email, rep, digital, event).',
    },
    {
      label: 'MarketingAsset',
      conceptType: 'Entity',
      upperOntologyTag: 'Entity',
      description: 'A creative asset used within a campaign (detail aid, email, banner, video).',
      uri: 'https://schema.org/CreativeWork',
      attributes: [
        { name: 'assetType', datatype: 'string', description: 'Kind of creative asset.' },
        { name: 'mlrApproved', datatype: 'boolean', description: 'Whether medical/legal/regulatory review approved it.' },
      ],
    },
    {
      label: 'Indication',
      conceptType: 'Entity',
      upperOntologyTag: 'Entity',
      description: 'A medical condition a brand is indicated to treat.',
      uri: 'https://schema.org/MedicalIndication',
    },
    {
      label: 'AudienceSegment',
      conceptType: 'Entity',
      upperOntologyTag: 'Entity',
      description: 'A defined target audience for a campaign.',
      uri: 'https://schema.org/Audience',
    },
    {
      label: 'EngagementMetric',
      conceptType: 'Metric',
      upperOntologyTag: 'Quality',
      description: 'A measurable engagement outcome for a campaign (open rate, reach, script lift).',
      attributes: [
        { name: 'metricName', datatype: 'string', description: 'Name of the metric.' },
        { name: 'value', datatype: 'float', description: 'Measured value.' },
      ],
    },
  ],
  relationships: [
    { name: 'promotes', source: 'Campaign', target: 'Brand', upperOntologyTag: 'Relation', description: 'A campaign promotes a brand.' },
    { name: 'targets', source: 'Campaign', target: 'AudienceSegment', upperOntologyTag: 'Relation', description: 'A campaign targets an audience segment.' },
    { name: 'deliveredVia', source: 'Campaign', target: 'Channel', upperOntologyTag: 'Relation', cardinality: 'many-to-many', description: 'A campaign is delivered via one or more channels.' },
    { name: 'uses', source: 'Campaign', target: 'MarketingAsset', upperOntologyTag: 'Relation', cardinality: 'many-to-many', description: 'A campaign uses marketing assets.' },
    { name: 'treats', source: 'Brand', target: 'Indication', upperOntologyTag: 'Relation', cardinality: 'many-to-many', description: 'A brand treats an indication.' },
    { name: 'memberOf', source: 'HealthcareProfessional', target: 'AudienceSegment', upperOntologyTag: 'Relation', description: 'An HCP belongs to an audience segment.' },
    { name: 'measuredBy', source: 'Campaign', target: 'EngagementMetric', upperOntologyTag: 'Relation', cardinality: 'one-to-many', description: 'A campaign is measured by engagement metrics.' },
  ],
};
