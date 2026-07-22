import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, cardinality } = body;

    const data: any = {};
    if (name !== undefined) data.name = name.trim();
    if (description !== undefined) data.description = description;
    if (cardinality !== undefined) data.cardinality = cardinality;

    const relationship = await db.relationship.update({
      where: { id },
      data,
    });

    return NextResponse.json(relationship);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update relationship' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.relationship.delete({
      where: { id },
    });
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to delete relationship' }, { status: 500 });
  }
}
