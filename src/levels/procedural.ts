import { LevelData } from './types';
import { generateMaze } from './generator';

export interface DifficultyConfig {
  name: string;
  gridSize: number;
  minMoves: number;
  maxMoves: number;
}

const DIFFICULTIES: DifficultyConfig[] = [
  { name: 'Kolay', gridSize: 9, minMoves: 5, maxMoves: 8 },
  { name: 'Orta', gridSize: 11, minMoves: 8, maxMoves: 14 },
  { name: 'Zor', gridSize: 13, minMoves: 12, maxMoves: 20 },
  { name: 'Uzman', gridSize: 15, minMoves: 16, maxMoves: 28 },
];

export function getDifficultyForLevel(levelId: number): DifficultyConfig {
  if (levelId <= 10) return DIFFICULTIES[0];
  if (levelId <= 30) return DIFFICULTIES[1];
  if (levelId <= 60) return DIFFICULTIES[2];
  return DIFFICULTIES[3];
}

const levelCache = new Map<number, LevelData>();

export const TOTAL_LEVELS = 100;

export function getLevelById(levelId: number): LevelData | undefined {
  if (levelId < 1 || levelId > TOTAL_LEVELS) return undefined;

  if (levelCache.has(levelId)) {
    return levelCache.get(levelId)!;
  }

  const config = getDifficultyForLevel(levelId);
  const level = generateMaze(levelId, config);

  if (level) {
    levelCache.set(levelId, level);
    return level;
  }

  // Fallback: farklı seed dene
  for (let offset = 1; offset <= 20; offset++) {
    const fallback = generateMaze(levelId + offset * 1000, config);
    if (fallback) {
      fallback.id = levelId;
      fallback.name = `Seviye ${levelId}`;
      fallback.colorIndex = (levelId - 1) % 10;
      levelCache.set(levelId, fallback);
      return fallback;
    }
  }

  return undefined;
}

export function getTotalLevels(): number {
  return TOTAL_LEVELS;
}
