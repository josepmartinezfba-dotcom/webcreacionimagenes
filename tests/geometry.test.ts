import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { buildExpandedCanvas, reinsertOriginalCard, upscaleFinal3x3ToOriginalSize } from '../src/lib/image/canvas';
import { splitIntoPanels } from '../src/lib/image/split';
import { createMaskBuffer } from '../src/lib/image/mask';
import { computeExportPanelSize, computePanelDimensions } from '../src/lib/cardGeometry';
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

test('la celda central del resultado final es la carta completa, no el recorte del artwork, y sin deformarla', async () => {
  // Carta vertical con un artwork mucho mas pequeño y en una esquina, para
  // que sea imposible confundir "carta completa" con "recorte de artwork".
  const cardWidth = 400;
  const cardHeight = 560;
  const artworkRect: Rect = { x: 300, y: 20, width: 60, height: 40 };
  const { canvasResult, finalPng, sourceImageBuffer } = await runPipelineOnce(cardWidth, cardHeight, artworkRect);

  // OJO con lo que esto compara: `cardPlacement` es un ajuste "contain"
  // (sin deformar) de la carta dentro de la celda central, que puede ser
  // 1-2 px mas pequeño que la celda si el redondeo a multiplos de 16 del
  // tamaño de panel no coincide exactamente con la proporcion real de la
  // carta (ver `containFit` en canvas.ts). Por eso comparamos contra
  // `resizedFullCardPng` (la copia ya redimensionada que se reinserta),
  // NO afirmamos una identidad binaria con los bytes del archivo
  // ORIGINAL que subio el usuario (eso seria falso en cuanto hay
  // cualquier reescalado): lo que garantizamos es que el contenido de esa
  // zona es la carta completa, intacta en cuanto a contenido visual, y no
  // el recorte del artwork ni nada generado por la IA.
  const centerRegionBuffer = await sharp(finalPng)
    .extract({
      left: canvasResult.cardPlacement.x,
      top: canvasResult.cardPlacement.y,
      width: canvasResult.cardPlacement.width,
      height: canvasResult.cardPlacement.height
    })
    .raw()
    .toBuffer();
  const expectedCardBuffer = await sharp(canvasResult.resizedFullCardPng).raw().toBuffer();
  assert.deepEqual(
    centerRegionBuffer,
    expectedCardBuffer,
    'la region cardPlacement no coincide con la copia redimensionada de la carta que se reinserto'
  );

  // El "contain" no debe dejar un hueco mayor que el margen de redondeo a
  // multiplos de 16 usado por computePanelDimensions (panelWidth y
  // panelHeight se alinean de forma independiente, asi que el hueco entre
  // ambos puede acercarse a esa granularidad; si fuera mayor, algo iria
  // mal en el calculo).
  const ROUNDING_TOLERANCE_PX = 16;
  assert.ok(canvasResult.panelWidth - canvasResult.cardPlacement.width <= ROUNDING_TOLERANCE_PX);
  assert.ok(canvasResult.panelHeight - canvasResult.cardPlacement.height <= ROUNDING_TOLERANCE_PX);

  // Cero deformacion: la relacion de aspecto de la carta reinsertada debe
  // seguir siendo (casi) identica a la de la carta original real, con un
  // margen de tolerancia muy por debajo de lo que se veria a simple vista.
  const originalMeta = await sharp(sourceImageBuffer).metadata();
  const originalRatio = originalMeta.width! / originalMeta.height!;
  const reinsertedRatio = canvasResult.cardPlacement.width / canvasResult.cardPlacement.height;
  assert.ok(
    Math.abs(originalRatio - reinsertedRatio) / originalRatio < 0.01,
    `la carta reinsertada esta deformada: ratio original ${originalRatio}, ratio reinsertado ${reinsertedRatio}`
  );

  // Y explicitamente comprobamos que el centro geometrico de la celda NO
  // es el recorte del artwork (que esta pintado de un color distinto al
  // fondo de la carta sintetica).
  const centerPixel = await sharp(finalPng)
    .extract({
      left: canvasResult.cardPlacement.x + Math.floor(canvasResult.cardPlacement.width / 2),
      top: canvasResult.cardPlacement.y + Math.floor(canvasResult.cardPlacement.height / 2),
      width: 1,
      height: 1
    })
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

test('mascara: blanco = generar, negro = conservar (artwork protegido), con degradado cuadratico en el borde', async () => {
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
  // Justo dentro del borde del rectangulo protegido (distancia 4 de 8 al
  // borde), el degradado cuadratico oficial (v=(feather-d)/feather,
  // valor=v^2) da v=0.5 -> 0.25*255=64 (no un blend lineal ~127).
  const d = 4;
  const v = (featherPx - d) / featherPx;
  const expected = Math.round(v * v * 255);
  const edgeValue = pixelAt(100 + d, 150); // x=104 -> distancia al borde izquierdo (x=100) es 4
  assert.equal(edgeValue, expected, `se esperaba el valor cuadratico ${expected} a distancia ${d}, se obtuvo ${edgeValue}`);
});

test('el degradado del borde nunca alcanza el centro del artwork por pequeño que sea', async () => {
  // Una tira de artwork muy fina (aspecto extremo comparado con el panel)
  // hace que "contain" la deje con muy poca altura en el lienzo: sirve
  // para comprobar que computeFeatherPx se limita a 1/4 del lado corto y
  // nunca "engulle" el centro del rectangulo protegido.
  const artworkRect: Rect = { x: 0, y: 270, width: 400, height: 20 };
  const { canvasResult } = await runPipelineOnce(400, 560, artworkRect, 'low');
  assert.ok(
    Math.min(canvasResult.seedPlacement.width, canvasResult.seedPlacement.height) < 30,
    'la semilla deberia quedar deliberadamente estrecha en este caso de prueba'
  );

  const { data, info } = await sharp(canvasResult.maskPng).raw().toBuffer({ resolveWithObject: true });
  const cx = canvasResult.seedPlacement.x + Math.floor(canvasResult.seedPlacement.width / 2);
  const cy = canvasResult.seedPlacement.y + Math.floor(canvasResult.seedPlacement.height / 2);
  const idx = (cy * canvasResult.canvasWidth + cx) * info.channels;
  assert.equal(data[idx], 0, 'el centro del artwork, por pequeño que sea, debe seguir totalmente protegido (negro)');
});

test('computeExportPanelSize: el eje largo coincide exactamente con la carta y nunca deforma mas de lo inevitable por redondeo', () => {
  // Carta vertical tipica (relacion de aspecto de una carta Pokemon, ~0.716).
  const cardWidth = 734;
  const cardHeight = 1024;
  const generated = computePanelDimensions(cardWidth, cardHeight, 'normal');

  const exportSize = computeExportPanelSize(generated.width, generated.height, cardWidth, cardHeight);

  // El eje largo (alto, en una carta vertical) coincide EXACTAMENTE con la carta.
  assert.equal(exportSize.height, cardHeight);
  // El eje corto puede diferir por el redondeo a multiplos de 16 de la
  // resolucion de generacion, pero solo unos pocos pixeles.
  assert.ok(Math.abs(exportSize.width - cardWidth) <= 4, `ancho exportado ${exportSize.width} demasiado lejos de ${cardWidth}`);

  // Y el resultado nunca deforma mas que la resolucion de generacion ya deformaba por el redondeo a multiplos de 16.
  const generatedRatio = generated.width / generated.height;
  const exportRatio = exportSize.width / exportSize.height;
  assert.ok(Math.abs(generatedRatio - exportRatio) < 0.005);
});

test('exportar al tamaño original: la composicion final sube de resolucion sin recortar contenido', async () => {
  const cardWidth = 480;
  const cardHeight = 720;
  const artworkRect: Rect = { x: 40, y: 60, width: 200, height: 140 };
  const { canvasResult, finalPng } = await runPipelineOnce(cardWidth, cardHeight, artworkRect, 'low');

  const upscaled = await upscaleFinal3x3ToOriginalSize(
    finalPng,
    canvasResult.panelWidth,
    canvasResult.panelHeight,
    cardWidth,
    cardHeight
  );

  assert.ok(upscaled.panelWidth > canvasResult.panelWidth, 'el panel exportado deberia ser mayor que el de generacion (carta mas grande que la resolucion baja)');
  assert.ok(upscaled.panelHeight > canvasResult.panelHeight);

  const meta = await sharp(upscaled.finalPng).metadata();
  assert.equal(meta.width, upscaled.panelWidth * 3);
  assert.equal(meta.height, upscaled.panelHeight * 3);

  const panels = await splitIntoPanels(upscaled.finalPng, upscaled.panelWidth, upscaled.panelHeight);
  for (const panel of panels) {
    const panelMeta = await sharp(panel.buffer).metadata();
    assert.equal(panelMeta.width, upscaled.panelWidth);
    assert.equal(panelMeta.height, upscaled.panelHeight);
  }
});

test('workflow de ComfyUI: DifferentialDiffusion esta conectado antes del KSampler y noise_mask es false', () => {
  const workflowPath = path.join(__dirname, '..', 'comfyui-workflows', 'flux_fill_outpaint.json');
  const workflow = JSON.parse(readFileSync(workflowPath, 'utf-8')) as Record<
    string,
    { class_type: string; inputs: Record<string, unknown> }
  >;

  const diffEntry = Object.entries(workflow).find(([, node]) => node.class_type === 'DifferentialDiffusion');
  assert.ok(diffEntry, 'no se encontro ningun nodo DifferentialDiffusion en el workflow');
  const [diffNodeId, diffNode] = diffEntry!;
  assert.ok(Array.isArray(diffNode.inputs.model), 'DifferentialDiffusion deberia recibir el MODEL del UNET loader');

  const ksamplerEntry = Object.entries(workflow).find(([, node]) => node.class_type === 'KSampler');
  assert.ok(ksamplerEntry, 'no se encontro ningun nodo KSampler en el workflow');
  const [, ksamplerNode] = ksamplerEntry!;
  const modelLink = ksamplerNode.inputs.model as [string, number];
  assert.equal(modelLink[0], diffNodeId, 'KSampler deberia tomar el MODEL desde DifferentialDiffusion, no directamente del loader');

  const inpaintEntry = Object.entries(workflow).find(([, node]) => node.class_type === 'InpaintModelConditioning');
  assert.ok(inpaintEntry, 'no se encontro ningun nodo InpaintModelConditioning en el workflow');
  const [, inpaintNode] = inpaintEntry!;
  assert.equal(
    inpaintNode.inputs.noise_mask,
    false,
    'con DifferentialDiffusion, noise_mask debe ser false (igual que la plantilla oficial flux_fill_outpaint_example de ComfyUI)'
  );
});
