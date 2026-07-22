import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const organizations = await db.organization.findMany({
      orderBy: { name: 'asc' },
      include: {
        businessFunctions: {
          orderBy: { name: 'asc' },
        },
      },
    });
    return NextResponse.json({ organizations });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to list organizations' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, industry, description } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Organization name is required' }, { status: 400 });
    }

    const organization = await db.organization.create({
      data: {
        name: name.trim(),
        industry: industry?.trim() || '',
        description: description?.trim() || '',
      },
    });

    return NextResponse.json(organization, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'An organization with this name already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message || 'Failed to create organization' }, { status: 500 });
  }
}
