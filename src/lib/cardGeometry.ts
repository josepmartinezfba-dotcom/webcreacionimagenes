/**
 * Geometria compartida entre cliente y servidor: a partir del tamaño real
 * de la carta subida (no del recorte del artwork) calcula el tamaño de
 * panel que van a tener las 9 celdas de la composicion 3x3, respetando
 * siempre la relacion de aspecto de la carta. No depende de "sharp" ni de
 * ninguna API de Node para poder importarse tambien desde componentes de
 * cliente (mostrar "Tamaño de cada imagen: W x H" antes de generar).
 */

export type QualityPreset = 'low' | 'normal' | 'high';

export interface QualityPresetInfo {
  label: string;
  description: string;
  /** Lado largo objetivo (en px) del panel, antes de alinear a multiplos de 16. */
  longSide: number;
}

// Objetivos conservadores para una GPU de 8 GB (RTX 4070 Laptop) generando
// con FLUX.1-Fill-dev GGUF Q4_K_S: el lienzo completo que se envia a
// ComfyUI mide 3x este tamaño en cada eje (9 celdas), asi que el numero de
// megapixels crece con el cuadrado del panel. La cuantizacion GGUF reduce
// el peso de los pesos del modelo en VRAM, pero NO reduce la memoria de
// activaciones, que depende de la resolucion generada.
export const QUALITY_PRESETS: Record<QualityPreset, QualityPresetInfo> = {
  low: {
    label: 'Baja / Prueba',
    description: 'Muy rapido, ideal para comprobar composicion y mascara antes de una generacion larga.',
    longSide: 320
  },
  normal: {
    label: 'Normal',
    description: 'Recomendado para 8 GB de VRAM (RTX 4070 Laptop y similares) con el modelo GGUF Q4_K_S.',
    longSide: 448
  },
  high: {
    label: 'Alta',
    description: 'Mas detalle, pero mas lenta y con mas riesgo de quedarse sin VRAM en 8 GB.',
    longSide: 576
  }
};

/**
 * Redondea al multiplo mas cercano (minimo `min`). Los modelos de difusion
 * (incluido FLUX) trabajan en el espacio latente con un factor de reduccion
 * de 8-16x, asi que el ancho/alto final deben ser multiplos de 16 para
 * evitar artefactos o errores del VAE.
 */
export function alignToMultiple(value: number, multiple = 16, min = 64): number {
  const aligned = Math.round(value / multiple) * multiple;
  return Math.max(min, aligned);
}

/**
 * Calcula el ancho/alto de cada uno de los 9 paneles a partir del tamaño
 * real de la carta y la calidad elegida, manteniendo su relacion de
 * aspecto exacta (salvo el redondeo a multiplos de 16). El lienzo 3x3
 * completo mide siempre panelWidth*3 x panelHeight*3.
 */
export function computePanelDimensions(
  cardWidth: number,
  cardHeight: number,
  quality: QualityPreset
): { width: number; height: number } {
  const longSideTarget = QUALITY_PRESETS[quality].longSide;
  const isPortrait = cardHeight >= cardWidth;
  const longSide = alignToMultiple(longSideTarget);
  const ratio = isPortrait ? cardWidth / cardHeight : cardHeight / cardWidth;
  const shortSide = alignToMultiple(longSideTarget * ratio);
  return isPortrait ? { width: shortSide, height: longSide } : { width: longSide, height: shortSide };
}

export function isQualityPreset(value: unknown): value is QualityPreset {
  return value === 'low' || value === 'normal' || value === 'high';
}
