import sharp from 'sharp';
import type { Rect } from './types';

/**
 * Genera una mascara para ComfyUI.
 *
 * Convencion (verificada contra el codigo fuente de ComfyUI - nodo
 * `InpaintModelConditioning`, que es el que consume esta mascara junto con
 * `LoadImageMask`): un valor de mascara 1.0 (blanco) marca la zona que la
 * IA debe GENERAR; 0.0 (negro) marca la zona que se CONSERVA como
 * contexto/referencia. `InpaintModelConditioning` redondea la mascara a
 * 0/1 y sustituye por gris neutro los pixeles marcados como "generar"
 * antes de codificarlos con el VAE, asi que el color de fondo del propio
 * `canvas.png` bajo la zona blanca es irrelevante para el resultado: solo
 * importa la forma de la mascara.
 *
 * Blanco  (255) = generar (outpainting de FLUX)
 * Negro   (0)   = conservar (semilla real: el recorte del artwork)
 *
 * `featherPx` difumina el borde del rectangulo protegido. Esto NO cambia
 * el limite "duro" que ve el modelo para decidir que pixeles vienen dados
 * (ese redondeo a 0/1 ocurre igualmente en torno al 50% del degradado),
 * pero SI suaviza el `noise_mask` que usa el sampler para mezclar el
 * latente conocido con el generado durante el denoising, reduciendo
 * costuras visibles en el borde exacto del artwork.
 */
export async function createMaskBuffer(
  canvasWidth: number,
  canvasHeight: number,
  protectedRect: Rect,
  featherPx = 0
): Promise<Buffer> {
  const blackRect = await sharp({
    create: {
      width: Math.max(1, Math.round(protectedRect.width)),
      height: Math.max(1, Math.round(protectedRect.height)),
      channels: 3,
      background: { r: 0, g: 0, b: 0 }
    }
  })
    .png()
    .toBuffer();

  const hardMask = sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 3,
      background: { r: 255, g: 255, b: 255 }
    }
  }).composite([
    {
      input: blackRect,
      left: Math.round(protectedRect.x),
      top: Math.round(protectedRect.y)
    }
  ]);

  if (featherPx <= 0) {
    return hardMask.png().toBuffer();
  }

  const hardMaskPng = await hardMask.png().toBuffer();
  return sharp(hardMaskPng).blur(featherPx).png().toBuffer();
}
