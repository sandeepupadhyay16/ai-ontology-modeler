import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const businessFunction = await db.businessFunction.findUnique({
      where: { id },
      include: {
        businessProcesses: {
          orderBy: { name: 'asc' },
        },
        projects: {
          orderBy: { name: 'asc' },
        },
      },
    });

    if (!businessFunction) {
      return NextResponse.json({ error: 'Business function not found' }, { status: 404 });
    }

    return NextResponse.json(businessFunction);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch business function' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, category, description } = body;

    const data: any = {};
    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
      }
      data.name = name.trim();
    }
    if (category !== undefined) {
      data.category = category;
    }
    if (description !== undefined) {
      data.description = description.trim();
    }

    const businessFunction = await db.businessFunction.update({
      where: { id },
      data,
    });

    return NextResponse.json(businessFunction);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update business function' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.businessFunction.delete({
      where: { id },
    });
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to delete business function' }, { status: 500 });
  }
}
