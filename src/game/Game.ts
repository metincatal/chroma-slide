import { Renderer } from './Renderer';
import { Input } from './Input';
import { Ball } from './Ball';
import { Level } from './Level';
import { ScreenManager, Screen } from '../ui/ScreenManager';
import { getLevelById, getTotalLevels } from '../levels/index';
import { getUndoCount } from '../levels/procedural';
import { Direction, DIRECTIONS, GameMode, LEVEL_COLORS, PAINT_GRADIENTS } from '../utils/constants';
import { saveProgress, saveTheme, getSelectedTheme } from '../utils/storage';
import { getThemeById, ThemeConfig } from '../utils/themes';
import { playSlide, playComplete, playBump, resumeAudio } from '../utils/sound';

interface UndoSnapshot {
  ballX: number;
  ballY: number;
  paintedTiles: { x: number; y: number }[];
  moveCount: number;
}

export class Game {
  private canvas: HTMLCanvasElement;
  private renderer: Renderer;
  private input: Input;
  private screenManager: ScreenManager;

  private currentLevel: Level | null = null;
  private ball: Ball | null = null;
  private moves = 0;
  private screen: Screen = 'menu';
  private animFrameId = 0;
  private lastTime = 0;

  // Input queue
  private moveQueue: Direction[] = [];
  private readonly MAX_QUEUE = 3;
  private levelCompleting = false;

  // Mod sistemi
  private currentMode: GameMode = 'thinking';

  // Undo sistemi
  private undoStack: UndoSnapshot[] = [];
  private maxUndos = 5;
  private remainingUndos = 5;

  constructor(canvas: HTMLCanvasElement, overlay: HTMLDivElement) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);

    this.input = new Input(canvas, (dir) => this.handleSwipe(dir));
    this.input.setEnabled(false);

    this.screenManager = new ScreenManager(overlay, getTotalLevels(), {
      onSelectMode: (mode) => {
        this.currentMode = mode;
        this.showScreen('levels', { mode });
      },
      onSelectLevel: (id) => this.startLevel(id),
      onBack: () => {
        if (this.screen === 'game') {
          this.showScreen('levels', { mode: this.currentMode });
        } else if (this.screen === 'themes') {
          this.showScreen('menu');
        } else {
          this.showScreen('menu');
        }
      },
      onRestart: () => {
        if (this.currentLevel) {
          this.startLevel(this.currentLevel.data.id);
        }
      },
      onUndo: () => this.undo(),
      onScreenshot: () => this.takeScreenshot(),
      onShowThemes: () => this.showScreen('themes'),
      onSelectTheme: (theme) => this.applyTheme(theme),
    }, this.currentMode);

    // Baslangicta kayitli temayi yukle
    const savedTheme = getThemeById(getSelectedTheme());
    this.renderer.setTheme(savedTheme);
  }

  resize(width: number, height: number, dpr: number) {
    this.renderer.resize(width, height, dpr);
  }

  start() {
    this.showScreen('menu');
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  private showScreen(screen: Screen, data?: Record<string, unknown>) {
    this.screen = screen;
    this.input.setEnabled(screen === 'game');
    this.renderer.stopConfetti();

    if (screen !== 'game') {
      this.currentLevel = null;
      this.ball = null;
      this.renderer.clear();
    }

    this.screenManager.show(screen, { ...data, mode: this.currentMode });
  }

  private async applyTheme(theme: ThemeConfig) {
    saveTheme(theme.id);
    await this.renderer.setTheme(theme);
    this.showScreen('themes');
  }

  private startLevel(levelId: number) {
    const levelData = getLevelById(levelId, this.currentMode);
    if (!levelData) return;

    this.currentLevel = new Level(levelData);
    this.ball = new Ball(levelData.startX, levelData.startY);
    this.moves = 0;
    this.moveQueue = [];
    this.levelCompleting = false;

    // Undo sistemi sifirla
    this.undoStack = [];
    this.maxUndos = getUndoCount(levelId, this.currentMode);
    this.remainingUndos = this.maxUndos;

    this.showScreen('game', {
      levelId,
      progress: this.currentLevel.getProgress(),
      mode: this.currentMode,
      remainingUndos: this.remainingUndos,
      maxUndos: this.maxUndos,
    });
  }

  private handleSwipe(direction: Direction) {
    if (!this.currentLevel || !this.ball) return;
    if (this.levelCompleting) return;

    resumeAudio();

    if (this.ball.animating) {
      if (this.moveQueue.length < this.MAX_QUEUE) {
        this.moveQueue.push(direction);
      }
      return;
    }

    this.executeMove(direction);
  }

  private executeMove(direction: Direction) {
    if (!this.currentLevel || !this.ball) return;

    const result = this.ball.calculateSlide(
      direction,
      this.currentLevel.grid,
      this.currentLevel.data.width,
      this.currentLevel.data.height
    );

    if (!result) {
      playBump();
      // Carpilan duvar karosunu bul
      const dir = DIRECTIONS[direction];
      const wallGx = this.ball.x + dir.dx;
      const wallGy = this.ball.y + dir.dy;
      this.renderer.triggerImpact(wallGx, wallGy, 1.0);
      this.renderer.triggerShake(1.0);
      if (this.moveQueue.length > 0) {
        const next = this.moveQueue.shift()!;
        this.executeMove(next);
      }
      return;
    }

    // Undo snapshot: hamle oncesi durumu kaydet
    const newPaintedTiles: { x: number; y: number }[] = [];
    for (const t of result.path) {
      const idx = t.y * this.currentLevel.data.width + t.x;
      if (this.currentLevel.grid[idx] !== 2) { // PAINTED degil
        newPaintedTiles.push({ x: t.x, y: t.y });
      }
    }

    this.undoStack.push({
      ballX: this.ball.x,
      ballY: this.ball.y,
      paintedTiles: newPaintedTiles,
      moveCount: this.moves,
    });

    this.moves++;
    playSlide();
    this.ball.startSlide(result);
    this.screenManager.updateHUD(this.currentLevel.getProgress());
  }

  private undo() {
    if (!this.currentLevel || !this.ball) return;
    if (this.ball.animating) return;
    if (this.undoStack.length === 0) return;
    if (this.remainingUndos <= 0) return;
    if (this.levelCompleting) return;

    const snapshot = this.undoStack.pop()!;
    this.remainingUndos--;

    // Ball pozisyonunu geri al
    this.ball.reset(snapshot.ballX, snapshot.ballY);

    // Boyanan karolari geri al
    this.currentLevel.unpaintTiles(snapshot.paintedTiles);

    // Hamle sayacini geri al
    this.moves = snapshot.moveCount;

    // HUD guncelle
    this.screenManager.updateHUD(this.currentLevel.getProgress(), this.remainingUndos);

    // Static layer invalidate (boyalar degisti)
    this.renderer.invalidateStatic();
  }

  private loop = (time: number) => {
    const dt = time - this.lastTime;
    this.lastTime = time;

    this.update(dt);
    this.render();

    this.animFrameId = requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    if (!this.currentLevel || !this.ball) return;
    if (this.screen !== 'game') return;

    const paintedTiles = this.ball.update(dt);

    if (paintedTiles) {
      this.currentLevel.paintTiles(paintedTiles);
      this.screenManager.updateHUD(this.currentLevel.getProgress());
    }

    if (!this.ball.animating && paintedTiles) {
      // Slide bitti - duvara carpma efekti (hafif)
      const wallGx = this.ball.x + this.ball.moveDirX;
      const wallGy = this.ball.y + this.ball.moveDirY;
      this.renderer.triggerImpact(wallGx, wallGy, 0.4);
      this.renderer.triggerShake(0.25);

      if (this.currentLevel.isComplete()) {
        this.onLevelComplete();
      } else if (this.moveQueue.length > 0) {
        const next = this.moveQueue.shift()!;
        this.executeMove(next);
      }
    }
  }

  private render() {
    if (!this.currentLevel || !this.ball) return;
    if (this.screen !== 'game') return;

    this.renderer.render(this.currentLevel, this.ball);
  }

  private onLevelComplete() {
    if (this.levelCompleting) return;
    this.levelCompleting = true;
    this.moveQueue = [];

    const level = this.currentLevel!;
    const stars = level.calculateStars(this.moves);
    const colorIdx = level.data.colorIndex % PAINT_GRADIENTS.length;

    saveProgress(level.data.id, stars, this.moves, this.currentMode);
    playComplete();
    this.renderer.startConfetti(PAINT_GRADIENTS[colorIdx][1]);

    const nextId = level.data.id + 1;
    setTimeout(() => {
      this.renderer.stopConfetti();
      if (nextId <= getTotalLevels()) {
        this.startLevel(nextId);
      } else {
        this.showScreen('levels', { mode: this.currentMode });
      }
    }, 1200);
  }

  private async takeScreenshot() {
    try {
      const dataUrl = this.canvas.toDataURL('image/png');
      const blob = await (await fetch(dataUrl)).blob();

      if (navigator.share && navigator.canShare) {
        const file = new File([blob], `chromaslide-level.png`, { type: 'image/png' });
        const shareData = { files: [file] };
        if (navigator.canShare(shareData)) {
          await navigator.share(shareData);
          return;
        }
      }

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `chromaslide-screenshot.png`;
      link.click();
    } catch (_) {
      // Kullanici iptal ettiyse sessiz gecis
    }
  }
}
