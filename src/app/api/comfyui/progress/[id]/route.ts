import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/jobs';

export const runtime = 'nodejs';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) {
    return NextResponse.json({ error: 'Trabajo no encontrado (puede haber expirado).' }, { status: 404 });
  }

  return NextResponse.json({
    jobId: job.id,
    phase: job.phase,
    promptId: job.promptId,
    progress: job.progress,
    error: job.error,
    ready: job.phase === 'done',
    result:
      job.phase === 'done' && job.result
        ? {
            panels: job.result.panels.map((p) => ({ key: p.key, file: p.file })),
            canvasWidth: job.result.canvasWidth,
            canvasHeight: job.result.canvasHeight,
            panelWidth: job.result.panelWidth,
            panelHeight: job.result.panelHeight,
            seedUsed: job.result.seedUsed
          }
        : undefined
  });
}
