import { DIRECTIONS, Direction, SLIDE_SPEED } from '../utils/constants';
import { computeSlide, SlideOutcome } from './slide';

export type SlideResult = SlideOutcome;

export class Ball {
  x: number;
  y: number;

  // Animasyon durumu
  animating = false;
  animPath: { x: number; y: number }[] = [];
  animProgress = 0;
  animDuration = 0;
  displayX: number;
  displayY: number;

  // Hareket yonu ve hiz (renderer icin)
  moveDirX = 0;
  moveDirY = 0;
  speed = 0; // Normalized 0-1 arasi animasyon hiz orani

  // Kaymanin bittigi andaki yon (ok karolari yonu degistirebilir)
  endDirX = 0;
  endDirY = 0;

  constructor(startX: number, startY: number) {
    this.x = startX;
    this.y = startY;
    this.displayX = startX;
    this.displayY = startY;
  }

  calculateSlide(
    direction: Direction,
    grid: number[],
    width: number,
    height: number
  ): SlideResult | null {
    const dir = DIRECTIONS[direction];
    return computeSlide(grid, width, height, this.x, this.y, dir.dx, dir.dy);
  }

  startSlide(result: SlideResult) {
    this.animating = true;
    this.animPath = result.path;
    this.animProgress = 0;
    this.animDuration = result.path.length * SLIDE_SPEED * 1000;

    // Hareket yonunu hesapla
    if (result.path.length > 0) {
      const first = result.path[0];
      this.moveDirX = first.x - this.x;
      this.moveDirY = first.y - this.y;
    }
    this.endDirX = result.dirX;
    this.endDirY = result.dirY;

    this.x = result.finalX;
    this.y = result.finalY;
  }

  update(dt: number): { x: number; y: number }[] | null {
    if (!this.animating) return null;

    this.animProgress += dt;
    const t = Math.min(this.animProgress / this.animDuration, 1);
    // Yumuşak easing: hızlı başla, yavaş bitir
    const eased = this.easeOutQuart(t);

    const totalSteps = this.animPath.length;
    const exactStep = eased * totalSteps;
    const stepIndex = Math.min(Math.floor(exactStep), totalSteps - 1);
    const stepFrac = exactStep - Math.floor(exactStep);

    const paintedTiles: { x: number; y: number }[] = [];
    for (let i = 0; i <= stepIndex; i++) {
      paintedTiles.push(this.animPath[i]);
    }

    if (stepIndex < totalSteps - 1 && t < 1) {
      const curr = this.animPath[stepIndex];
      const next = this.animPath[stepIndex + 1];
      this.displayX = curr.x + (next.x - curr.x) * stepFrac;
      this.displayY = curr.y + (next.y - curr.y) * stepFrac;
      // Ok karolari yonu degistirebildigi icin gorsel yonu adim adim guncelle
      const sdx = next.x - curr.x, sdy = next.y - curr.y;
      if (sdx !== 0 || sdy !== 0) { this.moveDirX = sdx; this.moveDirY = sdy; }
    } else {
      const last = this.animPath[totalSteps - 1];
      this.displayX = last.x;
      this.displayY = last.y;
    }

    // Hiz orani: easeOutQuart'in turevi → baslangicta max, sona dogru azalir
    this.speed = t < 1 ? Math.min(1, Math.pow(1 - t, 2) * 2.5) : 0;

    if (t >= 1) {
      this.animating = false;
      this.displayX = this.x;
      this.displayY = this.y;
      this.speed = 0;
      this.moveDirX = this.endDirX;
      this.moveDirY = this.endDirY;
    }

    return paintedTiles;
  }

  // easeOutQuart: daha kaygan ve yumuşak his
  private easeOutQuart(t: number): number {
    return 1 - Math.pow(1 - t, 4);
  }

  reset(startX: number, startY: number) {
    this.x = startX;
    this.y = startY;
    this.displayX = startX;
    this.displayY = startY;
    this.animating = false;
    this.animPath = [];
    this.animProgress = 0;
    this.moveDirX = 0;
    this.moveDirY = 0;
    this.endDirX = 0;
    this.endDirY = 0;
    this.speed = 0;
  }
}
