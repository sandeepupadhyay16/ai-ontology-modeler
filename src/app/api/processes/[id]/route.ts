import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const process = await db.businessProcess.findUnique({
      where: { id },
      include: {
        children: {
          orderBy: { name: 'asc' },
        },
        ontologies: {
          orderBy: { name: 'asc' },
        },
      },
    });

    if (!process) {
      return NextResponse.json({ error: 'Process not found' }, { status: 404 });
    }

    return NextResponse.json(process);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch process' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, parentId } = body;

    const data: any = {};
    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
      }
      data.name = name.trim();
    }
    if (description !== undefined) {
      data.description = description.trim();
    }
    if (parentId !== undefined) {
      data.parentId = parentId || null;
    }

    const process = await db.businessProcess.update({
      where: { id },
      data,
    });

    return NextResponse.json(process);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update process' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.businessProcess.delete({
      where: { id },
    });
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to delete process' }, { status: 500 });
  }
}
