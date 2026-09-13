export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExpandedCanvasResult {
  /** Lienzo 3x3 enviado a ComfyUI: fondo neutro + el artwork centrado como semilla visual. */
  canvasPng: Buffer;
  /** Mascara de outpainting (blanco = generar, negro = conservar). */
  maskPng: Buffer;
  /** Carta completa original, redimensionada exactamente a panelWidth x panelHeight (sin recortar ni deformar). */
  resizedFullCardPng: Buffer;
  /** Zona (siempre la celda central) donde se reinserta la carta completa tras generar. */
  cardPlacement: Rect;
  /** Zona donde se coloco el recorte del artwork como semilla para el outpainting. */
  seedPlacement: Rect;
  canvasWidth: number;
  canvasHeight: number;
  panelWidth: number;
  panelHeight: number;
}
