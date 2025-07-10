import { promises as fs } from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), './data');

// Ensure the data directory exists
async function ensureDataDirectory() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (error) {
    console.error('Error ensuring data directory:', error);
  }
}

// Handle POST requests for incoming PDF data from Make.com
export async function POST(req: NextRequest) {
  await ensureDataDirectory();
  try {
    const body = await req.json();
    const { id, data } = body;

    if (!id || !data) {
      return NextResponse.json({ success: false, error: 'Missing id or data' }, { status: 400 });
    }

    const filePath = path.join(DATA_DIR, `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing POST request:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

// Handle GET requests to retrieve processed PDF data
export async function GET(req: NextRequest) {
  await ensureDataDirectory();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ success: false, error: 'Missing id parameter' }, { status: 400 });
  }

  const filePath = path.join(DATA_DIR, `${id}.json`);

  try {
    const fileContents = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(fileContents);
    // Optionally delete the file after reading to clean up
    await fs.unlink(filePath);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return NextResponse.json({ success: false, error: 'Data not found or not ready yet' }, { status: 404 });
    }
    console.error('Error reading processed data:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing id parameter.' }, { status: 400 });
  }
  await fs.unlink(path.join(DATA_DIR, `${id}.json`));
  return NextResponse.json({ success: true });
} 