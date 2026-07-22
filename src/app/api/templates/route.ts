import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const templates = await db.promptTemplate.findMany({
      orderBy: { industry: 'asc' },
    });
    return NextResponse.json({ templates });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to list templates' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { industry, domain, businessFunction, objective, description, causalCycles } = body;

    if (!industry || !domain || !businessFunction || !objective) {
      return NextResponse.json({ error: 'Industry, Domain, Function, and Objective are required' }, { status: 400 });
    }

    const template = await db.promptTemplate.upsert({
      where: {
        industry_domain_businessFunction: {
          industry: industry.trim(),
          domain: domain.trim(),
          businessFunction: businessFunction.trim(),
        },
      },
      update: {
        objective: objective.trim(),
        description: description?.trim() || '',
        causalCycles: causalCycles || [],
      },
      create: {
        industry: industry.trim(),
        domain: domain.trim(),
        businessFunction: businessFunction.trim(),
        objective: objective.trim(),
        description: description?.trim() || '',
        causalCycles: causalCycles || [],
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to save template' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 });
    }

    await db.promptTemplate.delete({
      where: { id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to delete template' }, { status: 500 });
  }
}
