import sharp from 'sharp';
import type { Rect } from './types';

/**
 * Genera una mascara para ComfyUI.
 *
 * Convencion (verificada contra el codigo fuente de ComfyUI - nodo
 * `InpaintModelConditioning`, que es el que consume esta mascara junto con
 * `LoadImageMask`): un valor de mascara 1.0 (blanco) marca la zona que la
 * IA debe GENERAR; 0.0 (negro) marca la zona que se CONSERVA como
 * contexto/referencia.
 *
 * Blanco  (255) = generar (outpainting de FLUX)
 * Negro   (0)   = conservar (semilla real: el recorte del artwork)
 *
 * Nuestro workflow usa `noise_mask: false` en `InpaintModelConditioning`
 * (igual que la plantilla oficial `flux_fill_outpaint_example` de
 * ComfyUI) y en su lugar aplica `DifferentialDiffusion` sobre el modelo
 * antes del `KSampler`. A diferencia del blending por `noise_mask` (que
 * trata la mascara como un simple 0/1), `DifferentialDiffusion` usa el
 * VALOR CONTINUO de la mascara para decidir, pixel a pixel, en que punto
 * del proceso de denoising empieza a modificarse ese pixel: cuanto mas
 * cerca de 1.0, antes se libera para generarse; cuanto mas cerca de 0.0,
 * mas tarde (efectivamente, casi no se toca). Por eso una mascara binaria
 * pura desaprovecha la mitad del mecanismo: la plantilla oficial de
 * outpainting de ComfyUI (nodo `ImagePadForOutpaint`) genera precisamente
 * un degradado cuadratico en el borde para que `DifferentialDiffusion`
 * pueda mezclar de forma progresiva. Replicamos ese mismo degradado aqui
 * (misma formula: v = (feather-d)/feather; valor = v²), en vez del
 * difuminado gaussiano usado en una version anterior de este archivo.
 *
 * El area protegida siempre queda completamente cubierta despues por
 * `reinsertOriginalCard` con la carta original exacta, asi que "comerse"
 * unos pixeles del borde interior del rectangulo protegido con el
 * degradado es seguro: esa celda central se sustituye entera de todos
 * modos.
 */
export async function createMaskBuffer(
  canvasWidth: number,
  canvasHeight: number,
  protectedRect: Rect,
  featherPx = 0
): Promise<Buffer> {
  const width = canvasWidth;
  const height = canvasHeight;
  const channels = 3;

  // Por defecto, todo el lienzo es "generar" (255). Solo se recorre el
  // rectangulo protegido para pintar los valores de conservacion/degradado.
  const data = Buffer.alloc(width * height * channels, 255);

  const rectX = Math.round(protectedRect.x);
  const rectY = Math.round(protectedRect.y);
  const rectWidth = Math.max(1, Math.round(protectedRect.width));
  const rectHeight = Math.max(1, Math.round(protectedRect.height));

  for (let j = 0; j < rectHeight; j++) {
    const y = rectY + j;
    if (y < 0 || y >= height) continue;

    for (let i = 0; i < rectWidth; i++) {
      const x = rectX + i;
      if (x < 0 || x >= width) continue;

      let value = 0; // interior del rectangulo protegido: se conserva.
      if (featherPx > 0) {
        const distanceToEdge = Math.min(j, rectHeight - 1 - j, i, rectWidth - 1 - i);
        if (distanceToEdge < featherPx) {
          const v = (featherPx - distanceToEdge) / featherPx;
          value = Math.round(v * v * 255);
        }
      }

      const idx = (y * width + x) * channels;
      data[idx] = value;
      data[idx + 1] = value;
      data[idx + 2] = value;
    }
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}
