import { NextResponse } from 'next/server';
import { validateChangeSet } from '@/lib/validation';

/** Stage 9: run SHACL/consistency + one-way-dependency validation on a change set. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await validateChangeSet(id);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Validation failed' }, { status: 400 });
  }
}
