import { Level } from './Level';
import { Ball } from './Ball';
import {
  WALL, PATH, PAINTED,
  COLORS, LEVEL_COLORS,
  BALL_RADIUS, WALL_HEIGHT, PAINT_ANIM_DURATION,
} from '../utils/constants';

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private cellSize = 60;
  private offsetX = 0;
  private offsetY = 0;

  // Konfeti sistemi
  private confetti: Confetti[] = [];
  private confettiActive = false;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context alınamadı');
    this.ctx = ctx;
  }

  resize(width: number, height: number, dpr: number) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
  }

  // Grid boyutlarını hesapla
  calculateLayout(gridWidth: number, gridHeight: number) {
    const maxCellW = (this.width * 0.88) / gridWidth;
    const maxCellH = (this.height * 0.7) / gridHeight;
    this.cellSize = Math.floor(Math.min(maxCellW, maxCellH));
    this.offsetX = Math.floor((this.width - gridWidth * this.cellSize) / 2);
    this.offsetY = Math.floor((this.height - gridHeight * this.cellSize) / 2) + 30 * this.dpr;
  }

  render(level: Level, ball: Ball) {
    const ctx = this.ctx;
    const { width: gw, height: gh } = level.data;

    // Arka plan
    ctx.fillStyle = COLORS.BACKGROUND;
    ctx.fillRect(0, 0, this.width, this.height);

    this.calculateLayout(gw, gh);

    const now = performance.now();
    const colorIdx = level.data.colorIndex % LEVEL_COLORS.length;
    const paintColor = LEVEL_COLORS[colorIdx];

    // Karoları çiz
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const tile = level.grid[y * gw + x];
        const px = this.offsetX + x * this.cellSize;
        const py = this.offsetY + y * this.cellSize;

        if (tile === WALL) {
          this.drawWall(px, py);
        } else if (tile === PATH) {
          this.drawPath(px, py);
        } else if (tile === PAINTED) {
          const animKey = `${x},${y}`;
          const animStart = level.paintAnimations.get(animKey);
          const animT = animStart ? Math.min((now - animStart) / PAINT_ANIM_DURATION, 1) : 1;
          this.drawPainted(px, py, paintColor, animT);
        }
      }
    }

    // Topu çiz
    this.drawBall(ball, paintColor);

    // Konfeti
    if (this.confettiActive) {
      this.updateConfetti();
    }
  }

  private drawWall(x: number, y: number) {
    const ctx = this.ctx;
    const s = this.cellSize;
    const h = WALL_HEIGHT * this.dpr;

    // Duvar gölgesi
    ctx.fillStyle = COLORS.WALL_SHADOW;
    ctx.fillRect(x, y + h, s, s);

    // Duvar yüzü
    ctx.fillStyle = COLORS.WALL_FACE;
    ctx.fillRect(x, y, s, s);

    // Üst kenar (3D efekt)
    ctx.fillStyle = COLORS.WALL_TOP;
    ctx.fillRect(x, y, s, h);
  }

  private drawPath(x: number, y: number) {
    const ctx = this.ctx;
    const s = this.cellSize;

    ctx.fillStyle = COLORS.PATH;
    ctx.fillRect(x, y, s, s);

    // Kenar çizgisi
    ctx.strokeStyle = COLORS.PATH_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
  }

  private drawPainted(x: number, y: number, color: string, animT: number) {
    const ctx = this.ctx;
    const s = this.cellSize;

    // Arka plan
    ctx.fillStyle = COLORS.PATH;
    ctx.fillRect(x, y, s, s);

    // Boya animasyonu (merkezden büyüme)
    const eased = this.easeOutBack(animT);
    const scale = eased;
    const cx = x + s / 2;
    const cy = y + s / 2;
    const sw = s * scale;
    const sh = s * scale;

    ctx.fillStyle = color;
    ctx.globalAlpha = 0.3 + 0.7 * animT;
    ctx.fillRect(cx - sw / 2, cy - sh / 2, sw, sh);
    ctx.globalAlpha = 1;

    // Parlama efekti
    if (animT < 1) {
      const glowAlpha = (1 - animT) * 0.4;
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = glowAlpha;
      ctx.fillRect(cx - sw / 2, cy - sh / 2, sw, sh);
      ctx.globalAlpha = 1;
    }
  }

  private drawBall(ball: Ball, color: string) {
    const ctx = this.ctx;
    const cx = this.offsetX + (ball.displayX + 0.5) * this.cellSize;
    const cy = this.offsetY + (ball.displayY + 0.5) * this.cellSize;
    const r = BALL_RADIUS * (this.cellSize / 60);

    // Gölge
    ctx.beginPath();
    ctx.arc(cx + 2 * this.dpr, cy + 3 * this.dpr, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();

    // Ana top
    const gradient = ctx.createRadialGradient(
      cx - r * 0.3, cy - r * 0.3, r * 0.1,
      cx, cy, r
    );
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.3, this.lightenColor(color, 40));
    gradient.addColorStop(1, color);

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Parlama
    ctx.beginPath();
    ctx.arc(cx - r * 0.25, cy - r * 0.25, r * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fill();
  }

  // Konfeti başlat
  startConfetti(color: string) {
    this.confetti = [];
    this.confettiActive = true;
    const colors = [color, '#ffd93d', '#ff6b6b', '#6bcb77', '#4d96ff', '#cc5de8', '#fff'];
    for (let i = 0; i < 80; i++) {
      this.confetti.push({
        x: this.width / 2 + (Math.random() - 0.5) * 200,
        y: this.height / 2,
        vx: (Math.random() - 0.5) * 15,
        vy: -Math.random() * 18 - 5,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 10,
        life: 1,
      });
    }
  }

  stopConfetti() {
    this.confettiActive = false;
    this.confetti = [];
  }

  private updateConfetti() {
    const ctx = this.ctx;
    let alive = false;

    for (const c of this.confetti) {
      c.x += c.vx;
      c.y += c.vy;
      c.vy += 0.4;
      c.rotation += c.rotSpeed;
      c.life -= 0.008;

      if (c.life <= 0) continue;
      alive = true;

      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate((c.rotation * Math.PI) / 180);
      ctx.globalAlpha = c.life;
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size * 0.6);
      ctx.restore();
    }

    if (!alive) {
      this.confettiActive = false;
      this.confetti = [];
    }
  }

  private lightenColor(hex: string, amount: number): string {
    const num = parseInt(hex.slice(1), 16);
    const r = Math.min(255, ((num >> 16) & 0xff) + amount);
    const g = Math.min(255, ((num >> 8) & 0xff) + amount);
    const b = Math.min(255, (num & 0xff) + amount);
    return `rgb(${r},${g},${b})`;
  }

  private easeOutBack(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
}

interface Confetti {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  rotSpeed: number;
  life: number;
}
