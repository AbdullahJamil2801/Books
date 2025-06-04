import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const transactions = Array.isArray(body) ? body : [body];

    // Validate required fields
    for (const t of transactions) {
      if (!t.date || typeof t.amount !== 'number') {
        return NextResponse.json({ error: 'Missing required fields in one or more transactions.' }, { status: 400 });
      }
    }

    // Insert into Supabase
    const { data, error } = await supabase
      .from('transactions')
      .insert(transactions);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Explicitly cast data as unknown[] before accessing length
    return NextResponse.json({ success: true, inserted: data ? (data as unknown[]).length : 0 });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
} 