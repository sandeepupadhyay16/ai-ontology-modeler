import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const configs = await db.llmConfiguration.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ configs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to list LLM configs' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, provider, apiKey, baseUrl, modelName, isActive } = body;

    if (!name || !provider || !modelName) {
      return NextResponse.json({ error: 'Name, provider, and modelName are required' }, { status: 400 });
    }

    // If isActive is true, set all other configurations to inactive first
    if (isActive) {
      await db.llmConfiguration.updateMany({
        data: { isActive: false },
      });
    }

    const config = await db.llmConfiguration.create({
      data: {
        name: name.trim(),
        provider,
        apiKey: apiKey?.trim() || null,
        baseUrl: baseUrl?.trim() || null,
        modelName: modelName.trim(),
        isActive: !!isActive,
      },
    });

    return NextResponse.json(config, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to create LLM config' }, { status: 500 });
  }
}
