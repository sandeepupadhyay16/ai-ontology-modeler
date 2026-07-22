import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const businessFunctionId = searchParams.get('businessFunctionId');

    if (!businessFunctionId) {
      return NextResponse.json({ error: 'businessFunctionId is required' }, { status: 400 });
    }

    // Fetch all processes for the function, then assemble them recursively
    const allProcesses = await db.businessProcess.findMany({
      where: { businessFunctionId },
      orderBy: { name: 'asc' },
    });

    // Simple recursive helper to build tree
    const buildTree = (parentId: string | null): any[] => {
      return allProcesses
        .filter((p) => p.parentId === parentId)
        .map((p) => ({
          ...p,
          children: buildTree(p.id),
        }));
    };

    const processTree = buildTree(null);

    return NextResponse.json({ processes: processTree });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to list processes' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, parentId, businessFunctionId } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Process name is required' }, { status: 400 });
    }
    if (!businessFunctionId) {
      return NextResponse.json({ error: 'businessFunctionId is required' }, { status: 400 });
    }

    // Verify parent exists if provided
    if (parentId) {
      const parent = await db.businessProcess.findUnique({
        where: { id: parentId },
      });
      if (!parent) {
        return NextResponse.json({ error: 'Parent process not found' }, { status: 404 });
      }
    }

    const process = await db.businessProcess.create({
      data: {
        name: name.trim(),
        description: description?.trim() || '',
        parentId: parentId || null,
        businessFunctionId,
      },
    });

    return NextResponse.json(process, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to create process' }, { status: 500 });
  }
}
