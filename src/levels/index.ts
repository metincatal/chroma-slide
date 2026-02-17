import { LevelData } from './types';
import { easyLevels } from './easy';
import { mediumLevels } from './medium';
import { hardLevels } from './hard';
import { expertLevels } from './expert';

const allLevels: LevelData[] = [
  ...easyLevels,
  ...mediumLevels,
  ...hardLevels,
  ...expertLevels,
];

export function getAllLevels(): LevelData[] {
  return allLevels;
}

export function getLevelById(id: number): LevelData | undefined {
  return allLevels.find((l) => l.id === id);
}

export function getTotalLevels(): number {
  return allLevels.length;
}
