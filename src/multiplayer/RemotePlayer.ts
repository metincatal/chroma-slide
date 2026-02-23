import { Ball } from '../game/Ball';
import { Direction } from '../utils/constants';

interface PendingMove {
  dir: Direction;
  seq: number;
}

export class RemotePlayer {
  readonly ball: Ball;
  colorIndex: number;
  name: string;
  score: number;
  connected: boolean;

  private pendingMoves: PendingMove[] = [];
  private lastProcessedSeq = -1;

  constructor(startX: number, startY: number, colorIndex: number, name: string) {
    this.ball       = new Ball(startX, startY);
    this.colorIndex = colorIndex;
    this.name       = name;
    this.score      = 0;
    this.connected  = true;
  }

  addMove(dir: Direction, seq: number): void {
    // Duplicate koruması
    if (seq <= this.lastProcessedSeq) return;
    if (this.pendingMoves.some((m) => m.seq === seq)) return;

    this.pendingMoves.push({ dir, seq });
    this.pendingMoves.sort((a, b) => a.seq - b.seq);
  }

  /**
   * Her frame çağrılır. Boyanan karoları döndürür; null ise animasyon devam ediyor.
   */
  update(
    dt: number,
    grid: number[],
    width: number,
    height: number
  ): { x: number; y: number }[] | null {
    const painted = this.ball.update(dt);

    // Animasyon bitti ve kuyrukta hamle var → bir sonrakini başlat
    if (!this.ball.animating && this.pendingMoves.length > 0) {
      // Sadece sıraya giren en yakın hamleyi al
      const next = this.pendingMoves.shift()!;
      this.lastProcessedSeq = next.seq;

      const result = this.ball.calculateSlide(next.dir, grid, width, height);
      if (result) this.ball.startSlide(result);
    }

    return painted;
  }
}
