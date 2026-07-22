import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: organizationId } = await params;
    const businessFunctions = await db.businessFunction.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ businessFunctions });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to list business functions' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: organizationId } = await params;
    const body = await request.json();
    const { name, category, description } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Business function name is required' }, { status: 400 });
    }

    // Verify organization exists
    const organization = await db.organization.findUnique({
      where: { id: organizationId },
    });
    if (!organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const businessFunction = await db.businessFunction.create({
      data: {
        name: name.trim(),
        category: category || 'CORE',
        description: description?.trim() || '',
        organizationId,
      },
    });

    return NextResponse.json(businessFunction, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to create business function' }, { status: 500 });
  }
}
