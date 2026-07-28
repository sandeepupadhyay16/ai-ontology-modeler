import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveDomainProfile } from '@/lib/domainProfiles';

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
