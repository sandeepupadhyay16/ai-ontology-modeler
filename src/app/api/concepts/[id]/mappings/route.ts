import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conceptId } = await params;
    const mappings = await db.dataMapping.findMany({
      where: { conceptId },
      include: {
        dataSource: true,
      },
    });
    return NextResponse.json({ mappings });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to list mappings' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conceptId } = await params;
    const body = await request.json();
    const { dataSourceId, columnOrField, transformation, confidence } = body;

    if (!dataSourceId) {
      return NextResponse.json({ error: 'dataSourceId is required' }, { status: 400 });
    }

    const mapping = await db.dataMapping.upsert({
      where: {
        conceptId_dataSourceId: {
          conceptId,
          dataSourceId,
        },
      },
      create: {
        conceptId,
        dataSourceId,
        columnOrField: columnOrField?.trim() || '',
        transformation: transformation?.trim() || '',
        confidence: confidence !== undefined ? parseFloat(confidence) : 1.0,
        status: 'Proposed',
      },
      update: {
        columnOrField: columnOrField?.trim() || '',
        transformation: transformation?.trim() || '',
        confidence: confidence !== undefined ? parseFloat(confidence) : 1.0,
      },
      include: {
        dataSource: true,
      },
    });

    return NextResponse.json(mapping, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to map concept' }, { status: 500 });
  }
}
