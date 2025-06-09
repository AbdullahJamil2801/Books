import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'Missing Dropbox URL' }, { status: 400 });
  }
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch file from Dropbox' }, { status: 400 });
    }
    const data = await res.json();
    // Optionally validate/normalize data here
    return NextResponse.json({ data });
  } catch (err: unknown) {
    let message = 'Failed to fetch or parse JSON';
    if (err instanceof Error) message = err.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
} 