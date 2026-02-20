import { Level } from './Level';
import { Ball } from './Ball';
import {
  WALL, PATH, PAINTED,
  COLORS, LEVEL_COLORS, PAINT_GRADIENTS,
  BALL_RADIUS, PAINT_ANIM_DURATION,
} from '../utils/constants';
import { ThemeConfig } from '../utils/themes';

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

  // Exterior cache
  private exteriorCache: Set<number> | null = null;
  private cachedLevelId = -1;

  // Texture
  private texBoard: HTMLImageElement | null = null;
  private texPath: HTMLImageElement | null = null;
  private texturesLoaded = false;
  private currentThemeId = '';

  // Tema fallback renkleri
  private boardColor: string = COLORS.BOARD_LIGHT;
  private pathColor: string = COLORS.PATH;

  // Statik katman cache
  private staticCanvas: HTMLCanvasElement | null = null;
  private staticCtx: CanvasRenderingContext2D | null = null;
  private staticLevelId = -1;
  private staticW = 0;
  private staticH = 0;

  // Parcacik izi
  private trailParticles: TrailParticle[] = [];
  private lastBallPx = -1;
  private lastBallPy = -1;

  // Sarsinti efekti
  private shakeStart = 0;
  private shakeActive = false;
  private shakeIntensity = 1;

  // Carpma efekti
  private impactGx = -1;
  private impactGy = -1;
  private impactTime = 0;
  private impactStrength = 0;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context alinamadi');
    this.ctx = ctx;
  }

  async setTheme(theme: ThemeConfig) {
    if (this.currentThemeId === theme.id && this.texturesLoaded) return;
    this.boardColor = theme.boardColor;
    this.pathColor = theme.pathColor;
    this.currentThemeId = theme.id;
    this.texturesLoaded = false;
    this.texBoard = null;
    this.texPath = null;
    this.staticLevelId = -1;

    try {
      const [board, path] = await Promise.all([
        loadImage(`${BASE}assets/textures/${theme.folder}/board.jpg`),
        loadImage(`${BASE}assets/textures/${theme.folder}/path.jpg`),
      ]);
      this.texBoard = board;
      this.texPath = path;
      this.texturesLoaded = true;
      this.staticLevelId = -1;
    } catch (e) {
      console.warn('Texture yuklenemedi, fallback renkler kullaniliyor:', e);
    }
  }

  resize(width: number, height: number, dpr: number) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.staticLevelId = -1;
  }

  clear() { this.drawBg(this.ctx); }
  invalidateStatic() { this.staticLevelId = -1; }

  triggerShake(intensity = 1) {
    this.shakeStart = performance.now();
    this.shakeActive = true;
    this.shakeIntensity = intensity;
  }

  triggerImpact(gx: number, gy: number, strength = 1) {
    this.impactGx = gx;
    this.impactGy = gy;
    this.impactTime = performance.now();
    this.impactStrength = strength;
  }

  private drawBg(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = COLORS.BACKGROUND;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  calculateLayout(gridWidth: number, gridHeight: number) {
    const maxCellW = (this.width * 0.88) / gridWidth;
    const maxCellH = (this.height * 0.7) / gridHeight;
    this.cellSize = Math.floor(Math.min(maxCellW, maxCellH));
    this.offsetX = Math.floor((this.width - gridWidth * this.cellSize) / 2);
    this.offsetY = Math.floor((this.height - gridHeight * this.cellSize) / 2) + 30 * this.dpr;
  }

  // --- Exterior hesapla ---
  private computeExterior(level: Level): Set<number> {
    if (this.exteriorCache && this.cachedLevelId === level.data.id) return this.exteriorCache;
    const { width: gw, height: gh } = level.data;
    const exterior = new Set<number>();
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        if (level.data.grid[y * gw + x] !== WALL) continue;
        let adj = false;
        for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < gw && ny >= 0 && ny < gh && level.data.grid[ny * gw + nx] === PATH) {
            adj = true; break;
          }
        }
        if (!adj) exterior.add(y * gw + x);
      }
    }
    this.exteriorCache = exterior;
    this.cachedLevelId = level.data.id;
    return exterior;
  }

  // ============================================================
  // BOARD KOSE HESABI: konveks (+r), konkav (-r), kare (0)
  // ============================================================
  private getBoardCorners(
    gx: number, gy: number, gw: number, gh: number, grid: number[],
    exterior: Set<number>, r: number
  ): [number, number, number, number] {
    const ib = (x: number, y: number) =>
      x >= 0 && x < gw && y >= 0 && y < gh && grid[y * gw + x] === WALL && !exterior.has(y * gw + x);
    const ip = (x: number, y: number) =>
      x >= 0 && x < gw && y >= 0 && y < gh && grid[y * gw + x] === PATH;

    const corner = (dx1: number, dy1: number, dx2: number, dy2: number, ddx: number, ddy: number): number => {
      const o1 = ib(gx + dx1, gy + dy1);
      const o2 = ib(gx + dx2, gy + dy2);
      const diag = ip(gx + ddx, gy + ddy);
      // Konkav: her iki ortogonal board + capraz path
      if (o1 && o2 && diag) return -r;
      // Konveks: en az bir ortogonal board degil
      if (!o1 || !o2) return r;
      // Kare: her iki ortogonal board, capraz board (ic alan)
      return 0;
    };

    return [
      corner(-1, 0, 0, -1, -1, -1),
      corner(1, 0, 0, -1, 1, -1),
      corner(1, 0, 0, 1, 1, 1),
      corner(-1, 0, 0, 1, -1, 1),
    ];
  }

  // ============================================================
  // KONVEKS + KONKAV KOSE DESTEKLI DOLGU
  // Pozitif = konveks (dis), negatif = konkav (ic), 0 = kare
  // ============================================================
  private fillSelectiveRound(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    tl: number, tr: number, br: number, bl: number
  ) {
    if (tl === 0 && tr === 0 && br === 0 && bl === 0) {
      ctx.fillRect(x, y, w, h);
      return;
    }
    ctx.beginPath();

    // Sol-ust baslangic
    const atl = Math.abs(tl);
    ctx.moveTo(tl !== 0 ? x + atl : x, y);

    // Ust kenar → Sag-ust
    const atr = Math.abs(tr);
    if (tr > 0) {
      ctx.lineTo(x + w - atr, y);
      ctx.arcTo(x + w, y, x + w, y + atr, atr);
    } else if (tr < 0) {
      ctx.lineTo(x + w - atr, y);
      ctx.arc(x + w, y, atr, Math.PI, Math.PI / 2, true);
    } else {
      ctx.lineTo(x + w, y);
    }

    // Sag kenar → Sag-alt
    const abr = Math.abs(br);
    if (br > 0) {
      ctx.lineTo(x + w, y + h - abr);
      ctx.arcTo(x + w, y + h, x + w - abr, y + h, abr);
    } else if (br < 0) {
      ctx.lineTo(x + w, y + h - abr);
      ctx.arc(x + w, y + h, abr, Math.PI * 1.5, Math.PI, true);
    } else {
      ctx.lineTo(x + w, y + h);
    }

    // Alt kenar → Sol-alt
    const abl = Math.abs(bl);
    if (bl > 0) {
      ctx.lineTo(x + abl, y + h);
      ctx.arcTo(x, y + h, x, y + h - abl, abl);
    } else if (bl < 0) {
      ctx.lineTo(x + abl, y + h);
      ctx.arc(x, y + h, abl, 0, Math.PI * 1.5, true);
    } else {
      ctx.lineTo(x, y + h);
    }

    // Sol kenar → Sol-ust (kapanis)
    if (tl > 0) {
      ctx.lineTo(x, y + atl);
      ctx.arcTo(x, y, x + atl, y, atl);
    } else if (tl < 0) {
      ctx.lineTo(x, y + atl);
      ctx.arc(x, y, atl, Math.PI / 2, 0, true);
    } else {
      ctx.lineTo(x, y);
    }

    ctx.closePath();
    ctx.fill();
  }

  // ============================================================
  // STATIK KATMAN: path (tam dikdortgen) → golgeler → board (yuvarlatilmis)
  // ============================================================
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
    const boardR = Math.max(3, s * 0.48);
    const exterior = this.computeExterior(level);
    const e = 0.5; // Anti-alias overlap

    this.drawBg(sCtx);

    let boardFill: string | CanvasPattern = this.boardColor;
    if (this.texturesLoaded && this.texBoard) {
      const p = sCtx.createPattern(this.texBoard, 'repeat');
      if (p) boardFill = p;
    }
    let pathFill: string | CanvasPattern = this.pathColor;
    if (this.texturesLoaded && this.texPath) {
      const p = sCtx.createPattern(this.texPath, 'repeat');
      if (p) pathFill = p;
    }

    // 1. PATH karolari: TAM DIKDORTGEN (yuvarlama yok!)
    // Path, board'un altinda kalacak - board üstte cizilecek
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        if (grid[y * gw + x] !== PATH) continue;
        const px = this.offsetX + x * s;
        const py = this.offsetY + y * s;
        sCtx.fillStyle = pathFill;
        sCtx.fillRect(px - e, py - e, s + e * 2, s + e * 2);
        sCtx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        sCtx.fillRect(px - e, py - e, s + e * 2, s + e * 2);
      }
    }

    // 2. Golgeler (path uzerinde, board'un altinda)
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        if (grid[y * gw + x] !== PATH) continue;
        const px = this.offsetX + x * s;
        const py = this.offsetY + y * s;
        this.drawShadows(sCtx, px, py, x, y, gw, gh, grid, exterior, s);
      }
    }

    // 3. BOARD karolari: konveks + konkav kose destekli
    // Board, path'in USTUNE cizilir → board'un yuvarlatilmis kenarlari
    // alttaki path'i gosterir (beyaz bosluk yok!)
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        if (grid[y * gw + x] !== WALL || exterior.has(y * gw + x)) continue;
        const px = this.offsetX + x * s;
        const py = this.offsetY + y * s;
        const [tl, tr, br, bl] = this.getBoardCorners(x, y, gw, gh, grid, exterior, boardR);
        sCtx.fillStyle = boardFill;
        this.fillSelectiveRound(sCtx, px - e, py - e, s + e * 2, s + e * 2, tl, tr, br, bl);
        sCtx.fillStyle = 'rgba(200, 220, 240, 0.08)';
        this.fillSelectiveRound(sCtx, px - e, py - e, s + e * 2, s + e * 2, tl, tr, br, bl);
      }
    }

    this.staticLevelId = level.data.id;
  }

  // --- Ic golgeler ---
  private drawShadows(
    ctx: CanvasRenderingContext2D, px: number, py: number,
    gx: number, gy: number, gw: number, gh: number,
    grid: number[], exterior: Set<number>, s: number
  ) {
    const sh = Math.max(3, s * 0.08);
    for (const [dx, dy, side] of [[0,-1,0],[0,1,1],[-1,0,2],[1,0,3]] as [number,number,number][]) {
      const nx = gx + dx, ny = gy + dy;
      const isWall = nx < 0 || nx >= gw || ny < 0 || ny >= gh ||
        (grid[ny * gw + nx] === WALL && !exterior.has(ny * gw + nx));
      if (!isWall) continue;
      let grad: CanvasGradient;
      const a = [0.20, 0.10, 0.16, 0.08][side];
      if (side === 0) {
        grad = ctx.createLinearGradient(px, py, px, py + sh);
        grad.addColorStop(0, `rgba(100,140,180,${a})`); grad.addColorStop(1, 'rgba(100,140,180,0)');
        ctx.fillStyle = grad; ctx.fillRect(px, py, s, sh);
      } else if (side === 1) {
        grad = ctx.createLinearGradient(px, py + s, px, py + s - sh);
        grad.addColorStop(0, `rgba(100,140,180,${a})`); grad.addColorStop(1, 'rgba(100,140,180,0)');
        ctx.fillStyle = grad; ctx.fillRect(px, py + s - sh, s, sh);
      } else if (side === 2) {
        grad = ctx.createLinearGradient(px, py, px + sh, py);
        grad.addColorStop(0, `rgba(100,140,180,${a})`); grad.addColorStop(1, 'rgba(100,140,180,0)');
        ctx.fillStyle = grad; ctx.fillRect(px, py, sh, s);
      } else {
        grad = ctx.createLinearGradient(px + s, py, px + s - sh, py);
        grad.addColorStop(0, `rgba(100,140,180,${a})`); grad.addColorStop(1, 'rgba(100,140,180,0)');
        ctx.fillStyle = grad; ctx.fillRect(px + s - sh, py, sh, s);
      }
    }
  }

  // ============================================================
  // ANA RENDER
  // ============================================================
  render(level: Level, ball: Ball) {
    const ctx = this.ctx;
    const { width: gw, height: gh } = level.data;
    this.calculateLayout(gw, gh);

    if (this.staticLevelId !== level.data.id) this.buildStaticLayer(level);

    // Sarsinti hesapla
    let sx = 0, sy = 0, scaleVal = 1;
    if (this.shakeActive) {
      const duration = 200 + 80 * this.shakeIntensity;
      const elapsed = performance.now() - this.shakeStart;
      if (elapsed > duration) {
        this.shakeActive = false;
      } else {
        const t = elapsed / duration;
        const amp = (4 + 2 * this.shakeIntensity) * (1 - t) * (1 - t);
        sx = Math.sin(t * Math.PI * 8) * amp;
        sy = Math.cos(t * Math.PI * 6) * amp * 0.5;
        if (t < 0.35 && this.shakeIntensity > 0.5) {
          scaleVal = 1.0 + 0.012 * this.shakeIntensity * Math.sin((t / 0.35) * Math.PI);
        }
      }
    }

    ctx.save();
    if (scaleVal !== 1) {
      const cx = this.width / 2, cy = this.height / 2;
      ctx.translate(cx, cy);
      ctx.scale(scaleVal, scaleVal);
      ctx.translate(-cx, -cy);
    }
    ctx.translate(sx, sy);

    // 1. Statik katman
    if (this.staticCanvas) ctx.drawImage(this.staticCanvas, 0, 0);

    // 2. Boyali karolar - TAM DIKDORTGEN, gradient renk
    const now = performance.now();
    const colorIdx = level.data.colorIndex % PAINT_GRADIENTS.length;
    const [gradStart, gradEnd] = PAINT_GRADIENTS[colorIdx];
    const s = this.cellSize;
    const e = 0.5;

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
        const sw = s * eased + e * 2, sh = s * eased + e * 2;

        // Gradient boya rengi: sıraya göre baslangic → bitis
        const progress = level.getPaintProgress(x, y);
        const paintColor = this.lerpColor(gradStart, gradEnd, progress);

        ctx.fillStyle = paintColor;
        ctx.globalAlpha = 0.35 + 0.65 * animT;
        // TAM DIKDORTGEN - hic yuvarlama yok, tüm köşeler dolu
        ctx.fillRect(cx - sw / 2, cy - sh / 2, sw, sh);
        ctx.globalAlpha = 1;

        if (animT < 1) {
          ctx.fillStyle = '#fff';
          ctx.globalAlpha = (1 - animT) * 0.3;
          ctx.fillRect(cx - sw / 2, cy - sh / 2, sw, sh);
          ctx.globalAlpha = 1;
        }
      }
    }

    // 3. Baslangic noktasi isareti
    this.drawStartMarker(ctx, level, now);

    // 4. Hiz kuyrugu
    const trailColor = this.lerpColor(gradStart, gradEnd, 0.5);
    this.drawSpeedTrail(ctx, ball, trailColor);

    // 5. Parcacik izi
    this.updateTrail(ctx, ball, trailColor);

    // 6. Top
    this.drawBall(ball, trailColor);

    // 7. Carpma efekti
    this.drawImpactEffect(ctx, level);

    // 8. Konfeti
    if (this.confettiActive) this.updateConfetti();

    ctx.restore();
  }

  // --- Baslangic noktasi isareti: nabiz atan konsantrik daireler ---
  private drawStartMarker(ctx: CanvasRenderingContext2D, level: Level, now: number) {
    const s = this.cellSize;
    const sx = level.data.startX;
    const sy = level.data.startY;
    const cx = this.offsetX + (sx + 0.5) * s;
    const cy = this.offsetY + (sy + 0.5) * s;

    // Baslangic karesi zaten boyali, isaret her zaman gosterilir
    const pulse = Math.sin(now * 0.003) * 0.5 + 0.5; // 0-1 arasi nabiz
    const r1 = s * 0.15 + pulse * s * 0.05;
    const r2 = s * 0.25 + pulse * s * 0.08;

    // Dis halka
    ctx.beginPath();
    ctx.arc(cx, cy, r2, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.3 + pulse * 0.2})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Ic nokta
    ctx.beginPath();
    ctx.arc(cx, cy, r1, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${0.4 + pulse * 0.3})`;
    ctx.fill();
  }

  // --- Hiz kuyrugu ---
  private drawSpeedTrail(ctx: CanvasRenderingContext2D, ball: Ball, color: string) {
    if (!ball.animating || ball.speed < 0.05) return;

    const s = this.cellSize;
    const bx = this.offsetX + (ball.displayX + 0.5) * s;
    const by = this.offsetY + (ball.displayY + 0.5) * s;
    const r = BALL_RADIUS * (s / 60);
    const dirX = ball.moveDirX, dirY = ball.moveDirY;
    if (dirX === 0 && dirY === 0) return;

    const speed = ball.speed;
    const tailLength = r * 4 + speed * s * 6;
    const tailWidth = r * 1.2;
    const tailX = bx - dirX * tailLength;
    const tailY = by - dirY * tailLength;
    const perpX = -dirY, perpY = dirX;
    const backX = bx - dirX * r * 0.3;
    const backY = by - dirY * r * 0.3;
    const darkColor = this.darkenColorHex(color, 40);

    ctx.save();
    // Dis kuyruk
    ctx.beginPath();
    ctx.moveTo(backX + perpX * tailWidth, backY + perpY * tailWidth);
    ctx.lineTo(backX - perpX * tailWidth, backY - perpY * tailWidth);
    ctx.lineTo(tailX, tailY);
    ctx.closePath();
    const grad = ctx.createLinearGradient(bx, by, tailX, tailY);
    grad.addColorStop(0, this.colorWithAlpha(darkColor, 0.7 * speed));
    grad.addColorStop(0.3, this.colorWithAlpha(darkColor, 0.45 * speed));
    grad.addColorStop(0.7, this.colorWithAlpha(darkColor, 0.15 * speed));
    grad.addColorStop(1, this.colorWithAlpha(darkColor, 0));
    ctx.fillStyle = grad;
    ctx.fill();

    // Ic kuyruk (beyaz cekirdek)
    const innerW = tailWidth * 0.45;
    const innerTX = bx - dirX * tailLength * 0.6;
    const innerTY = by - dirY * tailLength * 0.6;
    ctx.beginPath();
    ctx.moveTo(backX + perpX * innerW, backY + perpY * innerW);
    ctx.lineTo(backX - perpX * innerW, backY - perpY * innerW);
    ctx.lineTo(innerTX, innerTY);
    ctx.closePath();
    const grad2 = ctx.createLinearGradient(bx, by, innerTX, innerTY);
    grad2.addColorStop(0, `rgba(255,255,255,${0.6 * speed})`);
    grad2.addColorStop(0.5, `rgba(255,255,255,${0.2 * speed})`);
    grad2.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad2;
    ctx.fill();
    ctx.restore();
  }

  // --- Parcacik izi ---
  private updateTrail(ctx: CanvasRenderingContext2D, ball: Ball, color: string) {
    const s = this.cellSize;
    const bx = this.offsetX + (ball.displayX + 0.5) * s;
    const by = this.offsetY + (ball.displayY + 0.5) * s;
    const darkColor = this.darkenColorHex(color, 60);

    if (ball.animating && this.lastBallPx >= 0) {
      const dx = bx - this.lastBallPx;
      const dy = by - this.lastBallPy;
      const speed = Math.sqrt(dx * dx + dy * dy);
      if (speed > 0.2) {
        const r = BALL_RADIUS * (s / 60);
        const count = Math.min(8, 3 + Math.floor(speed / 1.5));
        const moveAngle = Math.atan2(dy, dx);
        const reverseAngle = moveAngle + Math.PI;
        for (let i = 0; i < count; i++) {
          const coneSpread = (Math.PI * 2) / 3;
          const angle = reverseAngle + (Math.random() - 0.5) * coneSpread;
          const spawnX = bx + Math.cos(reverseAngle) * r * 0.5 + (Math.random() - 0.5) * r * 0.8;
          const spawnY = by + Math.sin(reverseAngle) * r * 0.5 + (Math.random() - 0.5) * r * 0.8;
          const isDust = Math.random() < 0.4;
          const pSpeed = 0.8 + Math.random() * 2.0;
          this.trailParticles.push({
            x: spawnX, y: spawnY,
            vx: Math.cos(angle) * pSpeed, vy: Math.sin(angle) * pSpeed,
            size: isDust ? 2.5 + Math.random() * 3 : 3.5 + Math.random() * 5,
            life: 1,
            color: isDust ? '#8a7e6e' : darkColor,
          });
        }
      }
    }
    this.lastBallPx = ball.animating ? bx : -1;
    this.lastBallPy = ball.animating ? by : -1;

    let alive = 0;
    for (let i = 0; i < this.trailParticles.length; i++) {
      const p = this.trailParticles[i];
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.92; p.vy *= 0.92;
      p.life -= 0.025;
      if (p.life <= 0) continue;
      ctx.globalAlpha = p.life * p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.3 + p.life * 0.7), 0, Math.PI * 2);
      ctx.fill();
      if (alive !== i) this.trailParticles[alive] = p;
      alive++;
    }
    ctx.globalAlpha = 1;
    this.trailParticles.length = alive;
  }

  // --- Top: squash & stretch ---
  private drawBall(ball: Ball, color: string) {
    const ctx = this.ctx;
    const s = this.cellSize;
    const cx = this.offsetX + (ball.displayX + 0.5) * s;
    const cy = this.offsetY + (ball.displayY + 0.5) * s;
    const r = BALL_RADIUS * (s / 60);

    const speed = ball.speed;
    const isMoving = ball.animating && speed > 0.05;
    let angle = 0;
    if (isMoving) angle = Math.atan2(ball.moveDirY, ball.moveDirX);

    const stretchAmount = Math.min(speed, 1) * 0.65;
    const stretchX = isMoving ? 1.0 + stretchAmount : 1.0;
    const stretchY = isMoving ? 1.0 - stretchAmount * 0.75 : 1.0;

    ctx.save();
    ctx.translate(cx, cy);
    if (isMoving) ctx.rotate(angle);

    // Golge
    ctx.save();
    ctx.scale(stretchX, stretchY);
    ctx.beginPath();
    ctx.arc(2 * this.dpr, 3 * this.dpr, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fill();
    ctx.restore();

    // Ana top
    ctx.save();
    ctx.scale(stretchX, stretchY);
    const gradient = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.3, this.lightenColor(color, 50));
    gradient.addColorStop(1, color);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Parlama
    ctx.beginPath();
    ctx.arc(-r * 0.25, -r * 0.25, r * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.50)';
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  // --- Carpma efekti ---
  private drawImpactEffect(ctx: CanvasRenderingContext2D, level: Level) {
    if (this.impactGx < 0) return;
    const elapsed = performance.now() - this.impactTime;
    if (elapsed > 350) { this.impactGx = -1; return; }

    const t = elapsed / 350;
    const s = this.cellSize;
    const gx = this.impactGx, gy = this.impactGy;
    if (gx < 0 || gx >= level.data.width || gy < 0 || gy >= level.data.height) {
      this.impactGx = -1; return;
    }

    const px = this.offsetX + gx * s;
    const py = this.offsetY + gy * s;
    const cx = px + s / 2, cy = py + s / 2;

    const flashAlpha = Math.pow(1 - t, 3) * 0.4 * this.impactStrength;
    if (flashAlpha > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
      ctx.fillRect(px, py, s, s);
    }

    const ringR = s * 0.2 + t * s * 0.7;
    const ringAlpha = Math.pow(1 - t, 2) * 0.35 * this.impactStrength;
    if (ringAlpha > 0.01) {
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${ringAlpha})`;
      ctx.lineWidth = (1 - t) * 3 + 1;
      ctx.stroke();
    }
  }

  // --- Konfeti ---
  startConfetti(color: string) {
    this.confetti = [];
    this.confettiActive = true;
    const colors = [color, '#e0c870', '#f4c4c4', '#b0e4c4', '#b4d4f0', '#d4b8e4', '#fff'];
    for (let i = 0; i < 60; i++) {
      this.confetti.push({
        x: this.width / 2 + (Math.random() - 0.5) * 200, y: this.height / 2,
        vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 15 - 4,
        size: Math.random() * 7 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360, rotSpeed: (Math.random() - 0.5) * 8, life: 1,
      });
    }
  }
  stopConfetti() { this.confettiActive = false; this.confetti = []; }

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

  // ============================================================
  // YARDIMCI RENKLER
  // ============================================================
  private lightenColor(hex: string, amount: number): string {
    const num = parseInt(hex.slice(1), 16);
    const r = Math.min(255, ((num >> 16) & 0xff) + amount);
    const g = Math.min(255, ((num >> 8) & 0xff) + amount);
    const b = Math.min(255, (num & 0xff) + amount);
    return `rgb(${r},${g},${b})`;
  }

  private colorWithAlpha(hex: string, alpha: number): string {
    const num = parseInt(hex.slice(1), 16);
    const r = (num >> 16) & 0xff;
    const g = (num >> 8) & 0xff;
    const b = num & 0xff;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  private darkenColorHex(hex: string, amount: number): string {
    const num = parseInt(hex.slice(1), 16);
    const r = Math.max(0, ((num >> 16) & 0xff) - amount);
    const g = Math.max(0, ((num >> 8) & 0xff) - amount);
    const b = Math.max(0, (num & 0xff) - amount);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

  // Iki hex renk arasi lineer interpolasyon
  private lerpColor(hex1: string, hex2: string, t: number): string {
    const n1 = parseInt(hex1.slice(1), 16);
    const n2 = parseInt(hex2.slice(1), 16);
    const r1 = (n1 >> 16) & 0xff, g1 = (n1 >> 8) & 0xff, b1 = n1 & 0xff;
    const r2 = (n2 >> 16) & 0xff, g2 = (n2 >> 8) & 0xff, b2 = n2 & 0xff;
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

  private easeOutBack(t: number): number {
    const c1 = 1.70158; const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
}

interface Confetti {
  x: number; y: number; vx: number; vy: number;
  size: number; color: string; rotation: number;
  rotSpeed: number; life: number;
}

interface TrailParticle {
  x: number; y: number; vx: number; vy: number;
  size: number; life: number; color: string;
}
