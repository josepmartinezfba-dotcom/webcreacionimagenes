export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GenerateFormValues {
  panelWidth: number;
  panelHeight: number;
  positivePrompt: string;
  negativePrompt: string;
  seed: number;
  steps: number;
  guidance: number;
  denoise: number;
  comfyUrl: string;
}

export interface ProgressResponse {
  jobId: string;
  phase: 'uploading' | 'queued' | 'running' | 'compositing' | 'done' | 'error';
  promptId?: string;
  progress?: { value: number; max: number };
  error?: string;
  ready: boolean;
  result?: {
    panels: Array<{ key: string; file: string }>;
    canvasWidth: number;
    canvasHeight: number;
    panelWidth: number;
    panelHeight: number;
    seedUsed: number;
  };
}
