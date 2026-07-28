import { NextResponse } from 'next/server';
import { publishChangeSet } from '@/lib/publish';

/** Stage 12: publish a SIGNED_OFF change set's ontology/glossary/rules to the publish target. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await publishChangeSet(id);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Publish failed' }, { status: 400 });
  }
}
