import sharp from 'sharp';
import { createMaskBuffer } from './mask';
import type { ExpandedCanvasResult, Rect } from './types';

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
 * Calcula el color medio del artwork (muestreando un borde de unos pocos
 * pixeles) para usarlo como fondo inicial del lienzo. Da a la IA un punto
 * de partida tonal mas coherente que un gris neutro cuando el denoise es
 * bajo.
 */
async function estimateBorderColor(image: sharp.Sharp): Promise<{ r: number; g: number; b: number }> {
  const { dominant } = await image.stats().then((stats) => ({
    dominant: stats.dominant
  }));
  return { r: dominant.r, g: dominant.g, b: dominant.b };
}

export interface BuildExpandedCanvasParams {
  sourceImageBuffer: Buffer;
  cropRect: Rect;
  panelWidth: number;
  panelHeight: number;
}

/**
 * Construye el lienzo 3x3 con el artwork centrado (sin deformar, escalado
 * a "contain" dentro de la celda central) y su mascara de proteccion.
 */
export async function buildExpandedCanvas(params: BuildExpandedCanvasParams): Promise<ExpandedCanvasResult> {
  const { sourceImageBuffer, cropRect } = params;
  const panelWidth = alignToMultiple(params.panelWidth);
  const panelHeight = alignToMultiple(params.panelHeight);

  const canvasWidth = panelWidth * 3;
  const canvasHeight = panelHeight * 3;

  const rectX = Math.round(cropRect.x);
  const rectY = Math.round(cropRect.y);
  const rectW = Math.max(1, Math.round(cropRect.width));
  const rectH = Math.max(1, Math.round(cropRect.height));

  const croppedArtwork = sharp(sourceImageBuffer).extract({ left: rectX, top: rectY, width: rectW, height: rectH });

  const scale = Math.min(panelWidth / rectW, panelHeight / rectH);
  const resizedW = Math.max(1, Math.round(rectW * scale));
  const resizedH = Math.max(1, Math.round(rectH * scale));

  const resizedArtworkPng = await croppedArtwork
    .clone()
    .resize(resizedW, resizedH, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();

  const backgroundColor = await estimateBorderColor(sharp(resizedArtworkPng));

  const placement: Rect = {
    x: Math.round((canvasWidth - resizedW) / 2),
    y: Math.round((canvasHeight - resizedH) / 2),
    width: resizedW,
    height: resizedH
  };

  const canvasPng = await sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 3,
      background: backgroundColor
    }
  })
    .composite([{ input: resizedArtworkPng, left: placement.x, top: placement.y }])
    .png()
    .toBuffer();

  const maskPng = await createMaskBuffer(canvasWidth, canvasHeight, placement);

  return {
    canvasPng,
    maskPng,
    resizedArtworkPng,
    placement,
    canvasWidth,
    canvasHeight,
    panelWidth,
    panelHeight
  };
}

/**
 * Vuelve a pegar el artwork original (bytes exactos, sin recomprimir con
 * perdida) sobre la imagen generada por la IA, garantizando que ningun
 * pixel original fue alterado por el modelo.
 */
export async function reinsertOriginalArtwork(
  generatedPng: Buffer,
  resizedArtworkPng: Buffer,
  placement: Rect
): Promise<Buffer> {
  return sharp(generatedPng)
    .composite([{ input: resizedArtworkPng, left: placement.x, top: placement.y }])
    .png()
    .toBuffer();
}
