import type { PanelImage } from '@/lib/image/split';

export type JobPhase = 'uploading' | 'queued' | 'running' | 'compositing' | 'done' | 'error';

export interface JobResult {
  panels: PanelImage[];
  previewPng: Buffer;
  zipBuffer: Buffer;
  canvasWidth: number;
  canvasHeight: number;
  panelWidth: number;
  panelHeight: number;
  seedUsed: number;
}

export interface JobRecord {
  id: string;
  phase: JobPhase;
  promptId?: string;
  progress?: { value: number; max: number };
  error?: string;
  createdAt: number;
  updatedAt: number;
  result?: JobResult;
}

const JOB_TTL_MS = 60 * 60 * 1000;
const jobs = new Map<string, JobRecord>();

export function createJob(id: string): JobRecord {
  const now = Date.now();
  const job: JobRecord = { id, phase: 'uploading', createdAt: now, updatedAt: now };
  jobs.set(id, job);
  cleanup();
  return job;
}

export function updateJob(id: string, patch: Partial<JobRecord>): void {
  const existing = jobs.get(id);
  if (!existing) return;
  jobs.set(id, { ...existing, ...patch, updatedAt: Date.now() });
}

export function getJob(id: string): JobRecord | undefined {
  return jobs.get(id);
}

function cleanup(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) jobs.delete(id);
  }
}
