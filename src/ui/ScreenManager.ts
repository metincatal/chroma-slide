import { getAllStars } from '../utils/storage';
import { LEVEL_COLORS } from '../utils/constants';
import { playClick, resumeAudio } from '../utils/sound';

export type Screen = 'menu' | 'levels' | 'game';

interface ScreenCallbacks {
  onPlay: () => void;
  onSelectLevel: (levelId: number) => void;
  onBack: () => void;
  onRestart: () => void;
  onScreenshot: () => void;
}

export class ScreenManager {
  private overlay: HTMLDivElement;
  private callbacks: ScreenCallbacks;
  private currentScreen: Screen = 'menu';
  private totalLevels: number;

  constructor(overlay: HTMLDivElement, totalLevels: number, callbacks: ScreenCallbacks) {
    this.overlay = overlay;
    this.totalLevels = totalLevels;
    this.callbacks = callbacks;
  }

  show(screen: Screen, data?: Record<string, unknown>) {
    this.currentScreen = screen;
    this.overlay.innerHTML = '';

    switch (screen) {
      case 'menu':
        this.showMenu();
        break;
      case 'levels':
        this.showLevelSelect();
        break;
      case 'game':
        this.showGameHUD(data as { levelId: number; progress: number });
        break;
    }
  }

  getScreen(): Screen {
    return this.currentScreen;
  }

  updateHUD(progress: number) {
    const progressFill = this.overlay.querySelector('.progress-fill') as HTMLElement;
    if (progressFill) progressFill.style.width = `${progress * 100}%`;
  }

  private showMenu() {
    const html = `
      <div class="menu-screen">
        <div class="menu-title"><span class="chroma">Chroma</span>Slide</div>
        <div class="menu-subtitle">Kayarak Boya, Labirenti Coz</div>
        <button class="btn btn-primary" id="btn-play">OYNA</button>
      </div>
    `;
    this.overlay.innerHTML = html;

    this.overlay.querySelector('#btn-play')!.addEventListener('click', () => {
      resumeAudio();
      playClick();
      this.callbacks.onPlay();
    });
  }

  private showLevelSelect() {
    const allStars = getAllStars();

    let levelsHtml = '';
    for (let i = 1; i <= this.totalLevels; i++) {
      const stars = allStars[i] || 0;
      const isCompleted = stars > 0;

      let className = 'level-btn';
      if (isCompleted) {
        className += ' completed';
      } else {
        className += ' unlocked';
      }

      const colorIdx = (i - 1) % LEVEL_COLORS.length;
      const style = !isCompleted
        ? `background: linear-gradient(135deg, ${LEVEL_COLORS[colorIdx]}, ${this.darkenColor(LEVEL_COLORS[colorIdx], 20)})`
        : '';

      const starsText = isCompleted
        ? `<div class="level-stars">${'\u2605'.repeat(stars)}${'\u2606'.repeat(3 - stars)}</div>`
        : '';

      levelsHtml += `
        <button class="${className}" data-level="${i}" ${style ? `style="${style}"` : ''}>
          ${i}
          ${starsText}
        </button>
      `;
    }

    const html = `
      <div class="level-screen">
        <button class="back-btn" id="btn-back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div class="level-screen-title">Seviye Sec</div>
        <div class="level-grid">${levelsHtml}</div>
      </div>
    `;
    this.overlay.innerHTML = html;

    this.overlay.querySelector('#btn-back')!.addEventListener('click', () => {
      playClick();
      this.callbacks.onBack();
    });

    this.overlay.querySelectorAll('.level-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        playClick();
        const levelId = parseInt((btn as HTMLElement).dataset.level!);
        this.callbacks.onSelectLevel(levelId);
      });
    });
  }

  private showGameHUD(data: { levelId: number; progress: number }) {
    const html = `
      <div class="game-hud">
        <div class="hud-left">
          <button class="hud-btn" id="btn-hud-back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
        </div>
        <div class="hud-center">
          <div class="hud-level-label">Seviye ${data.levelId}</div>
        </div>
        <div class="hud-right">
          <button class="hud-btn" id="btn-restart">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
          </button>
          <button class="hud-btn" id="btn-screenshot">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${data.progress * 100}%"></div>
      </div>
    `;
    this.overlay.innerHTML = html;

    this.overlay.querySelector('#btn-hud-back')!.addEventListener('click', () => {
      playClick();
      this.callbacks.onBack();
    });

    this.overlay.querySelector('#btn-restart')!.addEventListener('click', () => {
      playClick();
      this.callbacks.onRestart();
    });

    this.overlay.querySelector('#btn-screenshot')!.addEventListener('click', () => {
      playClick();
      this.callbacks.onScreenshot();
    });
  }

  private darkenColor(hex: string, amount: number): string {
    const num = parseInt(hex.slice(1), 16);
    const r = Math.max(0, ((num >> 16) & 0xff) - amount);
    const g = Math.max(0, ((num >> 8) & 0xff) - amount);
    const b = Math.max(0, (num & 0xff) - amount);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }
}
