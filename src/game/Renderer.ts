import { Level } from './Level';
import { Ball } from './Ball';
import {
  WALL, PATH, PAINTED,
  COLORS, PAINT_GRADIENTS,
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

  // Texture
  private texBoard: HTMLImageElement | null = null;
  private texPath: HTMLImageElement | null = null;
  private texturesLoaded = false;
  private currentThemeId = '';

  // Tema fallback renkleri
  private boardColor: string = COLORS.BOARD_LIGHT;
  private pathColor: string = COLORS.PATH;

  // Base katman cache (bg + board + path cukurlari + 3D efektler)
  private baseCanvas: HTMLCanvasElement | null = null;
  private baseCtx: CanvasRenderingContext2D | null = null;
  private baseLevelId = -1;
  private baseW = 0;
  private baseH = 0;

  // Path blob cache: boyama clip icin onceden hesaplanmis path
  private cachedPathBlob: Path2D | null = null;

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
    this.baseLevelId = -1;

    try {
      const [board, path] = await Promise.all([
        loadImage(`${BASE}assets/textures/${theme.folder}/board.jpg`),
        loadImage(`${BASE}assets/textures/${theme.folder}/path.jpg`),
      ]);
      this.texBoard = board;
      this.texPath = path;
      this.texturesLoaded = true;
      this.baseLevelId = -1;
    } catch (e) {
      console.warn('Texture yuklenemedi, fallback renkler kullaniliyor:', e);
    }
  }

  resize(width: number, height: number, dpr: number) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.baseLevelId = -1;
  }

  clear() { this.drawBg(this.ctx); }
  invalidateStatic() { this.baseLevelId = -1; }

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

  // --- Hucrenin WALL olup olmadigini kontrol et ---
  private isWall(grid: number[], gw: number, gh: number, x: number, y: number): boolean {
    if (x < 0 || x >= gw || y < 0 || y >= gh) return false;
    return grid[y * gw + x] === WALL;
  }

  // --- PATH mi kontrol et ---
  private isPath(grid: number[], gw: number, gh: number, x: number, y: number): boolean {
    if (x < 0 || x >= gw || y < 0 || y >= gh) return false;
    return grid[y * gw + x] !== WALL;
  }

  // ============================================================
  // BASE KATMAN: background + board(3D) + path cukurlari
  // ============================================================
  private buildBaseLayer(level: Level) {
    if (!this.baseCanvas || this.baseW !== this.width || this.baseH !== this.height) {
      this.baseCanvas = document.createElement('canvas');
      this.baseCanvas.width = this.width;
      this.baseCanvas.height = this.height;
      this.baseCtx = this.baseCanvas.getContext('2d')!;
      this.baseW = this.width;
      this.baseH = this.height;
    }

    const ctx = this.baseCtx!;
    const { width: gw, height: gh, grid } = level.data;
    const s = this.cellSize;
    const ox = this.offsetX;
    const oy = this.offsetY;
    const r = Math.max(4, s * 0.28); // Kose yaricapi

    // 1. Arka plan
    this.drawBg(ctx);

    // 2. Board golge (alttan, 3D derinlik hissi)
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = s * 0.3;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = s * 0.12;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    this.fillBoardShape(ctx, grid, gw, gh, s, ox, oy, r);
    ctx.restore();

    // 3. Board ana yuzeyi (texture veya duz renk)
    ctx.save();
    let boardFill: string | CanvasPattern = this.boardColor;
    if (this.texturesLoaded && this.texBoard) {
      const p = ctx.createPattern(this.texBoard, 'repeat');
      if (p) boardFill = p;
    }
    ctx.fillStyle = boardFill;
    this.fillBoardShape(ctx, grid, gw, gh, s, ox, oy, r);
    ctx.restore();

    // 4. Board ust yuzey highlight (ustten isik)
    ctx.save();
    const hlGrad = ctx.createLinearGradient(ox, oy, ox, oy + gh * s);
    hlGrad.addColorStop(0, 'rgba(255,255,255,0.18)');
    hlGrad.addColorStop(0.4, 'rgba(255,255,255,0.05)');
    hlGrad.addColorStop(1, 'rgba(0,0,0,0.08)');
    ctx.fillStyle = hlGrad;
    this.fillBoardShape(ctx, grid, gw, gh, s, ox, oy, r);
    ctx.restore();

    // 5. PATH cukurlari — path blob ile organik sekil
    // Path blob'u once hesapla ve cache'le (render'da boyama clip olarak kullanilir)
    this.cachedPathBlob = this.createPathBlobPath(grid, gw, gh, s, ox, oy, r);
    this.drawPathChannels(ctx, grid, gw, gh, s, ox, oy);

    // 6. Board kenar vurgusu (kenar cizgisi)
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5;
    this.strokeBoardShape(ctx, grid, gw, gh, s, ox, oy, r);
    ctx.restore();

    this.baseLevelId = level.data.id;
  }

  // Hucre blogu icin Path2D olustur: hedef tip (WALL veya PATH)
  // Konveks koseler (dis acilara): arc ile yuvarlat
  // Konkav koseler (ic koseler): kare birak — karsit blok zaten dolduruyor
  private createCellGroupPath(
    grid: number[], gw: number, gh: number,
    s: number, ox: number, oy: number, r: number,
    targetType: number  // WALL veya PATH/PAINTED
  ): Path2D {
    const path = new Path2D();
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const cell = grid[y * gw + x];
        // PATH icin: PATH veya PAINTED hucreleri dahil et
        const isTarget = targetType === WALL
          ? cell === WALL
          : cell !== WALL;
        if (!isTarget) continue;

        const px = ox + x * s;
        const py = oy + y * s;

        // Komsu aynı grupta mi?
        const sameGroup = (nx: number, ny: number) => {
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) return false;
          const c = grid[ny * gw + nx];
          return targetType === WALL ? c === WALL : c !== WALL;
        };

        const top    = sameGroup(x, y - 1);
        const bottom = sameGroup(x, y + 1);
        const left   = sameGroup(x - 1, y);
        const right  = sameGroup(x + 1, y);

        // Konveks kose: her iki komsu da farkli grupta → dis kose → yuvarlat
        const tlR = (!top && !left) ? r : 0;
        const trR = (!top && !right) ? r : 0;
        const brR = (!bottom && !right) ? r : 0;
        const blR = (!bottom && !left) ? r : 0;

        path.moveTo(px + tlR, py);
        path.lineTo(px + s - trR, py);
        if (trR > 0) path.arc(px + s - trR, py + trR, trR, -Math.PI / 2, 0);
        else path.lineTo(px + s, py);
        path.lineTo(px + s, py + s - brR);
        if (brR > 0) path.arc(px + s - brR, py + s - brR, brR, 0, Math.PI / 2);
        else path.lineTo(px + s, py + s);
        path.lineTo(px + blR, py + s);
        if (blR > 0) path.arc(px + blR, py + s - blR, blR, Math.PI / 2, Math.PI);
        else path.lineTo(px, py + s);
        path.lineTo(px, py + tlR);
        if (tlR > 0) path.arc(px + tlR, py + tlR, tlR, Math.PI, -Math.PI / 2);
        else path.lineTo(px, py);
        path.closePath();
      }
    }
    return path;
  }

  // Board clip path (WALL hucreleri)
  private createBoardClipPath(
    grid: number[], gw: number, gh: number,
    s: number, ox: number, oy: number, r: number
  ): Path2D {
    return this.createCellGroupPath(grid, gw, gh, s, ox, oy, r, WALL);
  }

  // Path blob path (PATH/PAINTED hucreleri)
  private createPathBlobPath(
    grid: number[], gw: number, gh: number,
    s: number, ox: number, oy: number, r: number
  ): Path2D {
    return this.createCellGroupPath(grid, gw, gh, s, ox, oy, r, PATH);
  }

  // Board seklini doldur: konveks koseli clip path ile tek fill
  private fillBoardShape(
    ctx: CanvasRenderingContext2D,
    grid: number[], gw: number, gh: number,
    s: number, ox: number, oy: number, r: number
  ) {
    const path = this.createBoardClipPath(grid, gw, gh, s, ox, oy, r);
    ctx.fill(path, 'nonzero');
  }

  // Board seklini stroke (kenar cizgisi) - clip path ile
  private strokeBoardShape(
    ctx: CanvasRenderingContext2D,
    grid: number[], gw: number, gh: number,
    s: number, ox: number, oy: number, r: number
  ) {
    const path = this.createBoardClipPath(grid, gw, gh, s, ox, oy, r);
    ctx.stroke(path);
  }

  // PATH kanallarini ciz: path blob kullanarak organik sekil, ic golge ile derinlik
  private drawPathChannels(
    ctx: CanvasRenderingContext2D,
    grid: number[], gw: number, gh: number,
    s: number, ox: number, oy: number
  ) {
    const r = Math.max(4, s * 0.28);
    const pathBlob = this.createPathBlobPath(grid, gw, gh, s, ox, oy, r);

    // 1. Path blobu koyu golge (cukur hissi)
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill(pathBlob, 'nonzero');

    // 2. Path zemin rengi (texture veya duz)
    let pathFill: string | CanvasPattern = this.pathColor;
    if (this.texturesLoaded && this.texPath) {
      const p = ctx.createPattern(this.texPath, 'repeat');
      if (p) pathFill = p;
    }
    ctx.fillStyle = pathFill;
    ctx.fill(pathBlob, 'nonzero');

    // 3. Path blob clip icinde ic golgeler
    ctx.save();
    ctx.clip(pathBlob, 'nonzero');
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        if (grid[y * gw + x] === WALL) continue;
        const px = ox + x * s;
        const py = oy + y * s;
        this.drawInnerShadows(ctx, px, py, s, x, y, gw, gh, grid);
      }
    }
    ctx.restore();
  }

  // Path hucresinin ic golgeleri (board kenarlarindan gelen derinlik golgeleri)
  private drawInnerShadows(
    ctx: CanvasRenderingContext2D,
    px: number, py: number, s: number,
    gx: number, gy: number, gw: number, gh: number,
    grid: number[]
  ) {
    const shadowDepth = Math.max(4, s * 0.15);

    // Ust kenar golge (eger ustte WALL varsa)
    if (this.isWall(grid, gw, gh, gx, gy - 1)) {
      const grad = ctx.createLinearGradient(px, py, px, py + shadowDepth);
      grad.addColorStop(0, 'rgba(0,0,0,0.3)');
      grad.addColorStop(0.5, 'rgba(0,0,0,0.1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(px, py, s, shadowDepth);
    }

    // Sol kenar golge
    if (this.isWall(grid, gw, gh, gx - 1, gy)) {
      const grad = ctx.createLinearGradient(px, py, px + shadowDepth, py);
      grad.addColorStop(0, 'rgba(0,0,0,0.22)');
      grad.addColorStop(0.5, 'rgba(0,0,0,0.07)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(px, py, shadowDepth, s);
    }

    // Alt kenar aydinlik (isik altan geliyormuscasina)
    if (this.isWall(grid, gw, gh, gx, gy + 1)) {
      const grad = ctx.createLinearGradient(px, py + s, px, py + s - shadowDepth * 0.6);
      grad.addColorStop(0, 'rgba(0,0,0,0.08)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(px, py + s - shadowDepth * 0.6, s, shadowDepth * 0.6);
    }

    // Sag kenar hafif golge
    if (this.isWall(grid, gw, gh, gx + 1, gy)) {
      const grad = ctx.createLinearGradient(px + s, py, px + s - shadowDepth * 0.5, py);
      grad.addColorStop(0, 'rgba(0,0,0,0.06)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(px + s - shadowDepth * 0.5, py, shadowDepth * 0.5, s);
    }
  }


  // ============================================================
  // ANA RENDER
  // Sira: base (bg+board+path) → boya → top/efekt
  // ============================================================
  render(level: Level, ball: Ball) {
    const ctx = this.ctx;
    const { width: gw, height: gh } = level.data;
    this.calculateLayout(gw, gh);

    if (this.baseLevelId !== level.data.id) this.buildBaseLayer(level);

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

    // 1. Base katman (bg + board + path cukurlari + 3D)
    if (this.baseCanvas) ctx.drawImage(this.baseCanvas, 0, 0);

    // 2. Boyali karolar — her hucre tam boyutunda, sadece PAINTED komsuya gore yuvarlak kose
    const now = performance.now();
    const colorIdx = level.data.colorIndex % PAINT_GRADIENTS.length;
    const [gradStart, gradEnd] = PAINT_GRADIENTS[colorIdx];
    const s = this.cellSize;
    const r = Math.max(4, s * 0.28);
    const ox = this.offsetX, oy = this.offsetY;

    // Sadece PAINTED komşu mu? (PATH komşusu kose yuvarlamasını etkilemez)
    const isPainted = (grid: number[], nx: number, ny: number) => {
      if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) return false;
      return grid[ny * gw + nx] === PAINTED;
    };

    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        if (level.grid[y * gw + x] !== PAINTED) continue;

        const animKey = `${x},${y}`;
        const animStart = level.paintAnimations.get(animKey);
        const animT = animStart ? Math.min((now - animStart) / PAINT_ANIM_DURATION, 1) : 1;
        const progress = level.getPaintProgress(x, y);
        const paintColor = this.lerpColor(gradStart, gradEnd, progress);

        // Komsu PAINTED mi? Degil ise kose yuvarlak
        const top    = isPainted(level.grid, x, y - 1);
        const bottom = isPainted(level.grid, x, y + 1);
        const left   = isPainted(level.grid, x - 1, y);
        const right  = isPainted(level.grid, x + 1, y);

        // Hucre tam boyutunda (animT ne olursa olsun), sadece opaklık değişir
        const px = ox + x * s;
        const py = oy + y * s;
        const sz = s;

        const tlR = (!top && !left) ? r : 0;
        const trR = (!top && !right) ? r : 0;
        const brR = (!bottom && !right) ? r : 0;
        const blR = (!bottom && !left) ? r : 0;

        const cell = new Path2D();
        cell.moveTo(px + tlR, py);
        cell.lineTo(px + sz - trR, py);
        if (trR > 0) cell.arc(px + sz - trR, py + trR, trR, -Math.PI / 2, 0);
        else cell.lineTo(px + sz, py);
        cell.lineTo(px + sz, py + sz - brR);
        if (brR > 0) cell.arc(px + sz - brR, py + sz - brR, brR, 0, Math.PI / 2);
        else cell.lineTo(px + sz, py + sz);
        cell.lineTo(px + blR, py + sz);
        if (blR > 0) cell.arc(px + blR, py + sz - blR, blR, Math.PI / 2, Math.PI);
        else cell.lineTo(px, py + sz);
        cell.lineTo(px, py + tlR);
        if (tlR > 0) cell.arc(px + tlR, py + tlR, tlR, Math.PI, -Math.PI / 2);
        else cell.lineTo(px, py);
        cell.closePath();

        // Opaklik animasyonu: 0'dan 1'e (scale yerine fade-in)
        ctx.fillStyle = paintColor;
        ctx.globalAlpha = (0.35 + 0.65 * animT);
        ctx.fill(cell);

        if (animT < 1) {
          ctx.fillStyle = '#fff';
          ctx.globalAlpha = (1 - animT) * 0.25;
          ctx.fill(cell);
        }
        ctx.globalAlpha = 1;
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

  // ============================================================
  // ÇOKLU OYUNCU RENDER
  // tileColors: "y_x" → colorIndex (sahiplik haritası)
  // ============================================================
  renderMultiplayer(
    level: Level,
    myBall: Ball,
    myColorIndex: number,
    remotePlayers: { ball: Ball; colorIndex: number; name: string }[],
    tileColors: Map<string, number>
  ) {
    const ctx = this.ctx;
    const { width: gw, height: gh } = level.data;
    this.calculateLayout(gw, gh);

    if (this.baseLevelId !== level.data.id) this.buildBaseLayer(level);

    // Sarsıntı hesapla (aynı mantık)
    let sx = 0, sy = 0, scaleVal = 1;
    if (this.shakeActive) {
      const duration = 200 + 80 * this.shakeIntensity;
      const elapsed  = performance.now() - this.shakeStart;
      if (elapsed > duration) {
        this.shakeActive = false;
      } else {
        const t   = elapsed / duration;
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

    // 1. Base katman
    if (this.baseCanvas) ctx.drawImage(this.baseCanvas, 0, 0);

    // 2. Boyalı karolar — her hücre komşularına göre yuvarlak köşeli çizilir
    const now = performance.now();
    const s   = this.cellSize;
    const r   = Math.max(4, s * 0.28);
    const ox  = this.offsetX, oy = this.offsetY;

    const isPainted = (g: number[], nx: number, ny: number) => {
      if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) return false;
      return g[ny * gw + nx] === PAINTED;
    };

    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        if (level.grid[y * gw + x] !== PAINTED) continue;

        const animKey  = `${x},${y}`;
        const animStart = level.paintAnimations.get(animKey);
        const animT    = animStart ? Math.min((now - animStart) / PAINT_ANIM_DURATION, 1) : 1;

        // Sahip karonun rengi
        const tileKey  = `${y}_${x}`;
        const colorIdx = (tileColors.get(tileKey) ?? myColorIndex) % PAINT_GRADIENTS.length;
        const [gradStart, gradEnd] = PAINT_GRADIENTS[colorIdx];
        const progress   = level.getPaintProgress(x, y);
        const paintColor = this.lerpColor(gradStart, gradEnd, progress);

        const top    = isPainted(level.grid, x, y - 1);
        const bottom = isPainted(level.grid, x, y + 1);
        const left   = isPainted(level.grid, x - 1, y);
        const right  = isPainted(level.grid, x + 1, y);

        const px = ox + x * s;
        const py = oy + y * s;
        const sz = s;

        const tlR = (!top && !left) ? r : 0;
        const trR = (!top && !right) ? r : 0;
        const brR = (!bottom && !right) ? r : 0;
        const blR = (!bottom && !left) ? r : 0;

        const cell = new Path2D();
        cell.moveTo(px + tlR, py);
        cell.lineTo(px + sz - trR, py);
        if (trR > 0) cell.arc(px + sz - trR, py + trR, trR, -Math.PI / 2, 0);
        else cell.lineTo(px + sz, py);
        cell.lineTo(px + sz, py + sz - brR);
        if (brR > 0) cell.arc(px + sz - brR, py + sz - brR, brR, 0, Math.PI / 2);
        else cell.lineTo(px + sz, py + sz);
        cell.lineTo(px + blR, py + sz);
        if (blR > 0) cell.arc(px + blR, py + sz - blR, blR, Math.PI / 2, Math.PI);
        else cell.lineTo(px, py + sz);
        cell.lineTo(px, py + tlR);
        if (tlR > 0) cell.arc(px + tlR, py + tlR, tlR, Math.PI, -Math.PI / 2);
        else cell.lineTo(px, py);
        cell.closePath();

        ctx.fillStyle  = paintColor;
        ctx.globalAlpha = 0.35 + 0.65 * animT;
        ctx.fill(cell);

        if (animT < 1) {
          ctx.fillStyle   = '#fff';
          ctx.globalAlpha = (1 - animT) * 0.25;
          ctx.fill(cell);
        }
        ctx.globalAlpha = 1;
      }
    }

    // 3. Uzak oyuncu topları (arkada)
    for (const rp of remotePlayers) {
      const [gs, ge] = PAINT_GRADIENTS[rp.colorIndex % PAINT_GRADIENTS.length];
      const trailColor = this.lerpColor(gs, ge, 0.5);
      this.drawSpeedTrail(ctx, rp.ball, trailColor);
      this.drawBall(rp.ball, trailColor);

      // İsim etiketi
      if (!rp.ball.animating) {
        const bx = this.offsetX + (rp.ball.displayX + 0.5) * s;
        const by = this.offsetY + (rp.ball.displayY + 0.5) * s;
        ctx.save();
        ctx.font      = `bold ${Math.max(10, s * 0.22)}px sans-serif`;
        ctx.fillStyle = trailColor;
        ctx.textAlign = 'center';
        ctx.fillText(rp.name.slice(0, 6), bx, by - s * 0.6);
        ctx.restore();
      }
    }

    // 4. Kendi topum (en üstte)
    const [mgs, mge] = PAINT_GRADIENTS[myColorIndex % PAINT_GRADIENTS.length];
    const myTrailColor = this.lerpColor(mgs, mge, 0.5);
    this.drawSpeedTrail(ctx, myBall, myTrailColor);
    this.updateTrail(ctx, myBall, myTrailColor);
    this.drawBall(myBall, myTrailColor);

    ctx.restore();
  }

  // --- Baslangic noktasi isareti: nabiz atan konsantrik daireler ---
  private drawStartMarker(ctx: CanvasRenderingContext2D, level: Level, now: number) {
    const s = this.cellSize;
    const sx = level.data.startX;
    const sy = level.data.startY;
    const cx = this.offsetX + (sx + 0.5) * s;
    const cy = this.offsetY + (sy + 0.5) * s;

    const pulse = Math.sin(now * 0.003) * 0.5 + 0.5;
    const r1 = s * 0.15 + pulse * s * 0.05;
    const r2 = s * 0.25 + pulse * s * 0.08;

    ctx.beginPath();
    ctx.arc(cx, cy, r2, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.3 + pulse * 0.2})`;
    ctx.lineWidth = 2;
    ctx.stroke();

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
  drawBall(ball: Ball, color: string) {
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

    ctx.save();
    ctx.scale(stretchX, stretchY);
    ctx.beginPath();
    ctx.arc(2 * this.dpr, 3 * this.dpr, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fill();
    ctx.restore();

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
