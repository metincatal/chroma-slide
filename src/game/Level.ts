import { LevelData } from '../levels/types';
import { PATH, PAINTED, STAR_THRESHOLDS } from '../utils/constants';

export class Level {
  data: LevelData;
  grid: number[];
  totalPathTiles: number;
  paintedCount: number;
  // Boya animasyonu bilgisi
  paintAnimations: Map<string, number> = new Map();

  constructor(data: LevelData) {
    this.data = data;
    this.grid = [...data.grid];
    this.totalPathTiles = data.grid.filter((c) => c === PATH).length;
    this.paintedCount = 0;

    // Başlangıç karosunu boya
    this.paintTile(data.startX, data.startY);
  }

  paintTile(x: number, y: number): boolean {
    const idx = y * this.data.width + x;
    if (this.grid[idx] === PATH) {
      this.grid[idx] = PAINTED;
      this.paintedCount++;
      this.paintAnimations.set(`${x},${y}`, performance.now());
      return true;
    }
    return false;
  }

  paintTiles(tiles: { x: number; y: number }[]) {
    for (const tile of tiles) {
      this.paintTile(tile.x, tile.y);
    }
  }

  isComplete(): boolean {
    return this.paintedCount >= this.totalPathTiles;
  }

  getProgress(): number {
    return this.totalPathTiles > 0 ? this.paintedCount / this.totalPathTiles : 0;
  }

  calculateStars(moves: number): number {
    const ratio = moves / this.data.targetMoves;
    if (ratio <= STAR_THRESHOLDS.THREE) return 3;
    if (ratio <= STAR_THRESHOLDS.TWO) return 2;
    return 1;
  }

  unpaintTile(x: number, y: number): boolean {
    const idx = y * this.data.width + x;
    if (this.grid[idx] === PAINTED) {
      this.grid[idx] = PATH;
      this.paintedCount--;
      this.paintAnimations.delete(`${x},${y}`);
      return true;
    }
    return false;
  }

  unpaintTiles(tiles: { x: number; y: number }[]) {
    for (const tile of tiles) {
      this.unpaintTile(tile.x, tile.y);
    }
  }

  reset(): Level {
    return new Level(this.data);
  }
}
