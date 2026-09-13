import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createJob } from '@/lib/jobs';
import { runOutpaintJob } from '@/lib/pipeline';
import { DEFAULT_COMFYUI_URL } from '@/lib/config';
import { isQualityPreset } from '@/lib/cardGeometry';

export const runtime = 'nodejs';

function requireNumber(form: FormData, key: string): number {
  const raw = form.get(key);
  const value = Number(raw);
  if (raw === null || Number.isNaN(value)) {
    throw new Error(`El campo "${key}" es obligatorio y debe ser numerico.`);
  }
  return value;
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get('image');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No se ha recibido ninguna imagen.' }, { status: 400 });
    }

    const cropX = requireNumber(form, 'cropX');
    const cropY = requireNumber(form, 'cropY');
    const cropWidth = requireNumber(form, 'cropWidth');
    const cropHeight = requireNumber(form, 'cropHeight');
    const seed = requireNumber(form, 'seed');
    const steps = requireNumber(form, 'steps');
    const guidance = requireNumber(form, 'guidance');
    const denoise = requireNumber(form, 'denoise');

    if (cropWidth <= 0 || cropHeight <= 0) {
      return NextResponse.json({ error: 'El area de recorte del artwork no es valida.' }, { status: 400 });
    }

    const quality = form.get('quality');
    if (!isQualityPreset(quality)) {
      return NextResponse.json(
        { error: 'La calidad indicada no es valida (debe ser "low", "normal" o "high").' },
        { status: 400 }
      );
    }

    const positivePrompt = (form.get('positivePrompt') as string) || undefined;
    const negativePrompt = (form.get('negativePrompt') as string) || undefined;
    const comfyUrl = (form.get('comfyUrl') as string) || DEFAULT_COMFYUI_URL;

    const arrayBuffer = await file.arrayBuffer();
    const sourceImageBuffer = Buffer.from(arrayBuffer);

    const jobId = randomUUID();
    createJob(jobId);

    // Se ejecuta en segundo plano: el proceso Node sigue vivo (servidor
    // local persistente, no una funcion serverless), asi que el trabajo
    // continua tras devolver la respuesta con el jobId.
    void runOutpaintJob({
      jobId,
      comfyUrl,
      sourceImageBuffer,
      artworkCropRect: { x: cropX, y: cropY, width: cropWidth, height: cropHeight },
      quality,
      positivePrompt,
      negativePrompt,
      seed,
      steps,
      guidance,
      denoise
    });

    return NextResponse.json({ jobId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error inesperado al iniciar la generacion.' },
      { status: 400 }
    );
  }
}
