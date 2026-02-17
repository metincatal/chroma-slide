import { LevelData } from './types';
import {
  getLevelById as getProceduralLevel,
  getTotalLevels as getProceduralTotal,
} from './procedural';

export function getLevelById(id: number): LevelData | undefined {
  return getProceduralLevel(id);
}

export function getTotalLevels(): number {
  return getProceduralTotal();
}
