// Karo tipleri — grid yalnızca karo tipini tutar, boyama durumu Level.painted içinde
export const WALL = 0;
export const PATH = 1;
// Yön karoları: top bu karoya girince yönü okun yönüne döner ve kaymaya devam eder
export const ARROW_UP = 3;
export const ARROW_RIGHT = 4;
export const ARROW_DOWN = 5;
export const ARROW_LEFT = 6;
// Durdurucu: top bu karoya girince orada durur
export const STOPPER = 7;

// Renk kapilari: top iki renkten birini tasir.
// Havuz karosu topun rengini degistirir, kapi yalnizca ayni renkteki topu gecirir.
export const POOL_1 = 8;
export const POOL_2 = 9;
export const GATE_1 = 10;
export const GATE_2 = 11;

// Top renkleri
export const BALL_COLOR_1 = 1;
export const BALL_COLOR_2 = 2;
export const BALL_START_COLOR = BALL_COLOR_1;

export const ARROW_TILES = [ARROW_UP, ARROW_RIGHT, ARROW_DOWN, ARROW_LEFT] as const;

// Havuz karosunun verdigi renk; havuz degilse 0
export function poolColor(tile: number): number {
  if (tile === POOL_1) return BALL_COLOR_1;
  if (tile === POOL_2) return BALL_COLOR_2;
  return 0;
}

// Kapinin istedigi renk; kapi degilse 0
export function gateColor(tile: number): number {
  if (tile === GATE_1) return BALL_COLOR_1;
  if (tile === GATE_2) return BALL_COLOR_2;
  return 0;
}

// Top bu karoya girebilir mi (kapi rengi tutmuyorsa giremez)
export function canEnter(tile: number, ballColor: number): boolean {
  if (tile === WALL) return false;
  const g = gateColor(tile);
  return g === 0 || g === ballColor;
}

// Renk kapisi sistemindeki gorsel renkler — mekanik anlam tasir
export const GATE_COLORS: Record<number, string> = {
  [BALL_COLOR_1]: '#e08a5f',
  [BALL_COLOR_2]: '#5f9fd0',
};

// Ok karosunun yön vektörü; ok değilse null
export function arrowDelta(tile: number): { dx: number; dy: number } | null {
  switch (tile) {
    case ARROW_UP:    return { dx: 0,  dy: -1 };
    case ARROW_RIGHT: return { dx: 1,  dy: 0  };
    case ARROW_DOWN:  return { dx: 0,  dy: 1  };
    case ARROW_LEFT:  return { dx: -1, dy: 0  };
    default:          return null;
  }
}

// Yön vektöründen ok karosu
export function arrowTileFor(dx: number, dy: number): number {
  if (dy < 0) return ARROW_UP;
  if (dy > 0) return ARROW_DOWN;
  if (dx < 0) return ARROW_LEFT;
  return ARROW_RIGHT;
}

// Duvar olmayan her karo boyanabilir
export function isPaintable(tile: number): boolean {
  return tile !== WALL;
}

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

// Boya gradient ciftleri: [baslangic, bitis]
// Her seviye colorIndex'e gore bir cift secer
export const PAINT_GRADIENTS: readonly [string, string][] = [
  ['#fce4b8', '#f0a080'],  // sari → yumusak somon
  ['#b8f0d8', '#78c8e0'],  // mint → acik gok mavisi
  ['#f0b8d8', '#e090c0'],  // pembe → orkide
  ['#b8daf0', '#90b0e8'],  // acik mavi → orta mavi
  ['#d0f0b0', '#90d880'],  // lime → orta yesil
  ['#f0c8b0', '#e89888'],  // seftali → acik mercan
  ['#d8c8f0', '#c0a0e8'],  // lavanta → orta mor
  ['#f8e0b8', '#e8c078'],  // bal → sicak altin
  ['#b8f0e0', '#78d0b8'],  // aqua → orta teal
  ['#f0d0c0', '#e8b098'],  // mercan → yumusak terracotta
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

// Çok oyunculu arena
export const MP_URGENT_SECONDS = 10;       // Kırmızı sayaç eşiği
export const MP_BOARD_FLUSH_MS = 80;       // Host tahta yayın aralığı
export const MP_END_GRACE_MS = 700;        // Süre dolunca havadaki hamleler için tolerans

// Çok oyunculu oda ayarları (host seçer)
export interface MpSettings {
  arenaSize: number;    // 11 | 13 | 15
  durationSec: number;  // 45 | 60 | 90 | 120
  powerups: boolean;    // Güç kapsülleri
  capture: boolean;     // Alan çevreleme
}
export const MP_ARENA_SIZES = [11, 13, 15] as const;
export const MP_ARENA_SIZE_NAMES: Record<number, string> = { 11: 'Küçük', 13: 'Orta', 15: 'Büyük' };
export const MP_DURATIONS = [45, 60, 90, 120] as const;
export const MP_DEFAULT_SETTINGS: MpSettings = { arenaSize: 13, durationSec: 60, powerups: true, capture: true };

// Güç kapsülleri
export type PowerType = 'bomb' | 'brush' | 'shield' | 'freeze';
export const POWER_TYPES: PowerType[] = ['bomb', 'brush', 'shield', 'freeze'];
export const POWER_NAMES: Record<PowerType, string> = {
  bomb: 'Bomba', brush: 'Geniş Fırça', shield: 'Kalkan', freeze: 'Donma',
};
export const POWER_FIRST_SPAWN_MS = 3000;   // İlk kapsül
export const POWER_SPAWN_MIN_MS   = 3000;   // Sonraki kapsüller arası (min)
export const POWER_SPAWN_MAX_MS   = 5000;   // (max)
export const POWER_LIFETIME_MS    = 12000;  // Toplanmayan kapsül kaybolur
// Aynı anda tahtadaki kapsül sayısı arena boyutuna göre ölçeklenir
export function powerMaxOnBoard(arenaSize: number): number {
  if (arenaSize <= 11) return 2;
  if (arenaSize <= 13) return 3;
  return 4;
}
// Yeni kapsülün topların bir kaydırmayla ulaşabileceği hatta doğma olasılığı
export const POWER_REACHABLE_BIAS = 0.65;
export const POWER_BOMB_RADIUS    = 1;      // 3x3
export const POWER_SHIELD_MS      = 6000;
export const POWER_FREEZE_MS      = 2000;
export const POWER_BRUSH_MS       = 5000;

// Alan cevreleme: kapatilabilecek en buyuk bolge, boyanabilir alanin orani.
// Yuksek oran kartopu etkisi yaratiyordu: one gecen oyuncu her hamlede daha da
// aciliyor ve mac tek tarafli bitiyordu. Dusuk oran cevirmeyi taktik bir odul
// olarak birakir, mac kazanan hamle olmaktan cikarir.
export const CAPTURE_MAX_REGION_RATIO = 0.14;
// Cevreleme kontrolu icin en kucuk bolge (tek karolik bosluklar gurultu yaratir)
export const CAPTURE_MIN_REGION = 3;
