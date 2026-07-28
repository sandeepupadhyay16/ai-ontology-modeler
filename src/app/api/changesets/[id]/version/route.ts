import { NextResponse } from 'next/server';
import { versionChangeSet } from '@/lib/versioning';

/** Stage 10: commit the change set's TTL to the ontology store and record an OntologyVersion. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await versionChangeSet(id);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Versioning failed' }, { status: 400 });
  }
}
