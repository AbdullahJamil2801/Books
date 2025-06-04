import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';

export async function POST(req: NextRequest) {
  try {
    const { id, data } = await req.json();
    if (!id || !Array.isArray(data)) {
      return NextResponse.json({ error: 'Expected id and data (array of transactions).' }, { status: 400 });
    }
    // Upsert the pending import
    const { error } = await supabase
      .from('pending_imports')
      .upsert([{ id, data }]);
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