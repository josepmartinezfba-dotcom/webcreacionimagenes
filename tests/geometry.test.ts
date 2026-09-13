import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { buildExpandedCanvas, reinsertOriginalCard } from '../src/lib/image/canvas';
import { splitIntoPanels } from '../src/lib/image/split';
import { createMaskBuffer } from '../src/lib/image/mask';
import { computePanelDimensions } from '../src/lib/cardGeometry';
import type { Rect } from '../src/lib/image/types';

/**
 * Estas pruebas comprueban la GEOMETRIA y la MASCARA del pipeline de
 * composicion (todo lo que se hace por codigo, sin IA). No dependen de
 * ComfyUI: usan una "carta" y un "artwork" sinteticos generados con sharp,
 * y una imagen "generada" simulada (una copia del propio lienzo) para
 * verificar la reinsercion y el recorte final.
 */

async function makeSolidPng(width: number, height: number, color: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
}

/** Carta sintetica: un rectangulo de color con un "artwork" (otro color) incrustado dentro. */
async function makeSyntheticCard(cardWidth: number, cardHeight: number, artworkRect: Rect) {
  const card = sharp({
    create: { width: cardWidth, height: cardHeight, channels: 3, background: { r: 200, g: 50, b: 50 } }
  }).composite([
    { input: await makeSolidPng(artworkRect.width, artworkRect.height, { r: 30, g: 140, b: 60 }), left: artworkRect.x, top: artworkRect.y }
  ]);
  return card.png().toBuffer();
}

async function runPipelineOnce(cardWidth: number, cardHeight: number, artworkRect: Rect, quality: 'low' | 'normal' | 'high' = 'low') {
  const sourceImageBuffer = await makeSyntheticCard(cardWidth, cardHeight, artworkRect);
  const canvasResult = await buildExpandedCanvas({ sourceImageBuffer, artworkCropRect: artworkRect, quality });

  // Simula la salida de ComfyUI: en un caso real seria una imagen generada
  // por FLUX, pero para probar geometria/reinsercion basta con cualquier
  // imagen de las mismas dimensiones que el lienzo (aqui, el propio canvas
  // que le enviamos a ComfyUI).
  const fakeGenerated = canvasResult.canvasPng;

  const finalPng = await reinsertOriginalCard(fakeGenerated, canvasResult.resizedFullCardPng, canvasResult.cardPlacement);
  const panels = await splitIntoPanels(finalPng, canvasResult.panelWidth, canvasResult.panelHeight);

  return { canvasResult, finalPng, panels, sourceImageBuffer };
}

test('el lienzo mide exactamente 3W x 3H del tamaño de panel calculado', async () => {
  const artworkRect: Rect = { x: 40, y: 60, width: 200, height: 140 };
  const { canvasResult } = await runPipelineOnce(400, 600, artworkRect);

  assert.equal(canvasResult.canvasWidth, canvasResult.panelWidth * 3);
  assert.equal(canvasResult.canvasHeight, canvasResult.panelHeight * 3);

  const meta = await sharp(canvasResult.canvasPng).metadata();
  assert.equal(meta.width, canvasResult.canvasWidth);
  assert.equal(meta.height, canvasResult.canvasHeight);
});

test('los 8 PNG exportados miden exactamente panelWidth x panelHeight', async () => {
  const artworkRect: Rect = { x: 40, y: 60, width: 200, height: 140 };
  const { canvasResult, panels } = await runPipelineOnce(400, 600, artworkRect);

  assert.equal(panels.length, 8);
  for (const panel of panels) {
    const meta = await sharp(panel.buffer).metadata();
    assert.equal(meta.width, canvasResult.panelWidth, `panel ${panel.file} ancho incorrecto`);
    assert.equal(meta.height, canvasResult.panelHeight, `panel ${panel.file} alto incorrecto`);
  }
});

test('la celda central del resultado final es la carta completa, no el recorte del artwork', async () => {
  // Carta vertical con un artwork mucho mas pequeño y en una esquina, para
  // que sea imposible confundir "carta completa" con "recorte de artwork".
  const cardWidth = 400;
  const cardHeight = 560;
  const artworkRect: Rect = { x: 300, y: 20, width: 60, height: 40 };
  const { canvasResult, finalPng } = await runPipelineOnce(cardWidth, cardHeight, artworkRect);

  const centerCellBuffer = await sharp(finalPng)
    .extract({
      left: canvasResult.cardPlacement.x,
      top: canvasResult.cardPlacement.y,
      width: canvasResult.cardPlacement.width,
      height: canvasResult.cardPlacement.height
    })
    .raw()
    .toBuffer();

  const expectedCardBuffer = await sharp(canvasResult.resizedFullCardPng).raw().toBuffer();

  assert.deepEqual(centerCellBuffer, expectedCardBuffer, 'la celda central no coincide byte a byte con la carta completa reescalada');

  // Y explicitamente comprobamos que NO es el recorte del artwork (que
  // tiene otra relacion de aspecto y esta pintado de un color distinto al
  // fondo de la carta sintetica en el centro exacto de la celda).
  const centerPixel = await sharp(finalPng)
    .extract({ left: canvasResult.cardPlacement.x + Math.floor(canvasResult.panelWidth / 2), top: canvasResult.cardPlacement.y + Math.floor(canvasResult.panelHeight / 2), width: 1, height: 1 })
    .raw()
    .toBuffer();
  // El centro de la carta sintetica es fondo rojo (200,50,50), no el verde (30,140,60) del artwork.
  assert.equal(centerPixel[0], 200);
  assert.equal(centerPixel[1], 50);
  assert.equal(centerPixel[2], 50);
});

test('la relacion de aspecto del panel sigue la de la carta y solo es 1:1 si la carta es cuadrada', async () => {
  const portrait = computePanelDimensions(400, 600, 'low');
  assert.notEqual(portrait.width, portrait.height, 'una carta claramente vertical no deberia dar panel cuadrado');
  assert.ok(portrait.height > portrait.width, 'carta vertical -> panel vertical (H > W)');

  const landscape = computePanelDimensions(600, 400, 'low');
  assert.ok(landscape.width > landscape.height, 'carta horizontal -> panel horizontal (W > H)');

  const square = computePanelDimensions(500, 500, 'low');
  assert.equal(square.width, square.height, 'una carta cuadrada si debe dar un panel cuadrado');
});

test('orientacion vertical: el lienzo completo tambien es mas alto que ancho', async () => {
  const artworkRect: Rect = { x: 40, y: 60, width: 200, height: 140 };
  const { canvasResult } = await runPipelineOnce(400, 600, artworkRect);
  assert.ok(canvasResult.canvasHeight > canvasResult.canvasWidth);
  assert.ok(canvasResult.panelHeight > canvasResult.panelWidth);
});

test('orientacion horizontal: el lienzo completo tambien es mas ancho que alto', async () => {
  const artworkRect: Rect = { x: 60, y: 40, width: 140, height: 200 };
  const { canvasResult } = await runPipelineOnce(600, 400, artworkRect);
  assert.ok(canvasResult.canvasWidth > canvasResult.canvasHeight);
  assert.ok(canvasResult.panelWidth > canvasResult.panelHeight);
});

test('mascara: blanco = generar, negro = conservar (artwork protegido), y el borde queda difuminado', async () => {
  const canvasWidth = 300;
  const canvasHeight = 300;
  const protectedRect: Rect = { x: 100, y: 100, width: 100, height: 100 };
  const featherPx = 8;

  const maskPng = await createMaskBuffer(canvasWidth, canvasHeight, protectedRect, featherPx);
  const { data, info } = await sharp(maskPng).raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;

  function pixelAt(x: number, y: number) {
    const idx = (y * canvasWidth + x) * channels;
    return data[idx];
  }

  // Una esquina del lienzo (fuera del rectangulo protegido) debe ser blanca: se genera.
  assert.equal(pixelAt(5, 5), 255);
  // El centro exacto del rectangulo protegido debe seguir siendo negro puro: se conserva.
  assert.equal(pixelAt(150, 150), 0);
  // Justo en el borde del rectangulo protegido, el difuminado produce un
  // valor intermedio (ni 0 ni 255): confirma que hay transicion suave.
  const edgeValue = pixelAt(100, 150);
  assert.ok(edgeValue > 0 && edgeValue < 255, `se esperaba un valor de transicion en el borde, se obtuvo ${edgeValue}`);
});
