import { Level } from './Level';
import { Ball } from './Ball';
import {
  WALL, PATH, PAINTED,
  COLORS, LEVEL_COLORS,
  BALL_RADIUS, PAINT_ANIM_DURATION,
} from '../utils/constants';

const BASE = import.meta.env.BASE_URL;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private cellSize = 60;
  private offsetX = 0;
  private offsetY = 0;

  // Konfeti
  private confetti: Confetti[] = [];
  private confettiActive = false;

  // Dis alan cache (numeric key = y*w+x, string Set yerine)
  private exteriorCache: Set<number> | null = null;
  private cachedLevelId = -1;

  // Texture
  private texBoard: HTMLImageElement | null = null;
  private texPath: HTMLImageElement | null = null;
  private texBg: HTMLImageElement | null = null;
  private texturesLoaded = false;

  // Statik katman cache - board + bos path + golge onceden cizilir
  private staticCanvas: HTMLCanvasElement | null = null;
  private staticCtx: CanvasRenderingContext2D | null = null;
  private staticLevelId = -1;
  private staticW = 0;
  private staticH = 0;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context alinamadi');
    this.ctx = ctx;
    this.loadTextures();
  }

  private async loadTextures() {
    try {
      const [board, path, bg] = await Promise.all([
        loadImage(`${BASE}assets/textures/board.jpg`),
        loadImage(`${BASE}assets/textures/path.jpg`),
        loadImage(`${BASE}assets/textures/background.jpg`),
      ]);
      this.texBoard = board;
      this.texPath = path;
      this.texBg = bg;
      this.texturesLoaded = true;
      this.staticLevelId = -1;
    } catch (e) {
      console.warn('Texture yuklenemedi:', e);
    }
  }

  resize(width: number, height: number, dpr: number) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.staticLevelId = -1;
  }

  clear() {
    this.drawBg(this.ctx);
  }

  calculateLayout(gridWidth: number, gridHeight: number) {
    const maxCellW = (this.width * 0.88) / gridWidth;
    const maxCellH = (this.height * 0.7) / gridHeight;
    this.cellSize = Math.floor(Math.min(maxCellW, maxCellH));
    this.offsetX = Math.floor((this.width - gridWidth * this.cellSize) / 2);
    this.offsetY = Math.floor((this.height - gridHeight * this.cellSize) / 2) + 30 * this.dpr;
  }

  // --- Arka plan ---
  private drawBg(ctx: CanvasRenderingContext2D) {
    if (this.texturesLoaded && this.texBg) {
      const pat = ctx.createPattern(this.texBg, 'repeat');
      if (pat) {
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.fillStyle = 'rgba(240, 236, 230, 0.4)';
        ctx.fillRect(0, 0, this.width, this.height);
        return;
      }
    }
    ctx.fillStyle = COLORS.BACKGROUND;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  // --- Exterior hesapla (numeric Set - GC dostu) ---
  private computeExterior(level: Level): Set<number> {
    if (this.exteriorCache && this.cachedLevelId === level.data.id) {
      return this.exteriorCache;
    }
    const { width: gw, height: gh } = level.data;
    const exterior = new Set<number>();
    const offsets = [-1, 0, 1, 0, -1, -1, 1, -1, -1, 1, 1, 1, 0, -1, 0, 1];

    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        if (level.data.grid[y * gw + x] !== WALL) continue;
        let adj = false;
        for (let i = 0; i < 16; i += 2) {
          const nx = x + offsets[i], ny = y + offsets[i + 1];
          if (nx >= 0 && nx < gw && ny >= 0 && ny < gh && level.data.grid[ny * gw + nx] === PATH) {
            adj = true;
            break;
          }
        }
        if (!adj) exterior.add(y * gw + x);
      }
    }
    this.exteriorCache = exterior;
    this.cachedLevelId = level.data.id;
    return exterior;
  }

  // --- Statik katman olustur (level basina 1 kez) ---
  private buildStaticLayer(level: Level) {
    if (!this.staticCanvas || this.staticW !== this.width || this.staticH !== this.height) {
      this.staticCanvas = document.createElement('canvas');
      this.staticCanvas.width = this.width;
      this.staticCanvas.height = this.height;
      this.staticCtx = this.staticCanvas.getContext('2d')!;
      this.staticW = this.width;
      this.staticH = this.height;
    }

    const sCtx = this.staticCtx!;
    const { width: gw, height: gh, grid } = level.data;
    const s = this.cellSize;
    const boardR = Math.max(2, s * 0.12);
    const pathR = Math.max(2, s * 0.10);
    const exterior = this.computeExterior(level);

    // Arka plan
    this.drawBg(sCtx);

    // Board ve path fill stilleri
    let boardFill: string | CanvasPattern = COLORS.BOARD_LIGHT;
    if (this.texBoard) {
      const p = sCtx.createPattern(this.texBoard, 'repeat');
      if (p) boardFill = p;
    }
    let pathFill: string | CanvasPattern = COLORS.PATH;
    if (this.texPath) {
      const p = sCtx.createPattern(this.texPath, 'repeat');
      if (p) pathFill = p;
    }

    // Board karolari (duvarlar)
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        if (grid[y * gw + x] !== WALL) continue;
        if (exterior.has(y * gw + x)) continue;
        const px = this.offsetX + x * s;
        const py = this.offsetY + y * s;
        sCtx.fillStyle = boardFill;
        this.fillRoundRect(sCtx, px - 0.5, py - 0.5, s + 1, s + 1, boardR);
        sCtx.fillStyle = 'rgba(200, 220, 240, 0.12)';
        this.fillRoundRect(sCtx, px - 0.5, py - 0.5, s + 1, s + 1, boardR);
      }
    }

    // Path karolari (kanallar)
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        if (grid[y * gw + x] !== PATH) continue;
        const px = this.offsetX + x * s;
        const py = this.offsetY + y * s;
        sCtx.fillStyle = pathFill;
        this.fillRoundRect(sCtx, px - 0.5, py - 0.5, s + 1, s + 1, pathR);
        sCtx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        this.fillRoundRect(sCtx, px - 0.5, py - 0.5, s + 1, s + 1, pathR);
        // Ic golgeler
        this.drawShadows(sCtx, px, py, x, y, gw, gh, grid, exterior, s);
      }
    }

    this.staticLevelId = level.data.id;
  }

  // --- Ic golgeler (statik katmana onceden cizilir) ---
  private drawShadows(
    ctx: CanvasRenderingContext2D,
    px: number, py: number,
    gx: number, gy: number,
    gw: number, gh: number,
    grid: number[],
    exterior: Set<number>,
    s: number
  ) {
    const sh = Math.max(3, s * 0.08);
    const sides: [number, number, number][] = [
      [0, -1, 0], // top
      [0, 1, 1],  // bottom
      [-1, 0, 2], // left
      [1, 0, 3],  // right
    ];

    for (const [dx, dy, side] of sides) {
      const nx = gx + dx, ny = gy + dy;
      const isWall = nx < 0 || nx >= gw || ny < 0 || ny >= gh ||
        (grid[ny * gw + nx] === WALL && !exterior.has(ny * gw + nx));
      if (!isWall) continue;

      let grad: CanvasGradient;
      if (side === 0) {
        grad = ctx.createLinearGradient(px, py, px, py + sh);
        grad.addColorStop(0, 'rgba(100,140,180,0.20)');
        grad.addColorStop(1, 'rgba(100,140,180,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(px, py, s, sh);
      } else if (side === 1) {
        grad = ctx.createLinearGradient(px, py + s, px, py + s - sh);
        grad.addColorStop(0, 'rgba(100,140,180,0.10)');
        grad.addColorStop(1, 'rgba(100,140,180,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(px, py + s - sh, s, sh);
      } else if (side === 2) {
        grad = ctx.createLinearGradient(px, py, px + sh, py);
        grad.addColorStop(0, 'rgba(100,140,180,0.16)');
        grad.addColorStop(1, 'rgba(100,140,180,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(px, py, sh, s);
      } else {
        grad = ctx.createLinearGradient(px + s, py, px + s - sh, py);
        grad.addColorStop(0, 'rgba(100,140,180,0.08)');
        grad.addColorStop(1, 'rgba(100,140,180,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(px + s - sh, py, sh, s);
      }
    }
  }

  // --- Ana render (her frame) ---
  render(level: Level, ball: Ball) {
    const ctx = this.ctx;
    const { width: gw, height: gh } = level.data;
    this.calculateLayout(gw, gh);

    // Statik cache olustur (level basina 1 kez)
    if (this.staticLevelId !== level.data.id) {
      this.buildStaticLayer(level);
    }

    // 1. Statik katman (tek drawImage - cok hizli)
    if (this.staticCanvas) {
      ctx.drawImage(this.staticCanvas, 0, 0);
    } else {
      ctx.fillStyle = COLORS.BACKGROUND;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // 2. Boyali karolar (dinamik)
    const now = performance.now();
    const colorIdx = level.data.colorIndex % LEVEL_COLORS.length;
    const paintColor = LEVEL_COLORS[colorIdx];
    const s = this.cellSize;
    const pathR = Math.max(2, s * 0.10);

    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        if (level.grid[y * gw + x] !== PAINTED) continue;

        const px = this.offsetX + x * s;
        const py = this.offsetY + y * s;
        const animKey = `${x},${y}`;
        const animStart = level.paintAnimations.get(animKey);
        const animT = animStart ? Math.min((now - animStart) / PAINT_ANIM_DURATION, 1) : 1;

        const eased = this.easeOutBack(animT);
        const cx = px + s / 2, cy = py + s / 2;
        const sw = s * eased, sh = s * eased;

        ctx.fillStyle = paintColor;
        ctx.globalAlpha = 0.35 + 0.65 * animT;
        this.fillRoundRect(ctx, cx - sw / 2, cy - sh / 2, sw, sh, pathR * eased);
        ctx.globalAlpha = 1;

        if (animT < 1) {
          ctx.fillStyle = '#fff';
          ctx.globalAlpha = (1 - animT) * 0.3;
          this.fillRoundRect(ctx, cx - sw / 2, cy - sh / 2, sw, sh, pathR * eased);
          ctx.globalAlpha = 1;
        }
      }
    }

    // 3. Top
    this.drawBall(ball, paintColor);

    // 4. Konfeti
    if (this.confettiActive) this.updateConfetti();
  }

  // --- Yuvarlak dikdortgen cizimi ---
  private fillRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    r = Math.min(r, w / 2, h / 2);
    if (r < 1) { ctx.fillRect(x, y, w, h); return; }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  // --- Top ---
  private drawBall(ball: Ball, color: string) {
    const ctx = this.ctx;
    const cx = this.offsetX + (ball.displayX + 0.5) * this.cellSize;
    const cy = this.offsetY + (ball.displayY + 0.5) * this.cellSize;
    const r = BALL_RADIUS * (this.cellSize / 60);

    ctx.beginPath();
    ctx.arc(cx + 2 * this.dpr, cy + 3 * this.dpr, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.fill();

    const gradient = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.3, this.lightenColor(color, 50));
    gradient.addColorStop(1, color);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx - r * 0.25, cy - r * 0.25, r * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.50)';
    ctx.fill();
  }

  // --- Konfeti ---
  startConfetti(color: string) {
    this.confetti = [];
    this.confettiActive = true;
    const colors = [color, '#e0c870', '#f4c4c4', '#b0e4c4', '#b4d4f0', '#d4b8e4', '#fff'];
    for (let i = 0; i < 60; i++) {
      this.confetti.push({
        x: this.width / 2 + (Math.random() - 0.5) * 200,
        y: this.height / 2,
        vx: (Math.random() - 0.5) * 12,
        vy: -Math.random() * 15 - 4,
        size: Math.random() * 7 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 8,
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
      c.x += c.vx; c.y += c.vy; c.vy += 0.35;
      c.rotation += c.rotSpeed; c.life -= 0.01;
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
    if (!alive) { this.confettiActive = false; this.confetti = []; }
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
  x: number; y: number; vx: number; vy: number;
  size: number; color: string; rotation: number;
  rotSpeed: number; life: number;
}
