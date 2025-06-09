import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { dropbox_link, filename } = body;
    if (!dropbox_link) {
      return NextResponse.json({ error: 'Missing dropbox_link' }, { status: 400 });
    }
    // Convert Dropbox share link to direct download link
    let url = dropbox_link.trim();
    if (url.includes('www.dropbox.com')) {
      url = url.replace('www.dropbox.com', 'dl.dropboxusercontent.com');
      url = url.replace('?dl=0', '');
      url = url.replace('?dl=1', '');
    }
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch file from Dropbox' }, { status: 400 });
    }
    const data = await res.json();
    // Insert into pending_imports
    const { error } = await supabase.from('pending_imports').insert([
      {
        id: crypto.randomUUID(),
        data,
        created_at: new Date().toISOString(),
        filename: filename || null,
        dropbox_link: dropbox_link,
      },
    ]);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    let message = 'Failed to process webhook';
    if (err instanceof Error) message = err.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
} 