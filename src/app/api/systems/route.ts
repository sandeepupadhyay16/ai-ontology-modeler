import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const systems = await db.system.findMany({
      orderBy: { name: 'asc' },
      include: {
        processLinks: {
          include: {
            process: true,
          },
        },
        dataSources: true,
      },
    });
    return NextResponse.json({ systems });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to list systems' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, systemType, vendor, description } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'System name is required' }, { status: 400 });
    }

    const system = await db.system.create({
      data: {
        name: name.trim(),
        systemType: systemType || 'OPERATIONAL',
        vendor: vendor?.trim() || '',
        description: description?.trim() || '',
      },
    });

    return NextResponse.json(system, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'A system with this name already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message || 'Failed to create system' }, { status: 500 });
  }
}
