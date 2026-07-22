import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const dataSources = await db.dataSource.findMany({
      orderBy: { name: 'asc' },
      include: {
        system: true,
        mappings: {
          include: {
            concept: true,
          },
        },
      },
    });
    return NextResponse.json({ dataSources });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to list data sources' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, platform, connectionRef, systemId } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Data source name is required' }, { status: 400 });
    }
    if (!platform) {
      return NextResponse.json({ error: 'Data platform is required' }, { status: 400 });
    }

    const dataSource = await db.dataSource.create({
      data: {
        name: name.trim(),
        platform, // DATABRICKS, SNOWFLAKE, REDSHIFT, SAP, BIGQUERY, POSTGRES, API
        connectionRef: connectionRef?.trim() || '',
        systemId: systemId || null,
      },
    });

    return NextResponse.json(dataSource, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to create data source' }, { status: 500 });
  }
}
