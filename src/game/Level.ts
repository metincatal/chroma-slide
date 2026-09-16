import { LevelData } from '../levels/types';
import { WALL, isPaintable, STAR_THRESHOLDS } from '../utils/constants';

export class Level {
  data: LevelData;
  // Karo tipleri — oyun boyunca değişmez. Boyama durumu ayrı tutulur.
  grid: number[];
  painted: Uint8Array;
  totalPaintable: number;
  paintedCount: number;
  // Boya animasyonu bilgisi
  paintAnimations: Map<string, number> = new Map();
  // Boya sirasi takibi (gradient icin)
  paintOrder: Map<string, number> = new Map();
  paintCounter = 0;

  constructor(data: LevelData) {
    this.data = data;
    this.grid = [...data.grid];
    this.painted = new Uint8Array(this.grid.length);
    this.totalPaintable = this.grid.filter(isPaintable).length;
    this.paintedCount = 0;

    // Başlangıç karosunu boya
    this.paintTile(data.startX, data.startY);
  }

  isPainted(x: number, y: number): boolean {
    return this.painted[y * this.data.width + x] === 1;
  }

  isPaintedIdx(idx: number): boolean {
    return this.painted[idx] === 1;
  }

  paintTile(x: number, y: number): boolean {
    const idx = y * this.data.width + x;
    if (this.grid[idx] === WALL) return false;
    if (this.painted[idx] === 1) return false;

    this.painted[idx] = 1;
    this.paintedCount++;
    this.paintAnimations.set(`${x},${y}`, performance.now());
    const key = `${x},${y}`;
    if (!this.paintOrder.has(key)) {
      this.paintOrder.set(key, this.paintCounter++);
    }
    return true;
  }

  paintTiles(tiles: { x: number; y: number }[]) {
    for (const tile of tiles) {
      this.paintTile(tile.x, tile.y);
    }
  }

  isComplete(): boolean {
    return this.paintedCount >= this.totalPaintable;
  }

  getProgress(): number {
    return this.totalPaintable > 0 ? this.paintedCount / this.totalPaintable : 0;
  }

  calculateStars(moves: number): number {
    const ratio = moves / this.data.targetMoves;
    if (ratio <= STAR_THRESHOLDS.THREE) return 3;
    if (ratio <= STAR_THRESHOLDS.TWO) return 2;
    return 1;
  }

  unpaintTile(x: number, y: number): boolean {
    const idx = y * this.data.width + x;
    if (this.painted[idx] !== 1) return false;
    this.painted[idx] = 0;
    this.paintedCount--;
    this.paintAnimations.delete(`${x},${y}`);
    this.paintOrder.delete(`${x},${y}`);
    return true;
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

  // Çok oyunculu boya: WALL hariç her karoyu boyar.
  // Yeni karo boyandıysa true, yalnızca sahiplik değiştiyse false döner.
  paintTileMultiplayer(x: number, y: number): boolean {
    const idx = y * this.data.width + x;
    if (this.grid[idx] === WALL) return false;

    if (this.painted[idx] !== 1) {
      this.paintTile(x, y);
      return true;
    }

    // Zaten boyalı — sahiplik değişimi için animasyonu yenile
    this.paintAnimations.set(`${x},${y}`, performance.now());
    return false;
  }

  reset(): Level {
    return new Level(this.data);
  }
}
