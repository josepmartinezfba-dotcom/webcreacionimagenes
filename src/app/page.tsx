'use client';

import { useEffect, useRef, useState } from 'react';
import Dropzone from '@/components/Dropzone';
import CropSelector from '@/components/CropSelector';
import ControlsPanel from '@/components/ControlsPanel';
import ConnectionStatus from '@/components/ConnectionStatus';
import ProgressBar from '@/components/ProgressBar';
import ResultsPanel from '@/components/ResultsPanel';
import { DEFAULT_COMFYUI_URL } from '@/lib/config';
import type { GenerateFormValues, ProgressResponse, Rect } from '@/lib/types';

const DEFAULT_VALUES: GenerateFormValues = {
  quality: 'normal',
  exportOriginalSize: true,
  positivePrompt: '',
  negativePrompt: '',
  seed: 0,
  steps: 20,
  guidance: 30,
  denoise: 1,
  comfyUrl: DEFAULT_COMFYUI_URL
};

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [cropRect, setCropRect] = useState<Rect | null>(null);
  const [cardSize, setCardSize] = useState<{ width: number; height: number } | null>(null);
  const [values, setValues] = useState<GenerateFormValues>(DEFAULT_VALUES);
  const [status, setStatus] = useState<ProgressResponse | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFileSelected(selected: File) {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setFile(selected);
    setImageUrl(URL.createObjectURL(selected));
    setCropRect(null);
    setCardSize(null);
    setStatus(null);
  }

  function handleRandomSeed() {
    setValues((v) => ({ ...v, seed: Math.floor(Math.random() * 4294967295) }));
  }

  async function handleGenerate() {
    if (!file || !cropRect) return;

    const form = new FormData();
    form.append('image', file);
    form.append('cropX', String(cropRect.x));
    form.append('cropY', String(cropRect.y));
    form.append('cropWidth', String(cropRect.width));
    form.append('cropHeight', String(cropRect.height));
    form.append('quality', values.quality);
    form.append('exportOriginalSize', String(values.exportOriginalSize));
    form.append('positivePrompt', values.positivePrompt);
    form.append('negativePrompt', values.negativePrompt);
    form.append('seed', String(values.seed));
    form.append('steps', String(values.steps));
    form.append('guidance', String(values.guidance));
    form.append('denoise', String(values.denoise));
    form.append('comfyUrl', values.comfyUrl);

    setStatus({ jobId: '', phase: 'uploading', ready: false });

    let res: Response;
    try {
      res = await fetch('/api/comfyui/generate', { method: 'POST', body: form });
    } catch {
      setStatus({ jobId: '', phase: 'error', ready: false, error: 'No se pudo contactar con el servidor local de la app.' });
      return;
    }

    const data = await res.json();
    if (!res.ok) {
      setStatus({ jobId: '', phase: 'error', ready: false, error: data.error || 'Error desconocido al iniciar la generacion.' });
      return;
    }

    const jobId: string = data.jobId;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const pollRes = await fetch(`/api/comfyui/progress/${jobId}`);
        const pollData: ProgressResponse = await pollRes.json();
        setStatus(pollData);
        if (pollData.phase === 'done' || pollData.phase === 'error') {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        /* se reintenta en el siguiente tick */
      }
    }, 1200);
  }

  const isGenerating = status !== null && status.phase !== 'done' && status.phase !== 'error';

  return (
    <main className="page">
      <header className="page__header">
        <h1>Expansor de fondos para cartas coleccionables</h1>
        <p className="hint">
          Ejecucion 100% local con ComfyUI. Ninguna imagen sale de tu ordenador. El resultado es una
          cuadricula 3x3: tu carta completa en el centro, y 8 imagenes generadas por IA que continuan
          su ilustracion hacia fuera.
        </p>
      </header>

      <ConnectionStatus comfyUrl={values.comfyUrl} onUrlChange={(url) => setValues((v) => ({ ...v, comfyUrl: url }))} />

      {!imageUrl && <Dropzone onFileSelected={handleFileSelected} />}

      {imageUrl && (
        <section className="workspace">
          <div className="workspace__crop">
            <div className="workspace__crop-header">
              <h2>1. Selecciona el artwork de la carta</h2>
              <button type="button" className="btn btn--secondary" onClick={() => handleFileSelected(file!)}>
                Cambiar imagen
              </button>
            </div>
            <CropSelector imageUrl={imageUrl} onCropChange={setCropRect} onImageLoad={(w, h) => setCardSize({ width: w, height: h })} />
          </div>

          <div className="workspace__controls">
            <h2>2. Configura la expansion</h2>
            <ControlsPanel
              values={values}
              onChange={setValues}
              onRandomSeed={handleRandomSeed}
              onGenerate={handleGenerate}
              disabled={isGenerating}
              canGenerate={cropRect !== null}
              cardSize={cardSize}
            />
          </div>
        </section>
      )}

      {status && <ProgressBar status={status} />}

      {status?.phase === 'done' && status.result && status.jobId && (
        <ResultsPanel
          jobId={status.jobId}
          canvasWidth={status.result.canvasWidth}
          canvasHeight={status.result.canvasHeight}
          panelWidth={status.result.panelWidth}
          panelHeight={status.result.panelHeight}
          seedUsed={status.result.seedUsed}
        />
      )}
    </main>
  );
}
