/**
 * Data-driven domain/industry profiles (idea.md §1).
 *
 * This is the intentionally-light v1: a vocabulary hint per industry, not an
 * imported standard (FIBO/OMOP import is an idea.md open question, deferred).
 * It is also the data-driven replacement for the hardcoded `isCart`/pharma
 * `.includes()` branches in `ai-generate/route.ts` — matching here is table-
 * driven (one generic resolver + a data array), not per-industry `if` chains.
 * Those branches are deleted in the Stage 2/3 cleanup track once the new
 * extraction pipeline no longer needs the old route.
 */

export interface DomainProfile {
  /** Stable key persisted on ModelingSession.domainProfile */
  key: string;
  label: string;
  /** Lowercase substrings matched against Ontology.industry + businessFunction */
  industryMatches: string[];
  businessFunctionMatches?: string[];
  /** Starter core-entity checklist surfaced to the user / extraction prompt */
  starterEntities: string[];
  /** Known reference ontologies/standards for this industry, as name hints only */
  referenceStandards: string[];
  /** Domain-tuned guidance injected into the Stage 2 extraction prompt */
  promptFragment: string;
}

const GENERIC_PROFILE: DomainProfile = {
  key: 'GENERIC',
  label: 'General / Unspecified',
  industryMatches: [],
  starterEntities: ['Actor', 'Process', 'Event', 'Resource', 'Outcome'],
  referenceStandards: [],
  promptFragment:
    'No specific industry vocabulary is known for this domain. Extract entities, ' +
    'relationships, and attributes using plain, general-purpose business vocabulary ' +
    '— do not assume any particular industry\'s terminology.',
};

const DOMAIN_PROFILES: DomainProfile[] = [
  {
    key: 'CELL_GENE_THERAPY',
    label: 'Cell & Gene Therapy',
    industryMatches: ['cell therapy', 'cell & gene', 'cell and gene', 'car-t', 'cart'],
    businessFunctionMatches: ['cell therapy', 'vein', 'v2v', 'apheresis', 'cell manufactur', 'cold-chain', 'cold chain'],
    starterEntities: [
      'PatientBatch', 'Leukapheresis', 'ChainOfCustody', 'ChainOfIdentity',
      'CryogenicShipment', 'ManufacturingSlot', 'QCRelease', 'ReinfusionEvent',
    ],
    referenceStandards: ['AABB accreditation', 'FACT-JACIE standards'],
    promptFragment:
      'This is a cell & gene therapy / vein-to-vein logistics domain. Listen for patient ' +
      'batch scheduling, leukapheresis, chain of custody/identity, cryogenic cold-chain ' +
      'shipment, cell manufacturing steps (processing, activation, transduction, ' +
      'expansion), QC release testing, and patient re-infusion — not generic supply chain.',
  },
  {
    key: 'BIOPHARMA_LIFE_SCIENCES',
    label: 'Biopharma / Life Sciences',
    industryMatches: ['pharma', 'biopharma', 'biotech', 'life sciences'],
    starterEntities: [
      'Patient', 'Payer', 'Formulary', 'Physician', 'Therapy', 'Indication',
      'ClinicalTrial', 'ReimbursementCoverage',
    ],
    referenceStandards: ['OMOP CDM', 'HL7 FHIR'],
    promptFragment:
      'This is a biopharmaceutical / life-sciences domain. Listen for actors like ' +
      'Payer, Physician, Patient; entities like Formulary, Indication, Therapy, ' +
      'ClinicalTrial; and access/reimbursement concepts like ReimbursementCoverage ' +
      'or FormularyTier — not generic retail or manufacturing vocabulary.',
  },
  {
    key: 'FINANCIAL_SERVICES',
    label: 'Financial Services',
    industryMatches: ['financial services', 'banking', 'bank', 'insurance', 'fintech'],
    starterEntities: [
      'Account', 'Counterparty', 'Instrument', 'Transaction', 'RiskExposure', 'Regulator',
    ],
    referenceStandards: ['FIBO'],
    promptFragment:
      'This is a financial-services domain. Listen for Account, Counterparty, ' +
      'Instrument, Transaction, RiskExposure, and regulatory/compliance entities ' +
      '— align naming with FIBO-style vocabulary where it fits naturally.',
  },
  {
    key: 'RETAIL',
    label: 'Retail',
    industryMatches: ['retail', 'e-commerce', 'ecommerce', 'consumer goods'],
    starterEntities: ['Product', 'SKU', 'Customer', 'Order', 'Inventory', 'Store', 'Channel'],
    referenceStandards: ['GS1'],
    promptFragment:
      'This is a retail domain. Listen for Product/SKU, Customer, Order, Inventory, ' +
      'Store, and Channel concepts — align naming with GS1-style vocabulary where it ' +
      'fits naturally.',
  },
];

function normalize(value: string | null | undefined): string {
  return (value || '').toLowerCase();
}

/**
 * Resolves the best-matching domain profile for an ontology's industry +
 * businessFunction, falling back to the generic profile when nothing matches.
 * Score = (industry hit) + (businessFunction hit); highest score wins, ties
 * broken by DOMAIN_PROFILES order — so listing a more specific profile (e.g.
 * Cell & Gene Therapy) before a broader one (e.g. Biopharma) lets it win a
 * tie, mirroring the old route's isCart-before-pharma precedence.
 */
export function resolveDomainProfile(
  industry?: string | null,
  businessFunction?: string | null
): DomainProfile {
  const industryLc = normalize(industry);
  const functionLc = normalize(businessFunction);

  let best: DomainProfile | null = null;
  let bestScore = 0;

  for (const profile of DOMAIN_PROFILES) {
    const industryHit = profile.industryMatches.some((m) => industryLc.includes(m));
    const functionHit = (profile.businessFunctionMatches || []).some((m) => functionLc.includes(m));
    const score = (industryHit ? 1 : 0) + (functionHit ? 1 : 0);

    if (score > bestScore) {
      best = profile;
      bestScore = score;
    }
  }

  return best || GENERIC_PROFILE;
}

export function getDomainProfileByKey(key: string): DomainProfile {
  return DOMAIN_PROFILES.find((p) => p.key === key) || GENERIC_PROFILE;
}

export function listDomainProfiles(): DomainProfile[] {
  return [...DOMAIN_PROFILES, GENERIC_PROFILE];
}

/** Assembles the profile's data into the text block Stage 2 prepends to its extraction prompt. */
export function buildDomainPromptFragment(profile: DomainProfile): string {
  const lines = [
    `Domain: ${profile.label}`,
    profile.promptFragment,
    `Known starter entities for this domain (hints, not an exhaustive list): ${profile.starterEntities.join(', ')}.`,
  ];
  if (profile.referenceStandards.length) {
    lines.push(`Reference standards for this domain (name hints only, not imported): ${profile.referenceStandards.join(', ')}.`);
  }
  return lines.join('\n');
}
