'use client';

import { QUALITY_PRESETS, computePanelDimensions, type QualityPreset } from '@/lib/cardGeometry';
import type { GenerateFormValues } from '@/lib/types';

interface ControlsPanelProps {
  values: GenerateFormValues;
  onChange: (values: GenerateFormValues) => void;
  onRandomSeed: () => void;
  onGenerate: () => void;
  disabled: boolean;
  canGenerate: boolean;
  /** Tamaño natural de la carta subida (para calcular y mostrar W x H por panel). */
  cardSize: { width: number; height: number } | null;
}

const QUALITY_ORDER: QualityPreset[] = ['low', 'normal', 'high'];

export default function ControlsPanel({
  values,
  onChange,
  onRandomSeed,
  onGenerate,
  disabled,
  canGenerate,
  cardSize
}: ControlsPanelProps) {
  function set<K extends keyof GenerateFormValues>(key: K, value: GenerateFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  const panelSize = cardSize ? computePanelDimensions(cardSize.width, cardSize.height, values.quality) : null;

  return (
    <div className="controls-panel">
      <div className="field">
        <span>Calidad / resolucion de cada imagen</span>
        <div className="quality-options">
          {QUALITY_ORDER.map((key) => (
            <label key={key} className={`quality-option ${values.quality === key ? 'is-selected' : ''}`}>
              <input
                type="radio"
                name="quality"
                value={key}
                checked={values.quality === key}
                disabled={disabled}
                onChange={() => set('quality', key)}
              />
              <span className="quality-option__label">{QUALITY_PRESETS[key].label}</span>
              <span className="quality-option__desc">{QUALITY_PRESETS[key].description}</span>
            </label>
          ))}
        </div>
        <p className="hint">
          {panelSize
            ? `Tamaño de cada una de las 9 imagenes: ${panelSize.width} x ${panelSize.height} px (misma proporcion que tu carta). Lienzo completo: ${panelSize.width * 3} x ${panelSize.height * 3} px.`
            : 'Sube una carta para calcular el tamaño exacto de cada imagen (se usa la proporcion de la carta completa).'}
        </p>
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
