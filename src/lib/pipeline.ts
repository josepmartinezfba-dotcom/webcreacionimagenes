import { randomUUID } from 'crypto';
import { buildExpandedCanvas, reinsertOriginalArtwork } from '@/lib/image/canvas';
import { splitIntoPanels } from '@/lib/image/split';
import { createZipBuffer } from '@/lib/image/zip';
import { checkComfyStatus, fetchOutputImage, queuePrompt, uploadImage, waitForPrompt } from '@/lib/comfyui/client';
import { buildPrompt, loadWorkflowMap } from '@/lib/workflow/loader';
import { updateJob } from '@/lib/jobs';
import type { Rect } from '@/lib/image/types';

export interface RunOutpaintParams {
  jobId: string;
  comfyUrl: string;
  sourceImageBuffer: Buffer;
  cropRect: Rect;
  panelWidth: number;
  panelHeight: number;
  positivePrompt?: string;
  negativePrompt?: string;
  seed: number;
  steps: number;
  guidance: number;
  denoise: number;
}

function openProgressSocket(comfyUrl: string, clientId: string, jobId: string): { close: () => void } {
  try {
    const wsUrl = `${comfyUrl.replace(/^http/, 'ws')}/ws?clientId=${clientId}`;
    if (typeof WebSocket === 'undefined') return { close: () => {} };
    const socket = new WebSocket(wsUrl);
    socket.addEventListener('message', (event: MessageEvent) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : null;
        if (data?.type === 'progress' && data.data) {
          updateJob(jobId, { phase: 'running', progress: { value: data.data.value, max: data.data.max } });
        }
      } catch {
        /* mensajes no JSON o inesperados: se ignoran, no son criticos */
      }
    });
    socket.addEventListener('error', () => {});
    return { close: () => socket.close() };
  } catch {
    return { close: () => {} };
  }
}

export async function runOutpaintJob(params: RunOutpaintParams): Promise<void> {
  const { jobId } = params;
  try {
    const status = await checkComfyStatus(params.comfyUrl);
    if (!status.online) {
      throw new Error(`No se pudo conectar con ComfyUI en ${params.comfyUrl}: ${status.error}`);
    }

    updateJob(jobId, { phase: 'uploading' });
    const canvasResult = await buildExpandedCanvas({
      sourceImageBuffer: params.sourceImageBuffer,
      cropRect: params.cropRect,
      panelWidth: params.panelWidth,
      panelHeight: params.panelHeight
    });

    const canvasUpload = await uploadImage(
      params.comfyUrl,
      canvasResult.canvasPng,
      `expand_canvas_${jobId}.png`,
      'input'
    );
    const maskUpload = await uploadImage(params.comfyUrl, canvasResult.maskPng, `expand_mask_${jobId}.png`, 'input');

    const { workflow, map } = await loadWorkflowMap();
    const { prompt, outputNodeId } = buildPrompt(workflow, map, {
      inputImageFilename: canvasUpload.name,
      maskImageFilename: maskUpload.name,
      positivePrompt: params.positivePrompt,
      negativePrompt: params.negativePrompt,
      seed: params.seed,
      steps: params.steps,
      guidance: params.guidance,
      denoise: params.denoise
    });

    const clientId = randomUUID();
    const socket = openProgressSocket(params.comfyUrl, clientId, jobId);

    let queueResponse;
    try {
      queueResponse = await queuePrompt(params.comfyUrl, prompt, clientId);
    } catch (err) {
      socket.close();
      throw err;
    }

    updateJob(jobId, { phase: 'queued', promptId: queueResponse.prompt_id });

    let historyEntry;
    try {
      historyEntry = await waitForPrompt(params.comfyUrl, queueResponse.prompt_id, {
        onTick: () => updateJob(jobId, { phase: 'running' })
      });
    } finally {
      socket.close();
    }

    const outputImages = historyEntry.outputs?.[outputNodeId]?.images;
    if (!outputImages || outputImages.length === 0) {
      throw new Error('ComfyUI termino la ejecucion pero no genero ninguna imagen de salida.');
    }
    const output = outputImages[0];

    updateJob(jobId, { phase: 'compositing' });
    const generatedBuffer = await fetchOutputImage(params.comfyUrl, output.filename, output.subfolder, output.type);

    const finalPng = await reinsertOriginalArtwork(generatedBuffer, canvasResult.resizedArtworkPng, canvasResult.placement);

    const panels = await splitIntoPanels(finalPng, canvasResult.panelWidth, canvasResult.panelHeight);
    const zipBuffer = await createZipBuffer(panels, finalPng);

    updateJob(jobId, {
      phase: 'done',
      result: {
        panels,
        previewPng: finalPng,
        zipBuffer,
        canvasWidth: canvasResult.canvasWidth,
        canvasHeight: canvasResult.canvasHeight,
        panelWidth: canvasResult.panelWidth,
        panelHeight: canvasResult.panelHeight,
        seedUsed: params.seed
      }
    });
  } catch (err) {
    updateJob(jobId, { phase: 'error', error: err instanceof Error ? err.message : String(err) });
  }
}
