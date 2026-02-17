import { Renderer } from './Renderer';
import { Input } from './Input';
import { Ball } from './Ball';
import { Level } from './Level';
import { ScreenManager, Screen } from '../ui/ScreenManager';
import { getLevelById, getTotalLevels } from '../levels/index';
import { Direction, LEVEL_COLORS } from '../utils/constants';
import { saveProgress } from '../utils/storage';
import { playSlide, playComplete, playBump, resumeAudio } from '../utils/sound';

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

  // Input queue - ardışık swipe desteği
  private moveQueue: Direction[] = [];
  private readonly MAX_QUEUE = 3;
  private levelCompleting = false;

  constructor(canvas: HTMLCanvasElement, overlay: HTMLDivElement) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);

    this.input = new Input(canvas, (dir) => this.handleSwipe(dir));
    this.input.setEnabled(false);

    this.screenManager = new ScreenManager(overlay, getTotalLevels(), {
      onPlay: () => this.showScreen('levels'),
      onSelectLevel: (id) => this.startLevel(id),
      onBack: () => {
        if (this.screen === 'game') {
          this.showScreen('levels');
        } else {
          this.showScreen('menu');
        }
      },
      onRestart: () => {
        if (this.currentLevel) {
          this.startLevel(this.currentLevel.data.id);
        }
      },
      // DEBUG: Hızlı level geçiş
      onPrevLevel: () => {
        if (this.currentLevel && this.currentLevel.data.id > 1) {
          this.startLevel(this.currentLevel.data.id - 1);
        }
      },
      onNextLevel: () => {
        if (this.currentLevel) {
          const nextId = this.currentLevel.data.id + 1;
          if (nextId <= getTotalLevels()) {
            this.startLevel(nextId);
          }
        }
      },
    });
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
    }

    this.screenManager.show(screen, data);
  }

  private startLevel(levelId: number) {
    const levelData = getLevelById(levelId);
    if (!levelData) return;

    this.currentLevel = new Level(levelData);
    this.ball = new Ball(levelData.startX, levelData.startY);
    this.moves = 0;
    this.moveQueue = [];
    this.levelCompleting = false;

    this.showScreen('game', {
      levelId,
      moves: 0,
      progress: this.currentLevel.getProgress(),
    });
  }

  private handleSwipe(direction: Direction) {
    if (!this.currentLevel || !this.ball) return;
    if (this.levelCompleting) return;

    resumeAudio();

    // Top hareket halindeyse kuyruğa ekle
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
      // Kuyrukta sonraki hamleyi dene
      if (this.moveQueue.length > 0) {
        const next = this.moveQueue.shift()!;
        this.executeMove(next);
      }
      return;
    }

    this.moves++;
    playSlide();
    this.ball.startSlide(result);
    this.screenManager.updateHUD(this.moves, this.currentLevel.getProgress());
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
      this.screenManager.updateHUD(this.moves, this.currentLevel.getProgress());
    }

    // Animasyon bitti
    if (!this.ball.animating && paintedTiles) {
      if (this.currentLevel.isComplete()) {
        this.onLevelComplete();
      } else if (this.moveQueue.length > 0) {
        // Kuyruktan sonraki hamleyi çalıştır
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
    const colorIdx = level.data.colorIndex % LEVEL_COLORS.length;

    saveProgress(level.data.id, stars, this.moves);
    playComplete();
    this.renderer.startConfetti(LEVEL_COLORS[colorIdx]);

    // Otomatik sonraki seviyeye geçiş (tamamlanma ekranı yok)
    const nextId = level.data.id + 1;
    setTimeout(() => {
      this.renderer.stopConfetti();
      if (nextId <= getTotalLevels()) {
        this.startLevel(nextId);
      } else {
        this.showScreen('levels');
      }
    }, 1200);
  }
}
