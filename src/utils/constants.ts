// Karo tipleri
export const WALL = 0;
export const PATH = 1;
export const PAINTED = 2;

// Yön vektörleri
export const DIRECTIONS = {
  UP: { dx: 0, dy: -1 },
  DOWN: { dx: 0, dy: 1 },
  LEFT: { dx: -1, dy: 0 },
  RIGHT: { dx: 1, dy: 0 },
} as const;

export type Direction = keyof typeof DIRECTIONS;

// Renkler - sade, rahatlatıcı palet
export const COLORS = {
  BACKGROUND: '#2a2a35',
  BOARD_LIGHT: '#9a8468',
  BOARD_DARK: '#7a6548',
  BOARD_SHADOW: '#5a4830',
  PATH: '#e8dcc8',
  PATH_SHADOW: '#c8b8a0',
  HUD_TEXT: '#e0d8d0',
} as const;

// Seviye renkleri - yumuşak, pastel tonlar
export const LEVEL_COLORS = [
  '#d49494',
  '#d4b878',
  '#7eb894',
  '#7494c4',
  '#c89878',
  '#a888b4',
  '#6cb4a0',
  '#c4889c',
  '#94b86c',
  '#8898b8',
] as const;

// Boyutlar
export const CELL_SIZE = 60;
export const BALL_RADIUS = 22;
export const WALL_HEIGHT = 8;
export const SWIPE_THRESHOLD = 30;

// Animasyon
export const SLIDE_SPEED = 0.07; // Saniye / karo (hızlı ve kaygan)
export const PAINT_ANIM_DURATION = 150; // ms

// Yıldız hesaplama eşikleri
export const STAR_THRESHOLDS = {
  THREE: 1.0,
  TWO: 1.5,
  ONE: Infinity
} as const;
