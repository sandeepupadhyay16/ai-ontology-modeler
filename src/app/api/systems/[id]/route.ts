import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const system = await db.system.findUnique({
      where: { id },
      include: {
        processLinks: {
          include: {
            process: true,
          },
        },
        dataSources: true,
      },
    });

    if (!system) {
      return NextResponse.json({ error: 'System not found' }, { status: 404 });
    }

    return NextResponse.json(system);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch system' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, systemType, vendor, description, linkProcessId, linkRole } = body;

    const data: any = {};
    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
      }
      data.name = name.trim();
    }
    if (systemType !== undefined) {
      data.systemType = systemType;
    }
    if (vendor !== undefined) {
      data.vendor = vendor.trim();
    }
    if (description !== undefined) {
      data.description = description.trim();
    }

    const system = await db.system.update({
      where: { id },
      data,
    });

    // Link process to system
    if (linkProcessId) {
      await db.systemLink.upsert({
        where: {
          processId_systemId: {
            processId: linkProcessId,
            systemId: id,
          },
        },
        create: {
          processId: linkProcessId,
          systemId: id,
          role: linkRole || 'RUNS',
        },
        update: {
          role: linkRole || 'RUNS',
        },
      });
    }

    return NextResponse.json(system);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update system' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.system.delete({
      where: { id },
    });
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to delete system' }, { status: 500 });
  }
}
