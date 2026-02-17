import { Renderer } from './Renderer';
import { Input } from './Input';
import { Ball } from './Ball';
import { Level } from './Level';
import { ScreenManager, Screen } from '../ui/ScreenManager';
import { getAllLevels } from '../levels/index';
import { LevelData } from '../levels/types';
import { Direction, LEVEL_COLORS } from '../utils/constants';
import { saveProgress, getStars } from '../utils/storage';
import { playSlide, playComplete, playBump, resumeAudio } from '../utils/sound';

export class Game {
  private canvas: HTMLCanvasElement;
  private renderer: Renderer;
  private input: Input;
  private screenManager: ScreenManager;
  private levels: LevelData[];

  private currentLevel: Level | null = null;
  private ball: Ball | null = null;
  private moves = 0;
  private screen: Screen = 'menu';
  private animFrameId = 0;
  private lastTime = 0;

  constructor(canvas: HTMLCanvasElement, overlay: HTMLDivElement) {
    this.canvas = canvas;
    this.levels = getAllLevels();
    this.renderer = new Renderer(canvas);

    this.input = new Input(canvas, (dir) => this.handleSwipe(dir));
    this.input.setEnabled(false);

    this.screenManager = new ScreenManager(overlay, this.levels.length, {
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
      onNextLevel: () => {
        if (this.currentLevel) {
          const nextId = this.currentLevel.data.id + 1;
          if (nextId <= this.levels.length) {
            this.startLevel(nextId);
          } else {
            this.showScreen('levels');
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

    if (screen !== 'game' && screen !== 'complete') {
      this.currentLevel = null;
      this.ball = null;
    }

    this.screenManager.show(screen, data);
  }

  private startLevel(levelId: number) {
    const levelData = this.levels.find((l) => l.id === levelId);
    if (!levelData) return;

    this.currentLevel = new Level(levelData);
    this.ball = new Ball(levelData.startX, levelData.startY);
    this.moves = 0;

    this.showScreen('game', {
      levelId,
      moves: 0,
      progress: this.currentLevel.getProgress(),
    });
  }

  private handleSwipe(direction: Direction) {
    if (!this.currentLevel || !this.ball) return;
    if (this.ball.animating) return;

    resumeAudio();

    const result = this.ball.calculateSlide(
      direction,
      this.currentLevel.grid,
      this.currentLevel.data.width,
      this.currentLevel.data.height
    );

    if (!result) {
      playBump();
      return;
    }

    this.moves++;
    playSlide();
    this.ball.startSlide(result);
    this.input.setEnabled(false);
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

    // Animasyon bitti mi?
    if (!this.ball.animating && paintedTiles) {
      // Tamamlanma kontrolü
      if (this.currentLevel.isComplete()) {
        this.onLevelComplete();
      } else {
        this.input.setEnabled(true);
      }
    }
  }

  private render() {
    if (!this.currentLevel || !this.ball) return;
    if (this.screen !== 'game' && this.screen !== 'complete') return;

    this.renderer.render(this.currentLevel, this.ball);
  }

  private onLevelComplete() {
    const level = this.currentLevel!;
    const stars = level.calculateStars(this.moves);
    const colorIdx = level.data.colorIndex % LEVEL_COLORS.length;

    saveProgress(level.data.id, stars, this.moves);

    playComplete();
    this.renderer.startConfetti(LEVEL_COLORS[colorIdx]);

    // Kısa gecikme sonra tamamlanma ekranını göster
    setTimeout(() => {
      this.screen = 'complete';
      this.screenManager.show('complete', {
        levelId: level.data.id,
        stars,
        moves: this.moves,
        targetMoves: level.data.targetMoves,
        isLastLevel: level.data.id >= this.levels.length,
      });
    }, 800);
  }
}
