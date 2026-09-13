export interface ComfyStatus {
  online: boolean;
  url: string;
  error?: string;
  systemStats?: {
    comfyuiVersion?: string;
    pythonVersion?: string;
    devices?: Array<{ name: string; type: string; vram_total?: number; vram_free?: number }>;
  };
  missingModels?: string[];
}

export interface QueuePromptResponse {
  prompt_id: string;
  number: number;
  node_errors: Record<string, unknown>;
}

export interface HistoryEntry {
  prompt: unknown;
  outputs: Record<
    string,
    {
      images?: Array<{ filename: string; subfolder: string; type: string }>;
    }
  >;
  status?: {
    status_str: string;
    completed: boolean;
    messages: Array<[string, Record<string, unknown>]>;
  };
}

export interface GenerationParams {
  positivePrompt?: string;
  negativePrompt?: string;
  seed: number;
  steps: number;
  guidance: number;
  denoise: number;
}

export type GenerationPhase =
  | 'idle'
  | 'uploading'
  | 'queued'
  | 'running'
  | 'compositing'
  | 'done'
  | 'error';

export interface GenerationJobStatus {
  jobId: string;
  phase: GenerationPhase;
  promptId?: string;
  progress?: { value: number; max: number };
  error?: string;
}
