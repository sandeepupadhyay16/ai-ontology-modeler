import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { weight, polarity } = body;

    const data: any = {};
    if (weight !== undefined) data.weight = parseFloat(weight);
    if (polarity !== undefined) data.polarity = parseInt(polarity);

    const edge = await db.driverEdge.update({
      where: { id },
      data,
    });

    return NextResponse.json(edge);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update edge' }, { status: 500 });
  }
}
