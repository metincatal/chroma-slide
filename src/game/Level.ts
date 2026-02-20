import { LevelData } from '../levels/types';
import { PATH, PAINTED, STAR_THRESHOLDS } from '../utils/constants';

export class Level {
  data: LevelData;
  grid: number[];
  totalPathTiles: number;
  paintedCount: number;
  // Boya animasyonu bilgisi
  paintAnimations: Map<string, number> = new Map();
  // Boya sirasi takibi (gradient icin)
  paintOrder: Map<string, number> = new Map();
  paintCounter = 0;

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
      // Boya sirasi kaydet
      const key = `${x},${y}`;
      if (!this.paintOrder.has(key)) {
        this.paintOrder.set(key, this.paintCounter++);
      }
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
      this.paintOrder.delete(`${x},${y}`);
      return true;
    }
    return false;
  }

  unpaintTiles(tiles: { x: number; y: number }[]) {
    for (const tile of tiles) {
      this.unpaintTile(tile.x, tile.y);
    }
  }

  // Boya sirasi normallestirilmis deger (0-1 arasi)
  getPaintProgress(x: number, y: number): number {
    const key = `${x},${y}`;
    const order = this.paintOrder.get(key);
    if (order === undefined || this.paintCounter <= 1) return 0;
    return order / (this.paintCounter - 1);
  }

  reset(): Level {
    return new Level(this.data);
  }
}
