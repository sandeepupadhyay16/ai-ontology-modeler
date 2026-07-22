import { NextResponse } from 'next/server';

export async function GET() {
  const lmStudioUrl = process.env.LM_STUDIO_URL || 'http://localhost:1234/v1';
  try {
    const res = await fetch(`${lmStudioUrl}/models`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      return NextResponse.json({ models: [] });
    }

    const data = await res.json();
    return NextResponse.json({ models: data.data || [] });
  } catch (error) {
    // If LM Studio is not active, return empty list cleanly
    return NextResponse.json({ models: [] });
  }
}
