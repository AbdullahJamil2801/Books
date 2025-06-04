import { NextRequest, NextResponse } from 'next/server';

// In-memory store for demo (replace with DB or Redis for production)
let pendingImport: any[] | null = null;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!Array.isArray(body)) {
      return NextResponse.json({ error: 'Expected an array of transactions.' }, { status: 400 });
    }
    pendingImport = body;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function GET() {
  if (pendingImport) {
    const data = pendingImport;
    pendingImport = null; // Clear after retrieval
    return NextResponse.json({ data });
  } else {
    return NextResponse.json({ data: null });
  }
} 