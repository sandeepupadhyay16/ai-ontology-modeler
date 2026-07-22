import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { question, status, remediation } = body;

    const data: any = {};
    if (question !== undefined) data.question = question.trim();
    if (status !== undefined) data.status = status;
    if (remediation !== undefined) data.remediation = remediation;

    const cq = await db.competencyQuestion.update({
      where: { id },
      data,
    });

    return NextResponse.json(cq);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update competency question' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.competencyQuestion.delete({
      where: { id },
    });
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to delete competency question' }, { status: 500 });
  }
}
