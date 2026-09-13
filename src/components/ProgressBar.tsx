'use client';

import type { ProgressResponse } from '@/lib/types';

const PHASE_LABEL: Record<ProgressResponse['phase'], string> = {
  uploading: 'Preparando lienzo y subiendo a ComfyUI...',
  queued: 'En cola de ComfyUI...',
  running: 'Generando la extension con IA...',
  compositing: 'Recomponiendo imagen y recortando paneles...',
  done: 'Completado',
  error: 'Error'
};

export default function ProgressBar({ status }: { status: ProgressResponse | null }) {
  if (!status) return null;

  const pct = status.progress ? Math.round((status.progress.value / status.progress.max) * 100) : null;

  return (
    <div className="progress">
      <div className="progress__track">
        <div
          className={`progress__fill ${pct === null ? 'progress__fill--indeterminate' : ''}`}
          style={pct !== null ? { width: `${pct}%` } : undefined}
        />
      </div>
      <p className="progress__label">
        {PHASE_LABEL[status.phase]}
        {pct !== null ? ` (${pct}%)` : ''}
      </p>
      {status.error && <p className="progress__error">{status.error}</p>}
    </div>
  );
}
