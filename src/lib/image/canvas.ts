import sharp from 'sharp';
import { computePanelDimensions, type QualityPreset } from '@/lib/cardGeometry';
import { createMaskBuffer } from './mask';
import type { ExpandedCanvasResult, Rect } from './types';

/**
 * Color de fondo del lienzo antes de enviarlo a ComfyUI. Es irrelevante
 * para el resultado (ver comentario en mask.ts: `InpaintModelConditioning`
 * sustituye por gris neutro cualquier pixel marcado como "generar" antes
 * de codificarlo), pero usamos gris neutro para que una inspeccion manual
 * de `canvas.png` sea facil de leer.
 */
const CANVAS_BACKGROUND = { r: 127, g: 127, b: 127 };

/** Fraccion del lado corto del panel usada como radio de difuminado del borde de la mascara. */
const FEATHER_RATIO = 0.02;
const FEATHER_MIN_PX = 4;
const FEATHER_MAX_PX = 24;

function computeFeatherPx(panelWidth: number, panelHeight: number): number {
  const raw = Math.min(panelWidth, panelHeight) * FEATHER_RATIO;
  return Math.min(FEATHER_MAX_PX, Math.max(FEATHER_MIN_PX, Math.round(raw)));
}

export interface BuildExpandedCanvasParams {
  /** La carta completa tal y como la subio el usuario (foto/escaneo). */
  sourceImageBuffer: Buffer;
  /** Rectangulo, en pixeles de sourceImageBuffer, que el usuario marco como el artwork/ilustracion. */
  artworkCropRect: Rect;
  quality: QualityPreset;
}

/**
 * Construye el lienzo 3x3 que se envia a ComfyUI y su mascara.
 *
 * Puntos clave del diseño (ver tambien la discusion en el README del
 * proyecto):
 * - El tamaño de panel (y por tanto de las 9 celdas) se deriva SIEMPRE de
 *   la relacion de aspecto de la carta completa (`sourceImageBuffer`), no
 *   del recorte del artwork ni de un ancho/alto arbitrario introducido a
 *   mano. Así la celda central puede alojar la carta completa sin
 *   letterboxing: como panelWidth:panelHeight == cardWidth:cardHeight por
 *   construccion, un resize "fill" de la carta a panelWidth x panelHeight
 *   no la deforma.
 * - Solo el recorte del artwork (no la carta completa, que incluiria el
 *   marco/texto) se usa como semilla visual para el outpainting: es lo
 *   unico que FLUX "ve" como contexto real al continuar el escenario.
 * - La carta completa (`resizedFullCardPng`) se guarda aparte para
 *   reinsertarla intacta en la celda central DESPUES de generar (ver
 *   `reinsertOriginalCard`); nunca se envia a la IA como si fuera el
 *   resultado final del centro.
 */
export async function buildExpandedCanvas(params: BuildExpandedCanvasParams): Promise<ExpandedCanvasResult> {
  const { sourceImageBuffer, artworkCropRect } = params;

  const cardMeta = await sharp(sourceImageBuffer).metadata();
  if (!cardMeta.width || !cardMeta.height) {
    throw new Error('No se pudo leer el tamaño de la imagen de la carta.');
  }

  const { width: panelWidth, height: panelHeight } = computePanelDimensions(
    cardMeta.width,
    cardMeta.height,
    params.quality
  );

  const canvasWidth = panelWidth * 3;
  const canvasHeight = panelHeight * 3;
  const centerX = panelWidth;
  const centerY = panelHeight;

  // Carta completa, redimensionada para llenar exactamente la celda
  // central (sin letterboxing: la proporcion ya coincide por diseño).
  const resizedFullCardPng = await sharp(sourceImageBuffer)
    .resize(panelWidth, panelHeight, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
  const cardPlacement: Rect = { x: centerX, y: centerY, width: panelWidth, height: panelHeight };

  // Recorte del artwork, escalado a "contain" dentro de la celda central
  // (sin deformar) para usarlo como semilla del outpainting.
  const rectX = Math.round(artworkCropRect.x);
  const rectY = Math.round(artworkCropRect.y);
  const rectW = Math.max(1, Math.round(artworkCropRect.width));
  const rectH = Math.max(1, Math.round(artworkCropRect.height));

  const artworkSeedScale = Math.min(panelWidth / rectW, panelHeight / rectH);
  const seedWidth = Math.max(1, Math.round(rectW * artworkSeedScale));
  const seedHeight = Math.max(1, Math.round(rectH * artworkSeedScale));

  const artworkSeedPng = await sharp(sourceImageBuffer)
    .extract({ left: rectX, top: rectY, width: rectW, height: rectH })
    .resize(seedWidth, seedHeight, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();

  const seedPlacement: Rect = {
    x: centerX + Math.round((panelWidth - seedWidth) / 2),
    y: centerY + Math.round((panelHeight - seedHeight) / 2),
    width: seedWidth,
    height: seedHeight
  };

  const canvasPng = await sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 3,
      background: CANVAS_BACKGROUND
    }
  })
    .composite([{ input: artworkSeedPng, left: seedPlacement.x, top: seedPlacement.y }])
    .png()
    .toBuffer();

  const featherPx = computeFeatherPx(panelWidth, panelHeight);
  const maskPng = await createMaskBuffer(canvasWidth, canvasHeight, seedPlacement, featherPx);

  return {
    canvasPng,
    maskPng,
    resizedFullCardPng,
    cardPlacement,
    seedPlacement,
    canvasWidth,
    canvasHeight,
    panelWidth,
    panelHeight
  };
}

/**
 * Vuelve a pegar la carta original completa (bytes exactos, sin
 * recomprimir con perdida) sobre la celda central de la imagen generada
 * por la IA. Da igual lo que FLUX haya dibujado ahi (la semilla del
 * artwork, el margen gris de letterboxing, etc.): esa zona queda
 * completamente sustituida, garantizando que ningun pixel de la carta
 * original fue alterado por el modelo.
 */
export async function reinsertOriginalCard(
  generatedPng: Buffer,
  resizedFullCardPng: Buffer,
  cardPlacement: Rect
): Promise<Buffer> {
  return sharp(generatedPng)
    .composite([{ input: resizedFullCardPng, left: cardPlacement.x, top: cardPlacement.y }])
    .png()
    .toBuffer();
}
