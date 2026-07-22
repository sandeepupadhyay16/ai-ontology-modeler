import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, confidence, transformation } = body;

    const data: any = {};
    if (status !== undefined) data.status = status;
    if (confidence !== undefined) data.confidence = parseFloat(confidence);
    if (transformation !== undefined) data.transformation = transformation;

    const mapping = await db.dataMapping.update({
      where: { id },
      data,
    });

    return NextResponse.json(mapping);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update mapping' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.dataMapping.delete({
      where: { id },
    });
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to delete mapping' }, { status: 500 });
  }
}
