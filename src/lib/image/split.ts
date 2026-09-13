import sharp from 'sharp';
import { PANEL_ORDER, type PanelKey } from '@/lib/config';

export interface PanelImage {
  key: PanelKey;
  file: string;
  buffer: Buffer;
}

/**
 * Divide matematicamente (sin IA) la composicion 3x3 final en las 8
 * imagenes exteriores. El panel central (la carta original completa, ya
 * reinsertada por `reinsertOriginalCard`) se descarta aqui: no forma parte
 * de las 8 exportaciones solicitadas.
 */
export async function splitIntoPanels(
  finalCanvasPng: Buffer,
  panelWidth: number,
  panelHeight: number
): Promise<PanelImage[]> {
  const panels: PanelImage[] = [];
  for (const spec of PANEL_ORDER) {
    const buffer = await sharp(finalCanvasPng)
      .extract({
        left: spec.col * panelWidth,
        top: spec.row * panelHeight,
        width: panelWidth,
        height: panelHeight
      })
      .png()
      .toBuffer();
    panels.push({ key: spec.key, file: spec.file, buffer });
  }
  return panels;
}
