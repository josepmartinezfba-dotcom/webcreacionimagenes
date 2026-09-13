import sharp from 'sharp';
import type { Rect } from './types';

/**
 * Genera una mascara para ComfyUI: blanco = zona que la IA puede generar,
 * negro = zona protegida (el artwork original). El rectangulo es un borde
 * duro a proposito: como el artwork se vuelve a insertar pixel a pixel
 * despues de generar, cualquier difuminado en el limite de la mascara solo
 * introduciria una costura entre lo generado y lo original.
 */
export async function createMaskBuffer(
  canvasWidth: number,
  canvasHeight: number,
  protectedRect: Rect
): Promise<Buffer> {
  const whiteRect = await sharp({
    create: {
      width: Math.max(1, Math.round(protectedRect.width)),
      height: Math.max(1, Math.round(protectedRect.height)),
      channels: 3,
      background: { r: 0, g: 0, b: 0 }
    }
  })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 3,
      background: { r: 255, g: 255, b: 255 }
    }
  })
    .composite([
      {
        input: whiteRect,
        left: Math.round(protectedRect.x),
        top: Math.round(protectedRect.y)
      }
    ])
    .png()
    .toBuffer();
}
