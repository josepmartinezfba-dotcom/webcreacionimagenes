import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/jobs';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = getJob(id);
  if (!job || job.phase !== 'done' || !job.result) {
    return NextResponse.json({ error: 'El resultado todavia no esta disponible.' }, { status: 404 });
  }

  const kind = request.nextUrl.searchParams.get('kind') || 'preview';

  if (kind === 'preview') {
    return new NextResponse(new Uint8Array(job.result.previewPng), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }
    });
  }

  if (kind === 'zip') {
    return new NextResponse(new Uint8Array(job.result.zipBuffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="expansion_carta.zip"',
        'Cache-Control': 'no-store'
      }
    });
  }

  if (kind === 'panel') {
    const key = request.nextUrl.searchParams.get('panel');
    const panel = job.result.panels.find((p) => p.key === key);
    if (!panel) {
      return NextResponse.json({ error: `Panel "${key}" no encontrado.` }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(panel.buffer), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="${panel.file}"`,
        'Cache-Control': 'no-store'
      }
    });
  }

  return NextResponse.json({ error: 'Tipo de resultado desconocido.' }, { status: 400 });
}
