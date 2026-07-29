import type { SeedSource } from '@/lib/seed/types';
import { kiteCellTherapySeed } from '@/lib/seed/templates/kiteCellTherapy';
import { pfizerVaccineSupplySeed } from '@/lib/seed/templates/pfizerVaccineSupply';
import { pfizerClinicalTrialSeed } from '@/lib/seed/templates/pfizerClinicalTrial';
import { pharmaMarketingSeed } from '@/lib/seed/templates/pharmaMarketing';
import { financialServicesRiskSeed } from '@/lib/seed/templates/financialServicesRisk';

/**
 * Registry of curated, standards-aligned starter maps, keyed on (industry, domain).
 *
 * Matching mirrors domainProfiles.ts's substring style: `industryMatches` /
 * `domainMatches` are lowercase substrings tested against the free-text industry and
 * domain the wizard collected. Score = (industry hit) + (domain hit); the highest score
 * wins, ties broken by array order (list more specific templates first). A template only
 * qualifies if the INDUSTRY matches — a domain-only hit is not enough, so an unrelated
 * industry never inherits another industry's classes.
 */
interface SeedTemplate {
  key: string;
  label: string;
  industryMatches: string[];
  domainMatches: string[];
  seed: SeedSource;
}

const TEMPLATES: SeedTemplate[] = [
  {
    // Kite Pharma / CAR-T vein-to-vein. The pharma default (listed first so it wins an industry-
    // only tie); a more specific pharma domain below (vaccine, clinical, marketing) still scores
    // higher and wins. domainMatches are cell-therapy-specific so it does NOT hijack supply/clinical.
    key: 'KITE_CELL_THERAPY',
    label: 'Kite Pharma — Cell & Gene Therapy',
    industryMatches: ['pharma', 'biopharma', 'biotech', 'life sciences', 'cell therapy', 'cell & gene', 'cell and gene', 'gene therapy', 'car-t', 'cart', 'kite'],
    domainMatches: ['cell therapy', 'gene therapy', 'car-t', 'cart', 'vein', 'patient services', 'apheresis', 'reinfusion'],
    seed: kiteCellTherapySeed,
  },
  {
    key: 'PFIZER_VACCINE_SUPPLY',
    label: 'Pfizer — Vaccine Supply Chain',
    industryMatches: ['pharma', 'biopharma', 'biotech', 'life sciences', 'vaccine', 'pfizer'],
    domainMatches: ['vaccine', 'supply', 'cold chain', 'cold-chain', 'distribution', 'manufacturing', 'logistics'],
    seed: pfizerVaccineSupplySeed,
  },
  {
    key: 'PFIZER_CLINICAL_TRIAL',
    label: 'Pfizer — Clinical Trial / Drug Development',
    industryMatches: ['pharma', 'biopharma', 'biotech', 'life sciences', 'pfizer'],
    domainMatches: ['clinical', 'trial', 'drug development', 'development', 'r&d', 'research', 'regulatory'],
    seed: pfizerClinicalTrialSeed,
  },
  {
    key: 'PHARMA_MARKETING',
    label: 'Pharma × Marketing',
    industryMatches: ['pharma', 'biopharma', 'biotech', 'life sciences'],
    domainMatches: ['marketing', 'commercial', 'brand', 'promotion'],
    seed: pharmaMarketingSeed,
  },
  {
    key: 'FINANCIAL_SERVICES_RISK',
    label: 'Financial Services × Risk Management',
    industryMatches: ['financial services', 'banking', 'bank', 'insurance', 'fintech'],
    domainMatches: ['risk', 'compliance', 'regulatory'],
    seed: financialServicesRiskSeed,
  },
];

function normalize(value: string | null | undefined): string {
  return (value || '').toLowerCase();
}

export interface TemplateMatch {
  key: string;
  label: string;
  seed: SeedSource;
}

/**
 * Best-matching curated template for an industry + domain, or null when nothing matches
 * (the caller falls back to an empty seed). Industry match is required; domain match only
 * raises the score to break ties between templates sharing an industry.
 */
export function findTemplate(industry: string | null | undefined, domain: string | null | undefined): TemplateMatch | null {
  const industryLc = normalize(industry);
  const domainLc = normalize(domain);

  let best: SeedTemplate | null = null;
  let bestScore = 0;

  for (const t of TEMPLATES) {
    const industryHit = t.industryMatches.some((m) => industryLc.includes(m));
    if (!industryHit) continue; // industry is mandatory
    const domainHit = t.domainMatches.some((m) => domainLc.includes(m));
    const score = 1 + (domainHit ? 1 : 0);
    if (score > bestScore) {
      best = t;
      bestScore = score;
    }
  }

  return best ? { key: best.key, label: best.label, seed: best.seed } : null;
}
