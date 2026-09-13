export const DEFAULT_COMFYUI_URL = process.env.COMFYUI_URL || 'http://127.0.0.1:8188';

export const CLIENT_ID_HEADER = 'x-client-id';

export const PANEL_ORDER = [
  { key: 'top_left', file: '01_top_left.png', row: 0, col: 0 },
  { key: 'top', file: '02_top.png', row: 0, col: 1 },
  { key: 'top_right', file: '03_top_right.png', row: 0, col: 2 },
  { key: 'left', file: '04_left.png', row: 1, col: 0 },
  { key: 'right', file: '05_right.png', row: 1, col: 2 },
  { key: 'bottom_left', file: '06_bottom_left.png', row: 2, col: 0 },
  { key: 'bottom', file: '07_bottom.png', row: 2, col: 1 },
  { key: 'bottom_right', file: '08_bottom_right.png', row: 2, col: 2 }
] as const;

export type PanelKey = (typeof PANEL_ORDER)[number]['key'];
