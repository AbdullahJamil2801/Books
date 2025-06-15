import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, data, dropbox_link } = body;
    if (!id) {
      return NextResponse.json({ error: 'Missing id (importId) parameter.' }, { status: 400 });
    }
    let transactions = data;
    // If dropbox_link is provided, fetch the JSON from Dropbox
    if (dropbox_link) {
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
      transactions = await res.json();
    }
    if (!Array.isArray(transactions)) {
      return NextResponse.json({ error: 'Expected data (array of transactions) from Dropbox or direct.' }, { status: 400 });
    }
    // Upsert the pending import
    const { error } = await supabase
      .from('pending_imports')
      .upsert([{ id, data: transactions }]);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing id parameter.' }, { status: 400 });
  }
  // Get and delete the pending import
  const { data, error } = await supabase
    .from('pending_imports')
    .select('data')
    .eq('id', id)
    .single();
  if (error || !data) {
    return NextResponse.json({ data: null });
  }
  // Delete after retrieval
  await supabase.from('pending_imports').delete().eq('id', id);
  return NextResponse.json({ data: data.data });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing id parameter.' }, { status: 400 });
  }
  await supabase.from('pending_imports').delete().eq('id', id);
  return NextResponse.json({ success: true });
} 