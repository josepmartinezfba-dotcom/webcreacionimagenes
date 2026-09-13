import type { ComfyStatus, HistoryEntry, QueuePromptResponse } from './types';
import { loadWorkflowMap } from '@/lib/workflow/loader';

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`ComfyUI respondio ${res.status} ${res.statusText}: ${body.slice(0, 500)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Comprueba que ComfyUI esta activo y, de paso, que los archivos de modelo
 * requeridos por el workflow (unet/clip/vae) existen en la instalacion.
 */
export async function checkComfyStatus(baseUrl: string): Promise<ComfyStatus> {
  const url = normalizeUrl(baseUrl);
  try {
    const stats = await fetchJson<{
      system: { comfyui_version?: string; python_version?: string };
      devices: Array<{ name: string; type: string; vram_total?: number; vram_free?: number }>;
    }>(`${url}/system_stats`);

    const missingModels = await findMissingModels(url).catch(() => []);

    return {
      online: true,
      url,
      systemStats: {
        comfyuiVersion: stats.system?.comfyui_version,
        pythonVersion: stats.system?.python_version,
        devices: stats.devices
      },
      missingModels
    };
  } catch (err) {
    return {
      online: false,
      url,
      error: err instanceof Error ? err.message : 'No se pudo conectar con ComfyUI'
    };
  }
}

// Nodos de carga de modelo de difusion que la app sabe validar contra
// ComfyUI. Incluye el loader nativo y las variantes GGUF de ComfyUI-GGUF
// (city96), todas expuestas con el mismo input "unet_name". Si el
// workflow activo usa cualquiera de estos, se comprueba el archivo
// declarado contra la lista real que ComfyUI reporta para ese nodo
// concreto (no se asume un unico nombre de archivo "obligatorio").
const UNET_LOADER_CLASS_TYPES = ['UNETLoader', 'UnetLoaderGGUF', 'UnetLoaderGGUFAdvanced'];

async function findMissingModels(url: string): Promise<string[]> {
  const { workflow, map } = await loadWorkflowMap();
  const missing: string[] = [];

  const checks: Array<{ classType: string; input: string; filename: string | undefined }> = [];
  for (const node of Object.values(workflow)) {
    if (UNET_LOADER_CLASS_TYPES.includes(node.class_type)) {
      checks.push({ classType: node.class_type, input: 'unet_name', filename: node.inputs.unet_name as string });
    }
    if (node.class_type === 'DualCLIPLoader') {
      checks.push({ classType: 'DualCLIPLoader', input: 'clip_name1', filename: node.inputs.clip_name1 as string });
      checks.push({ classType: 'DualCLIPLoader', input: 'clip_name2', filename: node.inputs.clip_name2 as string });
    }
    if (node.class_type === 'VAELoader') {
      checks.push({ classType: 'VAELoader', input: 'vae_name', filename: node.inputs.vae_name as string });
    }
  }
  void map;

  const objectInfoCache = new Map<string, unknown>();
  for (const check of checks) {
    if (!check.filename) continue;
    if (!objectInfoCache.has(check.classType)) {
      try {
        const info = await fetchJson<Record<string, unknown>>(`${url}/object_info/${check.classType}`);
        objectInfoCache.set(check.classType, info);
      } catch {
        continue;
      }
    }
    const info = objectInfoCache.get(check.classType) as Record<string, unknown> | undefined;
    const options = extractOptions(info, check.classType, check.input);
    if (options && !options.includes(check.filename)) {
      missing.push(check.filename);
    }
  }
  return missing;
}

function extractOptions(
  info: Record<string, unknown> | undefined,
  classType: string,
  input: string
): string[] | null {
  try {
    const nodeInfo = info?.[classType] as { input?: { required?: Record<string, unknown> } } | undefined;
    const spec = nodeInfo?.input?.required?.[input];
    if (Array.isArray(spec) && Array.isArray(spec[0])) {
      return spec[0] as string[];
    }
    return null;
  } catch {
    return null;
  }
}

export type ComfyUploadType = 'input' | 'mask' | 'temp';

export async function uploadImage(
  baseUrl: string,
  buffer: Buffer,
  filename: string,
  type: ComfyUploadType = 'input'
): Promise<{ name: string; subfolder: string; type: string }> {
  const url = normalizeUrl(baseUrl);
  const form = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: 'image/png' });
  form.append('image', blob, filename);
  form.append('type', type);
  form.append('overwrite', 'true');

  const res = await fetch(`${url}/upload/image`, { method: 'POST', body: form });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Error subiendo imagen a ComfyUI (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json();
}

export async function queuePrompt(
  baseUrl: string,
  workflow: Record<string, unknown>,
  clientId: string
): Promise<QueuePromptResponse> {
  const url = normalizeUrl(baseUrl);
  const res = await fetch(`${url}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: clientId })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let message = body;
    try {
      const parsed = JSON.parse(body);
      message = parsed?.error?.message || parsed?.node_errors ? JSON.stringify(parsed.node_errors ?? parsed.error) : body;
    } catch {
      /* keep raw body */
    }
    throw new Error(`ComfyUI rechazo el workflow (${res.status}): ${message.slice(0, 800)}`);
  }
  return res.json();
}

export async function getHistory(baseUrl: string, promptId: string): Promise<HistoryEntry | null> {
  const url = normalizeUrl(baseUrl);
  const res = await fetch(`${url}/history/${promptId}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data[promptId] ?? null;
}

export async function getQueueStatus(baseUrl: string): Promise<{ running: number; pending: number }> {
  const url = normalizeUrl(baseUrl);
  const data = await fetchJson<{ queue_running: unknown[]; queue_pending: unknown[] }>(`${url}/queue`);
  return { running: data.queue_running.length, pending: data.queue_pending.length };
}

export async function fetchOutputImage(
  baseUrl: string,
  filename: string,
  subfolder: string,
  type: string
): Promise<Buffer> {
  const url = normalizeUrl(baseUrl);
  const params = new URLSearchParams({ filename, subfolder, type });
  const res = await fetch(`${url}/view?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`No se pudo recuperar la imagen generada (${res.status})`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Espera a que un prompt termine, consultando el historial periodicamente.
 * Evita depender de websockets para mantener el cliente simple y robusto.
 */
export async function waitForPrompt(
  baseUrl: string,
  promptId: string,
  opts: { timeoutMs?: number; intervalMs?: number; onTick?: (elapsedMs: number) => void } = {}
): Promise<HistoryEntry> {
  const timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000;
  const intervalMs = opts.intervalMs ?? 1500;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const entry = await getHistory(baseUrl, promptId);
    if (entry) {
      const hasError = entry.status?.messages?.some((m) => m[0] === 'execution_error');
      if (hasError) {
        const errMsg = entry.status?.messages?.find((m) => m[0] === 'execution_error')?.[1];
        throw new Error(`ComfyUI fallo durante la generacion: ${JSON.stringify(errMsg).slice(0, 800)}`);
      }
      if (entry.status?.completed) {
        return entry;
      }
    }
    opts.onTick?.(Date.now() - start);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Tiempo de espera agotado esperando la generacion de ComfyUI');
}
