import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const dataSource = await db.dataSource.findUnique({
      where: { id },
      include: {
        system: true,
        mappings: {
          include: {
            concept: true,
          },
        },
      },
    });

    if (!dataSource) {
      return NextResponse.json({ error: 'Data source not found' }, { status: 404 });
    }

    return NextResponse.json(dataSource);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch data source' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, platform, connectionRef, systemId } = body;

    const data: any = {};
    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
      }
      data.name = name.trim();
    }
    if (platform !== undefined) {
      data.platform = platform;
    }
    if (connectionRef !== undefined) {
      data.connectionRef = connectionRef.trim();
    }
    if (systemId !== undefined) {
      data.systemId = systemId || null;
    }

    const dataSource = await db.dataSource.update({
      where: { id },
      data,
    });

    return NextResponse.json(dataSource);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update data source' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.dataSource.delete({
      where: { id },
    });
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to delete data source' }, { status: 500 });
  }
}
