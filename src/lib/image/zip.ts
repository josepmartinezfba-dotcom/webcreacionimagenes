import archiver from 'archiver';
import type { PanelImage } from './split';

export async function createZipBuffer(panels: PanelImage[], previewPng?: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];

    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));

    for (const panel of panels) {
      archive.append(panel.buffer, { name: panel.file });
    }
    if (previewPng) {
      archive.append(previewPng, { name: 'preview_3x3.png' });
    }

    archive.finalize();
  });
}
