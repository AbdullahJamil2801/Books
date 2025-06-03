import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const transactions = Array.isArray(body) ? body : [body];
    // Optionally validate required fields here
    return NextResponse.json({ preview: transactions });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
} 