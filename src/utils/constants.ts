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

// Oyun modlari
export type GameMode = 'thinking' | 'relaxing';

// Renkler - açık, aydınlık palet
export const COLORS = {
  BACKGROUND: '#f0ece6',
  BOARD_LIGHT: '#d4c4a8',
  BOARD_DARK: '#c4b498',
  BOARD_SHADOW: '#b8a888',
  PATH: '#faf7f2',
  PATH_SHADOW: '#e8e0d4',
  HUD_TEXT: '#6a6058',
} as const;

// Seviye renkleri - açık pastel tonlar
export const LEVEL_COLORS = [
  '#f4c4c4',
  '#f4dca8',
  '#b0e4c4',
  '#b4d4f0',
  '#f0d0b4',
  '#d4b8e4',
  '#a0e4d0',
  '#f0b8cc',
  '#c8e8a0',
  '#b8c8e4',
] as const;

// Boyutlar
export const CELL_SIZE = 60;
export const BALL_RADIUS = 22;
export const WALL_HEIGHT = 8;
export const SWIPE_THRESHOLD = 30;

// Animasyon
export const SLIDE_SPEED = 0.038; // Saniye / karo (hizli ve kaygan)
export const PAINT_ANIM_DURATION = 150; // ms

// Yıldız hesaplama eşikleri
export const STAR_THRESHOLDS = {
  THREE: 1.0,
  TWO: 1.5,
  ONE: Infinity
} as const;
