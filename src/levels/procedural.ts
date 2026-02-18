import { LevelData } from './types';
import { GameMode } from '../utils/constants';
import { generateMaze } from './generator';

export interface DifficultyConfig {
  name: string;
  gridSize: number;
  minMoves: number;
  maxMoves: number;
}

// Taktik modu zorluk kademeleri (7 kademe)
const THINKING_DIFFICULTIES: DifficultyConfig[] = [
  { name: 'Kolay', gridSize: 7, minMoves: 4, maxMoves: 7 },
  { name: 'Orta', gridSize: 9, minMoves: 6, maxMoves: 10 },
  { name: 'Zor', gridSize: 11, minMoves: 8, maxMoves: 14 },
  { name: 'Uzman', gridSize: 13, minMoves: 10, maxMoves: 18 },
  { name: 'Usta', gridSize: 13, minMoves: 14, maxMoves: 22 },
  { name: 'Efsane', gridSize: 15, minMoves: 16, maxMoves: 26 },
  { name: 'Imkansiz', gridSize: 15, minMoves: 20, maxMoves: 30 },
];

// Akis modu zorluk kademeleri (6 kademe)
const RELAXING_DIFFICULTIES: DifficultyConfig[] = [
  { name: 'Kolay', gridSize: 7, minMoves: 3, maxMoves: 6 },
  { name: 'Orta', gridSize: 9, minMoves: 5, maxMoves: 9 },
  { name: 'Zor', gridSize: 11, minMoves: 6, maxMoves: 12 },
  { name: 'Uzman', gridSize: 13, minMoves: 8, maxMoves: 15 },
  { name: 'Usta', gridSize: 13, minMoves: 10, maxMoves: 18 },
  { name: 'Efsane', gridSize: 15, minMoves: 12, maxMoves: 22 },
];

export const LEVELS_PER_MODE = 4000;

// Taktik modu zorluk kategori araliklari
export interface DifficultyTier {
  name: string;
  startLevel: number;
  endLevel: number;
}

export const THINKING_TIERS: DifficultyTier[] = [
  { name: 'Kolay', startLevel: 1, endLevel: 200 },
  { name: 'Orta', startLevel: 201, endLevel: 600 },
  { name: 'Zor', startLevel: 601, endLevel: 1200 },
  { name: 'Uzman', startLevel: 1201, endLevel: 2200 },
  { name: 'Usta', startLevel: 2201, endLevel: 3000 },
  { name: 'Efsane', startLevel: 3001, endLevel: 3600 },
  { name: 'Imkansiz', startLevel: 3601, endLevel: 4000 },
];

export const RELAXING_TIERS: DifficultyTier[] = [
  { name: 'Kolay', startLevel: 1, endLevel: 300 },
  { name: 'Orta', startLevel: 301, endLevel: 800 },
  { name: 'Zor', startLevel: 801, endLevel: 1500 },
  { name: 'Uzman', startLevel: 1501, endLevel: 2500 },
  { name: 'Usta', startLevel: 2501, endLevel: 3200 },
  { name: 'Efsane', startLevel: 3201, endLevel: 4000 },
];

export function getDifficultyTiers(mode: GameMode): DifficultyTier[] {
  return mode === 'thinking' ? THINKING_TIERS : RELAXING_TIERS;
}

export function getDifficultyForLevel(levelId: number, mode: GameMode = 'thinking'): DifficultyConfig {
  if (mode === 'thinking') {
    if (levelId <= 200) return THINKING_DIFFICULTIES[0];
    if (levelId <= 600) return THINKING_DIFFICULTIES[1];
    if (levelId <= 1200) return THINKING_DIFFICULTIES[2];
    if (levelId <= 2200) return THINKING_DIFFICULTIES[3];
    if (levelId <= 3000) return THINKING_DIFFICULTIES[4];
    if (levelId <= 3600) return THINKING_DIFFICULTIES[5];
    return THINKING_DIFFICULTIES[6];
  } else {
    if (levelId <= 300) return RELAXING_DIFFICULTIES[0];
    if (levelId <= 800) return RELAXING_DIFFICULTIES[1];
    if (levelId <= 1500) return RELAXING_DIFFICULTIES[2];
    if (levelId <= 2500) return RELAXING_DIFFICULTIES[3];
    if (levelId <= 3200) return RELAXING_DIFFICULTIES[4];
    return RELAXING_DIFFICULTIES[5];
  }
}

// Mod bazli cache: key = "${mode}_${id}"
const levelCache = new Map<string, LevelData>();

export function getLevelById(levelId: number, mode: GameMode = 'thinking'): LevelData | undefined {
  if (levelId < 1 || levelId > LEVELS_PER_MODE) return undefined;

  const cacheKey = `${mode}_${levelId}`;
  if (levelCache.has(cacheKey)) {
    return levelCache.get(cacheKey)!;
  }

  const config = getDifficultyForLevel(levelId, mode);
  const level = generateMaze(levelId, config, mode);

  if (level) {
    levelCache.set(cacheKey, level);
    return level;
  }

  // Fallback: farkli seed dene
  for (let offset = 1; offset <= 50; offset++) {
    const fallback = generateMaze(levelId + offset * 1000, config, mode);
    if (fallback) {
      fallback.id = levelId;
      fallback.name = `Seviye ${levelId}`;
      fallback.colorIndex = (levelId - 1) % 10;
      levelCache.set(cacheKey, fallback);
      return fallback;
    }
  }

  return undefined;
}

export function getTotalLevels(): number {
  return LEVELS_PER_MODE;
}

// Undo hakki hesaplama
export function getUndoCount(levelId: number, mode: GameMode): number {
  if (mode === 'relaxing') return 99; // Sinirsiz
  const config = getDifficultyForLevel(levelId, mode);
  switch (config.name) {
    case 'Kolay': return 5;
    case 'Orta': return 5;
    case 'Zor': return 4;
    case 'Uzman': return 4;
    case 'Usta': return 3;
    case 'Efsane': return 3;
    case 'Imkansiz': return 3;
    default: return 5;
  }
}
