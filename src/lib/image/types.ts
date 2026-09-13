export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExpandedCanvasResult {
  canvasPng: Buffer;
  maskPng: Buffer;
  resizedArtworkPng: Buffer;
  placement: Rect;
  canvasWidth: number;
  canvasHeight: number;
  panelWidth: number;
  panelHeight: number;
}
