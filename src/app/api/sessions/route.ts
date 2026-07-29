import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveDomainProfile } from '@/lib/domainProfiles';

/**
 * V3 "Open recent" support: the most recent modeling session per ontology, so the wizard can
 * reopen an existing ontology (and its staging state) instead of only creating a new one.
 */
export async function GET() {
  const sessions = await db.modelingSession.findMany({
    orderBy: { startedAt: 'desc' },
    take: 60,
    include: { ontology: { select: { id: true, name: true, industry: true, businessFunction: true, moduleScope: true } } },
  });
  const seen = new Set<string>();
  const latestPerOntology = [];
  for (const s of sessions) {
    if (seen.has(s.ontologyId)) continue;
    seen.add(s.ontologyId);
    latestPerOntology.push({ id: s.id, ontologyId: s.ontologyId, startedAt: s.startedAt, ontology: s.ontology });
  }
  return NextResponse.json({ sessions: latestPerOntology });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ontologyId, participant } = body;

    if (!ontologyId) {
      return NextResponse.json({ error: 'ontologyId is required' }, { status: 400 });
    }

    const ontology = await db.ontology.findUnique({ where: { id: ontologyId } });
    if (!ontology) {
      return NextResponse.json({ error: 'Ontology not found' }, { status: 404 });
    }

    const profile = resolveDomainProfile(ontology.industry, ontology.businessFunction);

    const session = await db.modelingSession.create({
      data: {
        ontologyId,
        domainProfile: profile.key,
        participant: participant?.trim() || null,
      },
    });

    return NextResponse.json({ session, domainProfile: profile }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to create modeling session' }, { status: 500 });
  }
}
