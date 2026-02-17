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

// Renkler
export const COLORS = {
  BACKGROUND: '#2c2c3a',
  WALL_TOP: '#5a5a7a',
  WALL_FACE: '#44445e',
  WALL_SHADOW: '#1e1e30',
  PATH: '#d4c5a9',
  BALL_HIGHLIGHT: '#ffffff',
  HUD_TEXT: '#ffffff',
} as const;

// Seviye renkleri - her seviye farklı bir boya rengi kullanır
export const LEVEL_COLORS = [
  '#ff6b6b', // Kırmızı
  '#ffd93d', // Sarı
  '#6bcb77', // Yeşil
  '#4d96ff', // Mavi
  '#ff922b', // Turuncu
  '#cc5de8', // Mor
  '#20c997', // Teal
  '#f06595', // Pembe
  '#a9e34b', // Lime
  '#748ffc', // İndigo
] as const;

// Boyutlar
export const CELL_SIZE = 60;
export const BALL_RADIUS = 22;
export const WALL_HEIGHT = 10;
export const SWIPE_THRESHOLD = 30;

// Animasyon
export const SLIDE_SPEED = 0.15; // Saniye / karo
export const PAINT_ANIM_DURATION = 200; // ms

// Yıldız hesaplama eşikleri
export const STAR_THRESHOLDS = {
  THREE: 1.0,  // targetMoves veya altı
  TWO: 1.5,    // targetMoves * 1.5 veya altı
  ONE: Infinity // Her zaman en az 1 yıldız
} as const;
