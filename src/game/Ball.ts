import { DIRECTIONS, Direction, WALL, SLIDE_SPEED } from '../utils/constants';

export interface SlideResult {
  path: { x: number; y: number }[];
  finalX: number;
  finalY: number;
}

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

  constructor(startX: number, startY: number) {
    this.x = startX;
    this.y = startY;
    this.displayX = startX;
    this.displayY = startY;
  }

  // Verilen yönde duvara çarpana kadar kayma hesapla
  calculateSlide(
    direction: Direction,
    grid: number[],
    width: number,
    height: number
  ): SlideResult | null {
    const dir = DIRECTIONS[direction];
    const path: { x: number; y: number }[] = [];
    let cx = this.x;
    let cy = this.y;

    while (true) {
      const nx = cx + dir.dx;
      const ny = cy + dir.dy;

      // Sınır kontrolü
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) break;

      // Duvar kontrolü
      if (grid[ny * width + nx] === WALL) break;

      cx = nx;
      cy = ny;
      path.push({ x: cx, y: cy });
    }

    // Hiç hareket etmediyse null dön
    if (path.length === 0) return null;

    return {
      path,
      finalX: cx,
      finalY: cy,
    };
  }

  // Kayma animasyonunu başlat
  startSlide(result: SlideResult) {
    this.animating = true;
    this.animPath = result.path;
    this.animProgress = 0;
    this.animDuration = result.path.length * SLIDE_SPEED * 1000;
    this.x = result.finalX;
    this.y = result.finalY;
  }

  // Animasyonu güncelle
  update(dt: number): { x: number; y: number }[] | null {
    if (!this.animating) return null;

    this.animProgress += dt;
    const t = Math.min(this.animProgress / this.animDuration, 1);
    const eased = this.easeOutCubic(t);

    const totalSteps = this.animPath.length;
    const exactStep = eased * totalSteps;
    const stepIndex = Math.min(Math.floor(exactStep), totalSteps - 1);
    const stepFrac = exactStep - Math.floor(exactStep);

    // Geçilen karoları topla (boyama için)
    const paintedTiles: { x: number; y: number }[] = [];
    for (let i = 0; i <= stepIndex; i++) {
      paintedTiles.push(this.animPath[i]);
    }

    // Display pozisyonunu güncelle
    if (stepIndex < totalSteps - 1 && t < 1) {
      const curr = this.animPath[stepIndex];
      const next = this.animPath[stepIndex + 1];
      this.displayX = curr.x + (next.x - curr.x) * stepFrac;
      this.displayY = curr.y + (next.y - curr.y) * stepFrac;
    } else {
      const last = this.animPath[totalSteps - 1];
      this.displayX = last.x;
      this.displayY = last.y;
    }

    if (t >= 1) {
      this.animating = false;
      this.displayX = this.x;
      this.displayY = this.y;
    }

    return paintedTiles;
  }

  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  reset(startX: number, startY: number) {
    this.x = startX;
    this.y = startY;
    this.displayX = startX;
    this.displayY = startY;
    this.animating = false;
    this.animPath = [];
    this.animProgress = 0;
  }
}
