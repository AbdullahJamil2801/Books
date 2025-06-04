import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let transactions;
    if (Array.isArray(body)) {
      transactions = body;
    } else if (body && Array.isArray(body.preview)) {
      transactions = body.preview;
    } else {
      transactions = [body];
    }
    // Optionally validate required fields here
    return NextResponse.json({ preview: transactions });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
} 