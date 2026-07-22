import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const solution = await db.businessSolution.findUnique({
      where: { id },
      include: {
        businessOwner: true,
        itOwner: true,
        capabilities: true,
        processLinks: {
          include: {
            process: true,
          },
        },
      },
    });

    if (!solution) {
      return NextResponse.json({ error: 'Solution not found' }, { status: 404 });
    }

    return NextResponse.json(solution);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch solution' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, status, linkProcessId } = body;

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
    if (status !== undefined) {
      data.status = status;
    }

    const solution = await db.businessSolution.update({
      where: { id },
      data,
    });

    // If request asks to link to a process step
    if (linkProcessId) {
      await db.solutionLink.upsert({
        where: {
          processId_solutionId: {
            processId: linkProcessId,
            solutionId: id,
          },
        },
        create: {
          processId: linkProcessId,
          solutionId: id,
        },
        update: {},
      });
    }

    return NextResponse.json(solution);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update solution' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.businessSolution.delete({
      where: { id },
    });
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to delete solution' }, { status: 500 });
  }
}
