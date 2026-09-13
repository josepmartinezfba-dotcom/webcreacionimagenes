'use client';

import { useState } from 'react';
import { PANEL_ORDER } from '@/lib/config';
import PanelModal from './PanelModal';

interface Grid3x3PreviewProps {
  jobId: string;
  canvasWidth: number;
  canvasHeight: number;
  panelWidth: number;
  panelHeight: number;
}

const CELL_DISPLAY_SIZE = 130;

export default function Grid3x3Preview({ jobId, canvasWidth, canvasHeight, panelWidth, panelHeight }: Grid3x3PreviewProps) {
  const [zoomKey, setZoomKey] = useState<string | null>(null);
  const previewUrl = `/api/comfyui/result/${jobId}?kind=preview`;
  const scale = CELL_DISPLAY_SIZE / panelWidth;
  const bgWidth = canvasWidth * scale;
  const bgHeight = canvasHeight * scale;
  const cellDisplayHeight = panelHeight * scale;

  const cells: Array<{ row: number; col: number; key: string; file?: string; isCenter?: boolean }> = [
    { row: 0, col: 0, key: 'top_left', file: '01_top_left.png' },
    { row: 0, col: 1, key: 'top', file: '02_top.png' },
    { row: 0, col: 2, key: 'top_right', file: '03_top_right.png' },
    { row: 1, col: 0, key: 'left', file: '04_left.png' },
    { row: 1, col: 1, key: 'center', isCenter: true },
    { row: 1, col: 2, key: 'right', file: '05_right.png' },
    { row: 2, col: 0, key: 'bottom_left', file: '06_bottom_left.png' },
    { row: 2, col: 1, key: 'bottom', file: '07_bottom.png' },
    { row: 2, col: 2, key: 'bottom_right', file: '08_bottom_right.png' }
  ];

  return (
    <div className="grid3x3">
      <div className="grid3x3__grid" style={{ width: bgWidth, height: bgHeight }}>
        {cells.map((cell) => (
          <button
            type="button"
            key={cell.key}
            className={`grid3x3__cell ${cell.isCenter ? 'grid3x3__cell--center' : ''}`}
            style={{
              width: CELL_DISPLAY_SIZE,
              height: cellDisplayHeight,
              backgroundImage: `url(${previewUrl})`,
              backgroundSize: `${bgWidth}px ${bgHeight}px`,
              backgroundPosition: `-${cell.col * CELL_DISPLAY_SIZE}px -${cell.row * cellDisplayHeight}px`
            }}
            onClick={() => !cell.isCenter && setZoomKey(cell.key)}
            title={cell.isCenter ? 'Artwork original (protegido)' : `Ampliar ${cell.file}`}
          />
        ))}
      </div>

      {zoomKey && (
        <PanelModal
          imageUrl={`/api/comfyui/result/${jobId}?kind=panel&panel=${zoomKey}`}
          fileName={PANEL_ORDER.find((p) => p.key === zoomKey)?.file || `${zoomKey}.png`}
          onClose={() => setZoomKey(null)}
        />
      )}
    </div>
  );
}
