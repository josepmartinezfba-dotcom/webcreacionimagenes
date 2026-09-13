'use client';

import type { GenerateFormValues } from '@/lib/types';

interface ControlsPanelProps {
  values: GenerateFormValues;
  onChange: (values: GenerateFormValues) => void;
  onRandomSeed: () => void;
  onGenerate: () => void;
  disabled: boolean;
  canGenerate: boolean;
}

export default function ControlsPanel({
  values,
  onChange,
  onRandomSeed,
  onGenerate,
  disabled,
  canGenerate
}: ControlsPanelProps) {
  function set<K extends keyof GenerateFormValues>(key: K, value: GenerateFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  return (
    <div className="controls-panel">
      <div className="controls-grid">
        <label className="field">
          <span>Ancho de cada panel (px)</span>
          <input
            type="number"
            min={64}
            step={16}
            value={values.panelWidth}
            disabled={disabled}
            onChange={(e) => set('panelWidth', Number(e.target.value))}
          />
        </label>
        <label className="field">
          <span>Alto de cada panel (px)</span>
          <input
            type="number"
            min={64}
            step={16}
            value={values.panelHeight}
            disabled={disabled}
            onChange={(e) => set('panelHeight', Number(e.target.value))}
          />
        </label>
      </div>

      <label className="field">
        <span>Prompt (opcional)</span>
        <textarea
          rows={2}
          placeholder="Describe el estilo o escenario si quieres guiar la extension"
          value={values.positivePrompt}
          disabled={disabled}
          onChange={(e) => set('positivePrompt', e.target.value)}
        />
      </label>

      <label className="field">
        <span>Negative prompt (opcional)</span>
        <textarea
          rows={2}
          value={values.negativePrompt}
          disabled={disabled}
          onChange={(e) => set('negativePrompt', e.target.value)}
        />
      </label>

      <div className="controls-grid">
        <label className="field">
          <span>Seed</span>
          <div className="field-with-button">
            <input
              type="number"
              value={values.seed}
              disabled={disabled}
              onChange={(e) => set('seed', Number(e.target.value))}
            />
            <button type="button" className="btn btn--secondary" disabled={disabled} onClick={onRandomSeed}>
              Nueva seed
            </button>
          </div>
        </label>
        <label className="field">
          <span>Steps</span>
          <input
            type="number"
            min={4}
            max={60}
            value={values.steps}
            disabled={disabled}
            onChange={(e) => set('steps', Number(e.target.value))}
          />
        </label>
        <label className="field">
          <span>Guidance</span>
          <input
            type="number"
            min={1}
            max={100}
            step={0.5}
            value={values.guidance}
            disabled={disabled}
            onChange={(e) => set('guidance', Number(e.target.value))}
          />
        </label>
        <label className="field">
          <span>Denoise</span>
          <input
            type="number"
            min={0.1}
            max={1}
            step={0.01}
            value={values.denoise}
            disabled={disabled}
            onChange={(e) => set('denoise', Number(e.target.value))}
          />
        </label>
      </div>

      <button type="button" className="btn btn--primary btn--large" disabled={disabled || !canGenerate} onClick={onGenerate}>
        Generar expansion
      </button>
      {!canGenerate && <p className="hint">Selecciona primero el area del artwork con el rectangulo de recorte.</p>}
    </div>
  );
}
