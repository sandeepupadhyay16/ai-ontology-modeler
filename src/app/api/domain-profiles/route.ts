import { NextResponse } from 'next/server';
import { listDomainProfiles } from '@/lib/domainProfiles';

/**
 * V3 create wizard support: the known industry/domain profiles, so the wizard can offer
 * recognized industries (and their starter-entity hints) as suggestions. Free-text industry/
 * domain is still accepted by /api/ontologies/bootstrap — this is suggestions, not a whitelist.
 */
export async function GET() {
  const profiles = listDomainProfiles().map((p) => ({
    key: p.key,
    label: p.label,
    industryMatches: p.industryMatches,
    starterEntities: p.starterEntities,
    referenceStandards: p.referenceStandards,
  }));
  return NextResponse.json({ profiles });
}
