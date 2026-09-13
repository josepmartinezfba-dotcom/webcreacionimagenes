'use client';

import { PANEL_ORDER } from '@/lib/config';
import Grid3x3Preview from './Grid3x3Preview';

interface ResultsPanelProps {
  jobId: string;
  canvasWidth: number;
  canvasHeight: number;
  panelWidth: number;
  panelHeight: number;
  seedUsed: number;
}

function downloadAllPanels(jobId: string) {
  PANEL_ORDER.forEach((panel, index) => {
    setTimeout(() => {
      const a = document.createElement('a');
      a.href = `/api/comfyui/result/${jobId}?kind=panel&panel=${panel.key}`;
      a.download = panel.file;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }, index * 350);
  });
}

export default function ResultsPanel({ jobId, canvasWidth, canvasHeight, panelWidth, panelHeight, seedUsed }: ResultsPanelProps) {
  const previewUrl = `/api/comfyui/result/${jobId}?kind=preview`;

  return (
    <section className="results">
      <h2>Resultado</h2>
      <p className="hint">Seed usada: {seedUsed}</p>

      <div className="results__columns">
        <div>
          <h3>Previsualizacion completa</h3>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Composicion 3x3 completa" className="results__preview" />
        </div>
        <div>
          <h3>Vista en cuadricula 3x3</h3>
          <Grid3x3Preview
            jobId={jobId}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            panelWidth={panelWidth}
            panelHeight={panelHeight}
          />
        </div>
      </div>

      <div className="results__downloads">
        <div className="results__download-list">
          {PANEL_ORDER.map((panel) => (
            <a
              key={panel.key}
              className="btn btn--secondary"
              href={`/api/comfyui/result/${jobId}?kind=panel&panel=${panel.key}`}
              download={panel.file}
            >
              {panel.file}
            </a>
          ))}
        </div>
        <div className="results__download-actions">
          <button type="button" className="btn btn--primary" onClick={() => downloadAllPanels(jobId)}>
            Descargar las 8 imagenes
          </button>
          <a className="btn btn--primary" href={`/api/comfyui/result/${jobId}?kind=zip`} download="expansion_carta.zip">
            Descargar ZIP
          </a>
        </div>
      </div>
    </section>
  );
}
