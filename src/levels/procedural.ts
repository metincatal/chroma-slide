import { LevelData } from './types';
import { generateMaze } from './generator';

export interface DifficultyConfig {
  name: string;
  gridSize: number;
  minMoves: number;
  maxMoves: number;
}

const DIFFICULTIES: DifficultyConfig[] = [
  { name: 'Kolay', gridSize: 7, minMoves: 4, maxMoves: 7 },
  { name: 'Orta', gridSize: 9, minMoves: 6, maxMoves: 10 },
  { name: 'Zor', gridSize: 11, minMoves: 8, maxMoves: 14 },
  { name: 'Uzman', gridSize: 13, minMoves: 10, maxMoves: 18 },
  { name: 'Usta', gridSize: 13, minMoves: 14, maxMoves: 22 },
];

export function getDifficultyForLevel(levelId: number): DifficultyConfig {
  if (levelId <= 15) return DIFFICULTIES[0];
  if (levelId <= 40) return DIFFICULTIES[1];
  if (levelId <= 80) return DIFFICULTIES[2];
  if (levelId <= 140) return DIFFICULTIES[3];
  return DIFFICULTIES[4];
}

const levelCache = new Map<number, LevelData>();

export const TOTAL_LEVELS = 200;

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

  // Fallback: farkli seed dene (daha genis aralik)
  for (let offset = 1; offset <= 50; offset++) {
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
