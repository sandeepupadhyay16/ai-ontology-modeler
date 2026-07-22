import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const organization = await db.organization.findUnique({
      where: { id },
      include: {
        businessFunctions: {
          orderBy: { name: 'asc' },
        },
      },
    });

    if (!organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    return NextResponse.json(organization);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch organization' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, industry, description } = body;

    const data: any = {};
    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
      }
      data.name = name.trim();
    }
    if (industry !== undefined) {
      data.industry = industry.trim();
    }
    if (description !== undefined) {
      data.description = description.trim();
    }

    const organization = await db.organization.update({
      where: { id },
      data,
    });

    return NextResponse.json(organization);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'An organization with this name already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message || 'Failed to update organization' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.organization.delete({
      where: { id },
    });
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to delete organization' }, { status: 500 });
  }
}
