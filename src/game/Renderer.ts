import { Level } from './Level';
import { Ball } from './Ball';
import {
  WALL, PATH, PAINTED,
  COLORS, LEVEL_COLORS,
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

  clear() {
    this.drawBg(this.ctx);
  }

  invalidateStatic() {
    this.staticLevelId = -1;
  }

  triggerShake() {
    this.shakeStart = performance.now();
    this.shakeActive = true;
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

  // --- Exterior ---
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

  // --- Secici kose yuvarlama: path karolari ---
  private getPathCorners(
    gx: number, gy: number, gw: number, gh: number, grid: number[], r: number
  ): [number, number, number, number] {
    const ip = (x: number, y: number) =>
      x >= 0 && x < gw && y >= 0 && y < gh && grid[y * gw + x] === PATH;
    return [
      (!ip(gx - 1, gy) && !ip(gx, gy - 1)) ? r : 0,
      (!ip(gx + 1, gy) && !ip(gx, gy - 1)) ? r : 0,
      (!ip(gx + 1, gy) && !ip(gx, gy + 1)) ? r : 0,
      (!ip(gx - 1, gy) && !ip(gx, gy + 1)) ? r : 0,
    ];
  }

  // --- Boyali karo kose yuvarlama ---
  // Sadece HER IKI ortogonal komsu da duvarsa (dis kose) → boardR ile yuvarla
  // Diger tum durumlarda → 0 (kose yok, duz kenar)
  private getPaintedCorners(
    gx: number, gy: number, gw: number, gh: number, grid: number[], boardR: number
  ): [number, number, number, number] {
    const isPath = (x: number, y: number) =>
      x >= 0 && x < gw && y >= 0 && y < gh && grid[y * gw + x] === PATH;

    return [
      (!isPath(gx - 1, gy) && !isPath(gx, gy - 1)) ? boardR : 0,
      (!isPath(gx + 1, gy) && !isPath(gx, gy - 1)) ? boardR : 0,
      (!isPath(gx + 1, gy) && !isPath(gx, gy + 1)) ? boardR : 0,
      (!isPath(gx - 1, gy) && !isPath(gx, gy + 1)) ? boardR : 0,
    ];
  }

  // --- Secici kose yuvarlama: board karolari ---
  private getBoardCorners(
    gx: number, gy: number, gw: number, gh: number, grid: number[],
    exterior: Set<number>, r: number
  ): [number, number, number, number] {
    const ib = (x: number, y: number) =>
      x >= 0 && x < gw && y >= 0 && y < gh && grid[y * gw + x] === WALL && !exterior.has(y * gw + x);
    const ip = (x: number, y: number) =>
      x >= 0 && x < gw && y >= 0 && y < gh && grid[y * gw + x] === PATH;
    return [
      (!ib(gx - 1, gy) && !ib(gx, gy - 1) && !ip(gx - 1, gy - 1)) ? r : 0,
      (!ib(gx + 1, gy) && !ib(gx, gy - 1) && !ip(gx + 1, gy - 1)) ? r : 0,
      (!ib(gx + 1, gy) && !ib(gx, gy + 1) && !ip(gx + 1, gy + 1)) ? r : 0,
      (!ib(gx - 1, gy) && !ib(gx, gy + 1) && !ip(gx - 1, gy + 1)) ? r : 0,
    ];
  }

  // --- Secici yuvarlak dikdortgen ---
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
    ctx.moveTo(x + tl, y);
    if (tr > 0) { ctx.lineTo(x + w - tr, y); ctx.arcTo(x + w, y, x + w, y + tr, tr); }
    else ctx.lineTo(x + w, y);
    if (br > 0) { ctx.lineTo(x + w, y + h - br); ctx.arcTo(x + w, y + h, x + w - br, y + h, br); }
    else ctx.lineTo(x + w, y + h);
    if (bl > 0) { ctx.lineTo(x + bl, y + h); ctx.arcTo(x, y + h, x, y + h - bl, bl); }
    else ctx.lineTo(x, y + h);
    if (tl > 0) { ctx.lineTo(x, y + tl); ctx.arcTo(x, y, x + tl, y, tl); }
    else ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();
  }

  // --- Statik katman olustur ---
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
    // Board koseleri daha dairesel (0.28 → 0.48)
    const boardR = Math.max(3, s * 0.48);
    const pathR = Math.max(3, s * 0.48);
    const exterior = this.computeExterior(level);
    const e = 0.25;

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

    // Board karolari
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

    // Ic kose dolgulari: board-path bulusma noktalarinda ceyrek daire
    // 2x2 blok tara: 3 board + 1 path olan koseye board renginde ceyrek daire ciz
    this.drawInnerCornerFills(sCtx, gw, gh, grid, exterior, s, boardR, boardFill);

    // Path karolari
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        if (grid[y * gw + x] !== PATH) continue;
        const px = this.offsetX + x * s;
        const py = this.offsetY + y * s;
        const [tl, tr, br, bl] = this.getPathCorners(x, y, gw, gh, grid, pathR);
        sCtx.fillStyle = pathFill;
        this.fillSelectiveRound(sCtx, px - e, py - e, s + e * 2, s + e * 2, tl, tr, br, bl);
        sCtx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        this.fillSelectiveRound(sCtx, px - e, py - e, s + e * 2, s + e * 2, tl, tr, br, bl);
        this.drawShadows(sCtx, px, py, x, y, gw, gh, grid, exterior, s);
      }
    }

    this.staticLevelId = level.data.id;
  }

  // --- Ic kose dolgulari: board karolarin ic koselerinde ceyrek daire ---
  // PATH karo ile board karo bulusma noktalarinda olusan boslugu doldurur
  private drawInnerCornerFills(
    ctx: CanvasRenderingContext2D,
    gw: number, gh: number, grid: number[],
    exterior: Set<number>, s: number, r: number,
    boardFill: string | CanvasPattern
  ) {
    // Her board karo icin: path'e bakan ic koseleri bul
    // Bir kose "ic kose" = o kosedeki capraz komsu PATH ama iki ortogonal komsu BOARD
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        if (grid[y * gw + x] !== WALL || exterior.has(y * gw + x)) continue;

        const px = this.offsetX + x * s;
        const py = this.offsetY + y * s;

        // Her 4 kose icin kontrol et
        // Sol-ust kose: sol komsu board, ust komsu board, sol-ust capraz path
        const checks: [number, number, number, number, number, number, number, number][] = [
          // [dx1,dy1 (ortogonal1), dx2,dy2 (ortogonal2), cornerX, cornerY, startAngle offset]
          // Sol-ust: sol(-1,0) ve ust(0,-1) board, capraz(-1,-1) path → kose (px, py)
          [-1, 0, 0, -1, -1, -1, 0, 0],
          // Sag-ust: sag(1,0) ve ust(0,-1) board, capraz(1,-1) path → kose (px+s, py)
          [1, 0, 0, -1, 1, -1, 1, 0],
          // Sag-alt: sag(1,0) ve alt(0,1) board, capraz(1,1) path → kose (px+s, py+s)
          [1, 0, 0, 1, 1, 1, 1, 1],
          // Sol-alt: sol(-1,0) ve alt(0,1) board, capraz(-1,1) path → kose (px, py+s)
          [-1, 0, 0, 1, -1, 1, 0, 1],
        ];

        for (const [dx1, dy1, dx2, dy2, diagX, diagY, cxOff, cyOff] of checks) {
          const nx1 = x + dx1, ny1 = y + dy1;
          const nx2 = x + dx2, ny2 = y + dy2;
          const ndx = x + diagX, ndy = y + diagY;

          // Ortogonal komsular board olmali (veya sinir disi)
          const isBoard1 = nx1 < 0 || nx1 >= gw || ny1 < 0 || ny1 >= gh ||
            (grid[ny1 * gw + nx1] === WALL && !exterior.has(ny1 * gw + nx1));
          const isBoard2 = nx2 < 0 || nx2 >= gw || ny2 < 0 || ny2 >= gh ||
            (grid[ny2 * gw + nx2] === WALL && !exterior.has(ny2 * gw + nx2));

          // Capraz komsu path olmali
          const isDiagPath = ndx >= 0 && ndx < gw && ndy >= 0 && ndy < gh &&
            grid[ndy * gw + ndx] === PATH;

          if (isBoard1 && isBoard2 && isDiagPath) {
            // Bu ic kosede ceyrek daire ciz
            const cornerX = px + cxOff * s;
            const cornerY = py + cyOff * s;

            // Hangi yone dogru ceyrek daire cizecegimizi belirle
            // Arc merkezi kose noktasinda, path'e dogru yay
            let startAngle = 0;
            if (cxOff === 0 && cyOff === 0) startAngle = 0;         // sol-ust → sag-alt yay
            else if (cxOff === 1 && cyOff === 0) startAngle = Math.PI / 2;  // sag-ust → sol-alt yay
            else if (cxOff === 1 && cyOff === 1) startAngle = Math.PI;      // sag-alt → sol-ust yay
            else startAngle = Math.PI * 1.5;                                  // sol-alt → sag-ust yay

            ctx.fillStyle = boardFill;
            ctx.beginPath();
            ctx.moveTo(cornerX, cornerY);
            ctx.arc(cornerX, cornerY, r, startAngle, startAngle + Math.PI / 2);
            ctx.closePath();
            ctx.fill();

            // Ayni highlight overlay
            ctx.fillStyle = 'rgba(200, 220, 240, 0.08)';
            ctx.beginPath();
            ctx.moveTo(cornerX, cornerY);
            ctx.arc(cornerX, cornerY, r, startAngle, startAngle + Math.PI / 2);
            ctx.closePath();
            ctx.fill();
          }
        }
      }
    }
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

  // --- Ana render ---
  render(level: Level, ball: Ball) {
    const ctx = this.ctx;
    const { width: gw, height: gh } = level.data;
    this.calculateLayout(gw, gh);

    if (this.staticLevelId !== level.data.id) this.buildStaticLayer(level);

    // Gelismis sarsinti hesapla
    let sx = 0, sy = 0;
    let scaleVal = 1;
    if (this.shakeActive) {
      const elapsed = performance.now() - this.shakeStart;
      if (elapsed > 280) {
        this.shakeActive = false;
      } else {
        const t = elapsed / 280;
        const amp = 6 * (1 - t) * (1 - t);
        sx = Math.sin(t * Math.PI * 8) * amp;
        sy = Math.cos(t * Math.PI * 6) * amp * 0.5;
        if (t < 0.35) {
          scaleVal = 1.0 + 0.012 * Math.sin((t / 0.35) * Math.PI);
        }
      }
    }

    ctx.save();

    if (scaleVal !== 1) {
      const cx = this.width / 2;
      const cy = this.height / 2;
      ctx.translate(cx, cy);
      ctx.scale(scaleVal, scaleVal);
      ctx.translate(-cx, -cy);
    }

    ctx.translate(sx, sy);

    // 1. Statik katman
    if (this.staticCanvas) ctx.drawImage(this.staticCanvas, 0, 0);

    // 2. Boyali karolar - karolarin arasinda bosluk yok
    const now = performance.now();
    const colorIdx = level.data.colorIndex % LEVEL_COLORS.length;
    const paintColor = LEVEL_COLORS[colorIdx];
    const s = this.cellSize;
    const boardR = Math.max(3, s * 0.48);
    const e = 0.5; // Anti-alias overlap - boyali karolar icin biraz daha buyuk

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

        // Sadece dis koseler yuvarlatilir (her iki komsu da duvarsa)
        const [tl, tr, br, bl] = this.getPaintedCorners(
          x, y, gw, gh, level.data.grid, boardR * eased
        );

        ctx.fillStyle = paintColor;
        ctx.globalAlpha = 0.35 + 0.65 * animT;
        this.fillSelectiveRound(ctx, cx - sw / 2, cy - sh / 2, sw, sh, tl, tr, br, bl);
        ctx.globalAlpha = 1;

        if (animT < 1) {
          ctx.fillStyle = '#fff';
          ctx.globalAlpha = (1 - animT) * 0.3;
          this.fillSelectiveRound(ctx, cx - sw / 2, cy - sh / 2, sw, sh, tl, tr, br, bl);
          ctx.globalAlpha = 1;
        }
      }
    }

    // 3. Hiz kuyrugu (speed trail) - topun arkasinda uzun gradient
    this.drawSpeedTrail(ctx, ball, paintColor);

    // 4. Parcacik izi
    this.updateTrail(ctx, ball, paintColor);

    // 5. Top (deforme olarak)
    this.drawBall(ball, paintColor);

    // 6. Konfeti
    if (this.confettiActive) this.updateConfetti();

    ctx.restore();
  }

  // --- Hiz kuyrugu: topun arkasinda uzanan gradient ucgen ---
  private drawSpeedTrail(ctx: CanvasRenderingContext2D, ball: Ball, color: string) {
    if (!ball.animating || ball.speed < 0.05) return;

    const s = this.cellSize;
    const bx = this.offsetX + (ball.displayX + 0.5) * s;
    const by = this.offsetY + (ball.displayY + 0.5) * s;
    const r = BALL_RADIUS * (s / 60);

    const dirX = ball.moveDirX;
    const dirY = ball.moveDirY;
    if (dirX === 0 && dirY === 0) return;

    const speed = ball.speed;
    // Kuyruk uzunlugu: hiza orantili, belirgin uzun
    const tailLength = r * 4 + speed * s * 6;
    // Kuyruk kalınligi: topun yaricapi kadar baslayip sifira daralir
    const tailWidth = r * 1.2;

    // Topun arka tarafi (hareketin tersi)
    const tailX = bx - dirX * tailLength;
    const tailY = by - dirY * tailLength;

    // Hareket yonune dik vektor
    const perpX = -dirY;
    const perpY = dirX;

    // Topun arka kenar noktasi
    const backX = bx - dirX * r * 0.3;
    const backY = by - dirY * r * 0.3;

    // Koyu renk versiyonu olustur (daha gorunur)
    const darkColor = this.darkenColorHex(color, 40);

    // Dış kuyruk (koyu, geniş)
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

    // İç kuyruk (beyaz çekirdek, parlak)
    ctx.beginPath();
    const innerWidth = tailWidth * 0.45;
    const innerLength = tailLength * 0.6;
    const innerTailX = bx - dirX * innerLength;
    const innerTailY = by - dirY * innerLength;
    ctx.moveTo(backX + perpX * innerWidth, backY + perpY * innerWidth);
    ctx.lineTo(backX - perpX * innerWidth, backY - perpY * innerWidth);
    ctx.lineTo(innerTailX, innerTailY);
    ctx.closePath();

    const grad2 = ctx.createLinearGradient(bx, by, innerTailX, innerTailY);
    grad2.addColorStop(0, `rgba(255,255,255,${0.6 * speed})`);
    grad2.addColorStop(0.5, `rgba(255,255,255,${0.2 * speed})`);
    grad2.addColorStop(1, `rgba(255,255,255,0)`);
    ctx.fillStyle = grad2;
    ctx.fill();

    ctx.restore();
  }

  // --- Parcacik izi ---
  private updateTrail(ctx: CanvasRenderingContext2D, ball: Ball, color: string) {
    const s = this.cellSize;
    const bx = this.offsetX + (ball.displayX + 0.5) * s;
    const by = this.offsetY + (ball.displayY + 0.5) * s;

    // Koyu renk versiyonu
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
          const particleSpeed = 0.8 + Math.random() * 2.0;

          this.trailParticles.push({
            x: spawnX,
            y: spawnY,
            vx: Math.cos(angle) * particleSpeed,
            vy: Math.sin(angle) * particleSpeed,
            // Parcaciklar daha buyuk
            size: isDust ? 2.5 + Math.random() * 3 : 3.5 + Math.random() * 5,
            life: 1,
            // Koyu renkler: toz icin koyu bej, renkli icin koyu level rengi
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
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.life -= 0.025;
      if (p.life <= 0) continue;

      // Yuksek opaklık - artik kesinlikle gorunur
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

  // --- Top: squash & stretch deformasyonu + hiz kuyrugu ---
  private drawBall(ball: Ball, color: string) {
    const ctx = this.ctx;
    const s = this.cellSize;
    const cx = this.offsetX + (ball.displayX + 0.5) * s;
    const cy = this.offsetY + (ball.displayY + 0.5) * s;
    const r = BALL_RADIUS * (s / 60);

    // Deformasyon hesapla
    const speed = ball.speed;
    const isMoving = ball.animating && speed > 0.05;

    // Hareket yonune gore rotasyon acisi
    let angle = 0;
    if (isMoving) {
      angle = Math.atan2(ball.moveDirY, ball.moveDirX);
    }

    // Squash & stretch: hiz arttikca daha fazla deforme
    // stretchX: hareket yonunde uzama (1.0 - 1.65)
    // stretchY: dik yonde basilma (1.0 - 0.49)
    const stretchAmount = Math.min(speed, 1) * 0.65;
    const stretchX = isMoving ? 1.0 + stretchAmount : 1.0;
    const stretchY = isMoving ? 1.0 - stretchAmount * 0.75 : 1.0;

    ctx.save();
    ctx.translate(cx, cy);

    if (isMoving) {
      ctx.rotate(angle);
    }

    // Golge (hafif kaymis)
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

    // Parlama (highlight)
    ctx.beginPath();
    ctx.arc(-r * 0.25, -r * 0.25, r * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.50)';
    ctx.fill();

    ctx.restore();
    ctx.restore();
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
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate((c.rotation * Math.PI) / 180);
      ctx.globalAlpha = c.life; ctx.fillStyle = c.color;
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
