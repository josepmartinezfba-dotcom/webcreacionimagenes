import sharp from 'sharp';
import { computeExportPanelSize, computePanelDimensions, type QualityPreset } from '@/lib/cardGeometry';
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

/**
 * Radio del degradado del borde de la mascara (formula cuadratica, igual
 * que el nodo oficial `ImagePadForOutpaint` de ComfyUI), como fraccion del
 * lado corto del RECORTE DE ARTWORK (no del panel completo: el artwork
 * puede ser mucho mas pequeño que la celda si su relacion de aspecto no
 * coincide con la de la carta). Se limita ademas a como mucho 1/4 del lado
 * corto para garantizar que el centro del artwork nunca quede afectado por
 * el degradado, sea cual sea su tamaño.
 */
const FEATHER_RATIO = 0.06;
const FEATHER_MIN_PX = 6;
const FEATHER_MAX_PX = 40;

function computeFeatherPx(seedWidth: number, seedHeight: number): number {
  const shortSide = Math.min(seedWidth, seedHeight);
  const raw = shortSide * FEATHER_RATIO;
  const bounded = Math.min(FEATHER_MAX_PX, Math.max(FEATHER_MIN_PX, Math.round(raw)));
  return Math.min(bounded, Math.floor(shortSide / 4));
}

/** Encaja `contentWidth x contentHeight` dentro de `cellWidth x cellHeight` sin deformar (fit "contain"), centrado. */
function containFit(
  contentWidth: number,
  contentHeight: number,
  cellWidth: number,
  cellHeight: number,
  cellOffsetX: number,
  cellOffsetY: number
): { width: number; height: number; x: number; y: number } {
  const scale = Math.min(cellWidth / contentWidth, cellHeight / contentHeight);
  const width = Math.max(1, Math.round(contentWidth * scale));
  const height = Math.max(1, Math.round(contentHeight * scale));
  return {
    width,
    height,
    x: cellOffsetX + Math.round((cellWidth - width) / 2),
    y: cellOffsetY + Math.round((cellHeight - height) / 2)
  };
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
 *   mano.
 * - La carta completa se coloca en la celda central con un ajuste
 *   "contain" (igual que el artwork), NUNCA con `fit: "fill"`: aunque
 *   panelWidth:panelHeight se deriva de la proporcion de la carta, el
 *   redondeo a multiplos de 16 (necesario para el VAE) puede introducir un
 *   desajuste de una fraccion de punto porcentual entre ambas relaciones
 *   de aspecto. Forzar "fill" en ese caso estiraria la carta ligeramente;
 *   "contain" garantiza CERO deformacion siempre, al precio de como mucho
 *   1-2 px de margen (irrelevante, ver mas abajo).
 * - Solo el recorte del artwork (no la carta completa, que incluiria el
 *   marco/texto) se usa como semilla visual para el outpainting: es lo
 *   unico que FLUX "ve" como contexto real al continuar el escenario.
 * - La carta completa (`resizedFullCardPng`) se guarda aparte para
 *   reinsertarla intacta en la celda central DESPUES de generar (ver
 *   `reinsertOriginalCard`); nunca se envia a la IA como si fuera el
 *   resultado final del centro. Como la reinsercion sustituye TODA la
 *   celda central (no solo el rectangulo exacto de la carta), el margen de
 *   1-2 px del "contain" nunca es visible: se convierte en el color de
 *   fondo generado ahi, indistinguible del resto del panel.
 */
export async function buildExpandedCanvas(params: BuildExpandedCanvasParams): Promise<ExpandedCanvasResult> {
  const { sourceImageBuffer, artworkCropRect } = params;

  const cardMeta = await sharp(sourceImageBuffer).metadata();
  if (!cardMeta.width || !cardMeta.height) {
    throw new Error('No se pudo leer el tamaño de la imagen de la carta.');
  }
  const cardWidth = cardMeta.width;
  const cardHeight = cardMeta.height;

  const { width: panelWidth, height: panelHeight } = computePanelDimensions(cardWidth, cardHeight, params.quality);

  const canvasWidth = panelWidth * 3;
  const canvasHeight = panelHeight * 3;
  const centerX = panelWidth;
  const centerY = panelHeight;

  // Carta completa, ajustada sin deformar dentro de la celda central.
  const cardFit = containFit(cardWidth, cardHeight, panelWidth, panelHeight, centerX, centerY);
  const resizedFullCardPng = await sharp(sourceImageBuffer)
    .resize(cardFit.width, cardFit.height, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
  const cardPlacement: Rect = { x: cardFit.x, y: cardFit.y, width: cardFit.width, height: cardFit.height };

  // Recorte del artwork, ajustado sin deformar dentro de la celda central,
  // para usarlo como semilla del outpainting.
  const rectX = Math.round(artworkCropRect.x);
  const rectY = Math.round(artworkCropRect.y);
  const rectW = Math.max(1, Math.round(artworkCropRect.width));
  const rectH = Math.max(1, Math.round(artworkCropRect.height));

  const seedFit = containFit(rectW, rectH, panelWidth, panelHeight, centerX, centerY);
  const artworkSeedPng = await sharp(sourceImageBuffer)
    .extract({ left: rectX, top: rectY, width: rectW, height: rectH })
    .resize(seedFit.width, seedFit.height, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
  const seedPlacement: Rect = { x: seedFit.x, y: seedFit.y, width: seedFit.width, height: seedFit.height };

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

  const featherPx = computeFeatherPx(seedPlacement.width, seedPlacement.height);
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
 * Vuelve a pegar la carta original completa (redimensionada sin deformar,
 * no recomprimida con perdida) sobre la celda central de la imagen
 * generada por la IA. Da igual lo que FLUX haya dibujado ahi (la semilla
 * del artwork, el margen de "contain", etc.): esa zona queda completamente
 * sustituida, garantizando que ningun pixel de la carta original fue
 * alterado por el modelo.
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

export interface UpscaledFinal3x3 {
  finalPng: Buffer;
  panelWidth: number;
  panelHeight: number;
}

/**
 * Reescala por codigo (Lanczos, en CPU) la composicion 3x3 ya generada y
 * recompuesta a un tamaño de panel cercano al de la carta original, para
 * la opcion "Exportar al tamaño original de la carta". No vuelve a pasar
 * por FLUX/ComfyUI: la generacion siempre ocurre a la resolucion reducida
 * de `quality` para no saturar la VRAM disponible.
 *
 * Ver `computeExportPanelSize`: el eje largo del panel exportado coincide
 * exactamente con el de la carta; el corto puede diferir en 1-2 px por el
 * redondeo a multiplos de 16 de la resolucion de generacion. El propio
 * `finalPng` (generado a partir de un lienzo cuya proporcion ya es
 * panelWidth:panelHeight) se reescala de forma UNIFORME a
 * exportPanelWidth*3 x exportPanelHeight*3, así que no introduce ninguna
 * deformacion adicional a la ya asumida en `computeExportPanelSize`.
 */
export async function upscaleFinal3x3ToOriginalSize(
  finalPng: Buffer,
  panelWidth: number,
  panelHeight: number,
  cardWidth: number,
  cardHeight: number
): Promise<UpscaledFinal3x3> {
  const exportPanel = computeExportPanelSize(panelWidth, panelHeight, cardWidth, cardHeight);
  const exportCanvasWidth = exportPanel.width * 3;
  const exportCanvasHeight = exportPanel.height * 3;

  const upscaledPng = await sharp(finalPng)
    .resize(exportCanvasWidth, exportCanvasHeight, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();

  return { finalPng: upscaledPng, panelWidth: exportPanel.width, panelHeight: exportPanel.height };
}
