import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, provider, apiKey, baseUrl, modelName, isActive } = body;

    const data: any = {};
    if (name !== undefined) data.name = name.trim();
    if (provider !== undefined) data.provider = provider;
    if (apiKey !== undefined) data.apiKey = apiKey.trim() || null;
    if (baseUrl !== undefined) data.baseUrl = baseUrl.trim() || null;
    if (modelName !== undefined) data.modelName = modelName.trim();
    if (isActive !== undefined) data.isActive = !!isActive;

    if (isActive) {
      // Deactivate all other configurations
      await db.llmConfiguration.updateMany({
        where: { id: { not: id } },
        data: { isActive: false },
      });
    }

    const config = await db.llmConfiguration.update({
      where: { id },
      data,
    });

    return NextResponse.json(config);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update LLM config' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.llmConfiguration.delete({
      where: { id },
    });
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to delete LLM config' }, { status: 500 });
  }
}
