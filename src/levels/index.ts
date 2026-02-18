import { LevelData } from './types';
import { GameMode } from '../utils/constants';
import {
  getLevelById as getProceduralLevel,
  getTotalLevels as getProceduralTotal,
} from './procedural';

export function getLevelById(id: number, mode: GameMode = 'thinking'): LevelData | undefined {
  return getProceduralLevel(id, mode);
}

export function getTotalLevels(): number {
  return getProceduralTotal();
}
