import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const solutions = await db.businessSolution.findMany({
      orderBy: { name: 'asc' },
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
    return NextResponse.json({ solutions });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to list solutions' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, status, businessOwner, itOwner, capabilities } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Solution name is required' }, { status: 400 });
    }

    // Handle nested owner creation or look up if provided
    let bizOwnerId: string | undefined;
    let itOwnerId: string | undefined;

    if (businessOwner) {
      const owner = await db.solutionOwner.create({
        data: {
          name: businessOwner.name,
          role: 'Business',
          team: businessOwner.team || '',
          email: businessOwner.email || '',
        },
      });
      bizOwnerId = owner.id;
    }

    if (itOwner) {
      const owner = await db.solutionOwner.create({
        data: {
          name: itOwner.name,
          role: 'IT',
          team: itOwner.team || '',
          email: itOwner.email || '',
        },
      });
      itOwnerId = owner.id;
    }

    const solution = await db.businessSolution.create({
      data: {
        name: name.trim(),
        description: description?.trim() || '',
        status: status || 'Active',
        businessOwnerId: bizOwnerId,
        itOwnerId: itOwnerId,
        capabilities: {
          create: (capabilities || []).map((c: string) => ({
            name: c.trim(),
          })),
        },
      },
      include: {
        businessOwner: true,
        itOwner: true,
        capabilities: true,
      },
    });

    return NextResponse.json(solution, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to create solution' }, { status: 500 });
  }
}
