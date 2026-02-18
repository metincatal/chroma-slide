import { Level } from './Level';
import { Ball } from './Ball';
import {
  WALL, PATH, PAINTED,
  COLORS, LEVEL_COLORS,
  BALL_RADIUS, PAINT_ANIM_DURATION,
} from '../utils/constants';

// Vite base path
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

  // Dis alan cache
  private exteriorCache: Set<string> | null = null;
  private cachedLevelId = -1;

  // Texture'lar
  private texBoard: HTMLImageElement | null = null;
  private texPath: HTMLImageElement | null = null;
  private texBg: HTMLImageElement | null = null;
  private texturesLoaded = false;

  // Tile pattern cache
  private boardPattern: CanvasPattern | null = null;
  private pathPattern: CanvasPattern | null = null;
  private bgPattern: CanvasPattern | null = null;
  private patternCellSize = 0;

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
    } catch (e) {
      console.warn('Texture yuklenemedi, fallback renklere geciliyor:', e);
    }
  }

  // cellSize degistiginde pattern'leri yeniden olustur
  private updatePatterns() {
    if (!this.texturesLoaded || this.patternCellSize === this.cellSize) return;
    this.patternCellSize = this.cellSize;

    const s = this.cellSize;

    // Board pattern: texture'i hucre boyutuna olcekle ve tekrarla
    if (this.texBoard) {
      const offscreen = document.createElement('canvas');
      offscreen.width = s;
      offscreen.height = s;
      const octx = offscreen.getContext('2d')!;
      octx.drawImage(this.texBoard, 0, 0, s, s);
      this.boardPattern = this.ctx.createPattern(offscreen, 'repeat');
    }

    if (this.texPath) {
      const offscreen = document.createElement('canvas');
      offscreen.width = s;
      offscreen.height = s;
      const octx = offscreen.getContext('2d')!;
      octx.drawImage(this.texPath, 0, 0, s, s);
      this.pathPattern = this.ctx.createPattern(offscreen, 'repeat');
    }
  }

  resize(width: number, height: number, dpr: number) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    // Arka plan pattern'i ekran boyutuna gore
    if (this.texBg) {
      this.bgPattern = this.ctx.createPattern(this.texBg, 'repeat');
    }
  }

  clear() {
    if (this.texturesLoaded && this.texBg) {
      this.bgPattern = this.ctx.createPattern(this.texBg, 'repeat');
      if (this.bgPattern) {
        this.ctx.fillStyle = this.bgPattern;
        this.ctx.fillRect(0, 0, this.width, this.height);
        // Hafif acik overlay (asiri karanlik olmamasi icin)
        this.ctx.fillStyle = 'rgba(240, 236, 230, 0.45)';
        this.ctx.fillRect(0, 0, this.width, this.height);
        return;
      }
    }
    this.ctx.fillStyle = COLORS.BACKGROUND;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  calculateLayout(gridWidth: number, gridHeight: number) {
    const maxCellW = (this.width * 0.88) / gridWidth;
    const maxCellH = (this.height * 0.7) / gridHeight;
    this.cellSize = Math.floor(Math.min(maxCellW, maxCellH));
    this.offsetX = Math.floor((this.width - gridWidth * this.cellSize) / 2);
    this.offsetY = Math.floor((this.height - gridHeight * this.cellSize) / 2) + 30 * this.dpr;
  }

  // PATH'e komsu olmayan WALL = dis alan (cizilmez)
  private computeExterior(level: Level): Set<string> {
    if (this.exteriorCache && this.cachedLevelId === level.data.id) {
      return this.exteriorCache;
    }

    const { width: gw, height: gh } = level.data;
    const exterior = new Set<string>();

    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        if (level.data.grid[y * gw + x] !== WALL) continue;

        let adjacentToPath = false;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < gw && ny >= 0 && ny < gh) {
            if (level.data.grid[ny * gw + nx] === PATH) {
              adjacentToPath = true;
              break;
            }
          }
        }

        if (!adjacentToPath) {
          exterior.add(`${x},${y}`);
        }
      }
    }

    this.exteriorCache = exterior;
    this.cachedLevelId = level.data.id;
    return exterior;
  }

  render(level: Level, ball: Ball) {
    const ctx = this.ctx;
    const { width: gw, height: gh } = level.data;

    // Arka plan
    this.drawBackground();

    this.calculateLayout(gw, gh);
    this.updatePatterns();

    const now = performance.now();
    const colorIdx = level.data.colorIndex % LEVEL_COLORS.length;
    const paintColor = LEVEL_COLORS[colorIdx];
    const exterior = this.computeExterior(level);

    // 1. Board (ic duvarlar) - dis alan haric
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        if (level.data.grid[y * gw + x] !== WALL) continue;
        if (exterior.has(`${x},${y}`)) continue;

        const px = this.offsetX + x * this.cellSize;
        const py = this.offsetY + y * this.cellSize;
        this.drawBoard(px, py);
      }
    }

    // 2. Kanal (PATH + PAINTED)
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const tile = level.grid[y * gw + x];
        const px = this.offsetX + x * this.cellSize;
        const py = this.offsetY + y * this.cellSize;

        if (tile === PATH) {
          this.drawChannel(px, py, x, y, level, exterior);
        } else if (tile === PAINTED) {
          const animKey = `${x},${y}`;
          const animStart = level.paintAnimations.get(animKey);
          const animT = animStart ? Math.min((now - animStart) / PAINT_ANIM_DURATION, 1) : 1;
          this.drawPaintedChannel(px, py, x, y, level, exterior, paintColor, animT);
        }
      }
    }

    // 3. Top
    this.drawBall(ball, paintColor);

    // 4. Konfeti
    if (this.confettiActive) {
      this.updateConfetti();
    }
  }

  // Arka plan cizimi (texture veya duz renk)
  private drawBackground() {
    const ctx = this.ctx;
    if (this.texturesLoaded && this.texBg) {
      if (!this.bgPattern) {
        this.bgPattern = ctx.createPattern(this.texBg, 'repeat');
      }
      if (this.bgPattern) {
        ctx.fillStyle = this.bgPattern;
        ctx.fillRect(0, 0, this.width, this.height);
        // Acik overlay - buz temasini yumusatir
        ctx.fillStyle = 'rgba(240, 236, 230, 0.4)';
        ctx.fillRect(0, 0, this.width, this.height);
        return;
      }
    }
    ctx.fillStyle = COLORS.BACKGROUND;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  // Board (duvar) - buz texture
  private drawBoard(x: number, y: number) {
    const ctx = this.ctx;
    const s = this.cellSize;

    if (this.boardPattern) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = this.boardPattern;
      ctx.fillRect(0, 0, s, s);
      // Hafif mavi-beyaz buz tonu overlay
      ctx.fillStyle = 'rgba(200, 220, 240, 0.15)';
      ctx.fillRect(0, 0, s, s);
      ctx.restore();
    } else {
      // Fallback
      const gradient = ctx.createLinearGradient(x, y, x, y + s);
      gradient.addColorStop(0, COLORS.BOARD_LIGHT);
      gradient.addColorStop(1, COLORS.BOARD_DARK);
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, s, s);
    }
  }

  // Kanal (bos path) - kar/frost texture
  private drawChannel(px: number, py: number, gx: number, gy: number, level: Level, exterior: Set<string>) {
    const ctx = this.ctx;
    const s = this.cellSize;

    if (this.pathPattern) {
      ctx.save();
      ctx.translate(px, py);
      ctx.fillStyle = this.pathPattern;
      ctx.fillRect(0, 0, s, s);
      // Hafif beyaz overlay - frost hissi
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fillRect(0, 0, s, s);
      ctx.restore();
    } else {
      ctx.fillStyle = COLORS.PATH;
      ctx.fillRect(px, py, s, s);
    }

    // Duvar kenarlarinda ic golge
    this.drawInnerShadows(px, py, gx, gy, level, exterior);
  }

  // Boyali kanal
  private drawPaintedChannel(
    px: number, py: number, gx: number, gy: number,
    level: Level, exterior: Set<string>,
    color: string, animT: number
  ) {
    const ctx = this.ctx;
    const s = this.cellSize;

    // Taban (path texture)
    if (this.pathPattern) {
      ctx.save();
      ctx.translate(px, py);
      ctx.fillStyle = this.pathPattern;
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fillRect(0, 0, s, s);
      ctx.restore();
    } else {
      ctx.fillStyle = COLORS.PATH;
      ctx.fillRect(px, py, s, s);
    }

    // Boya
    const eased = this.easeOutBack(animT);
    const cx = px + s / 2, cy = py + s / 2;
    const sw = s * eased, sh = s * eased;

    ctx.fillStyle = color;
    ctx.globalAlpha = 0.35 + 0.65 * animT;
    ctx.fillRect(cx - sw / 2, cy - sh / 2, sw, sh);
    ctx.globalAlpha = 1;

    if (animT < 1) {
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = (1 - animT) * 0.3;
      ctx.fillRect(cx - sw / 2, cy - sh / 2, sw, sh);
      ctx.globalAlpha = 1;
    }

    // Duvar kenarlarinda ic golge
    this.drawInnerShadows(px, py, gx, gy, level, exterior);
  }

  // PATH karosunun duvar komsu kenarlarina ic golge ciz
  private drawInnerShadows(px: number, py: number, gx: number, gy: number, level: Level, exterior: Set<string>) {
    const ctx = this.ctx;
    const s = this.cellSize;
    const { width: gw, height: gh } = level.data;
    const shadowSize = Math.max(3, s * 0.08);

    const neighbors: [number, number, 'top' | 'bottom' | 'left' | 'right'][] = [
      [0, -1, 'top'],
      [0, 1, 'bottom'],
      [-1, 0, 'left'],
      [1, 0, 'right'],
    ];

    for (const [dx, dy, side] of neighbors) {
      const nx = gx + dx, ny = gy + dy;
      const isWall = nx < 0 || nx >= gw || ny < 0 || ny >= gh ||
        (level.data.grid[ny * gw + nx] === WALL && !exterior.has(`${nx},${ny}`));

      if (!isWall) continue;

      let grad: CanvasGradient;
      if (side === 'top') {
        grad = ctx.createLinearGradient(px, py, px, py + shadowSize);
        ctx.fillStyle = grad;
        grad.addColorStop(0, 'rgba(100,140,180,0.22)');
        grad.addColorStop(1, 'rgba(100,140,180,0)');
        ctx.fillRect(px, py, s, shadowSize);
      } else if (side === 'bottom') {
        grad = ctx.createLinearGradient(px, py + s, px, py + s - shadowSize);
        ctx.fillStyle = grad;
        grad.addColorStop(0, 'rgba(100,140,180,0.12)');
        grad.addColorStop(1, 'rgba(100,140,180,0)');
        ctx.fillRect(px, py + s - shadowSize, s, shadowSize);
      } else if (side === 'left') {
        grad = ctx.createLinearGradient(px, py, px + shadowSize, py);
        ctx.fillStyle = grad;
        grad.addColorStop(0, 'rgba(100,140,180,0.18)');
        grad.addColorStop(1, 'rgba(100,140,180,0)');
        ctx.fillRect(px, py, shadowSize, s);
      } else {
        grad = ctx.createLinearGradient(px + s, py, px + s - shadowSize, py);
        ctx.fillStyle = grad;
        grad.addColorStop(0, 'rgba(100,140,180,0.10)');
        grad.addColorStop(1, 'rgba(100,140,180,0)');
        ctx.fillRect(px + s - shadowSize, py, shadowSize, s);
      }
    }
  }

  private drawBall(ball: Ball, color: string) {
    const ctx = this.ctx;
    const cx = this.offsetX + (ball.displayX + 0.5) * this.cellSize;
    const cy = this.offsetY + (ball.displayY + 0.5) * this.cellSize;
    const r = BALL_RADIUS * (this.cellSize / 60);

    // Golge
    ctx.beginPath();
    ctx.arc(cx + 2 * this.dpr, cy + 3 * this.dpr, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.fill();

    // Ana top
    const gradient = ctx.createRadialGradient(
      cx - r * 0.3, cy - r * 0.3, r * 0.1,
      cx, cy, r
    );
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.3, this.lightenColor(color, 50));
    gradient.addColorStop(1, color);

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Parlama
    ctx.beginPath();
    ctx.arc(cx - r * 0.25, cy - r * 0.25, r * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.50)';
    ctx.fill();
  }

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
      c.x += c.vx;
      c.y += c.vy;
      c.vy += 0.35;
      c.rotation += c.rotSpeed;
      c.life -= 0.01;

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
  x: number; y: number; vx: number; vy: number;
  size: number; color: string; rotation: number;
  rotSpeed: number; life: number;
}
