import { getAllStars } from '../utils/storage';
import { GameMode, LEVEL_COLORS } from '../utils/constants';
import { THEMES, ThemeConfig } from '../utils/themes';
import { getSelectedTheme } from '../utils/storage';
import { getDifficultyTiers, DifficultyTier } from '../levels/procedural';
import { playClick, resumeAudio } from '../utils/sound';

export type Screen = 'menu' | 'levels' | 'themes' | 'game';

interface ScreenCallbacks {
  onSelectMode: (mode: GameMode) => void;
  onSelectLevel: (levelId: number) => void;
  onBack: () => void;
  onRestart: () => void;
  onUndo: () => void;
  onScreenshot: () => void;
  onSelectTheme: (theme: ThemeConfig) => void;
  onShowThemes: () => void;
}

export class ScreenManager {
  private overlay: HTMLDivElement;
  private callbacks: ScreenCallbacks;
  private currentScreen: Screen = 'menu';
  private totalLevels: number;
  private currentMode: GameMode;
  private activeTierIndex = 0;

  constructor(overlay: HTMLDivElement, totalLevels: number, callbacks: ScreenCallbacks, initialMode: GameMode = 'thinking') {
    this.overlay = overlay;
    this.totalLevels = totalLevels;
    this.callbacks = callbacks;
    this.currentMode = initialMode;
  }

  show(screen: Screen, data?: Record<string, unknown>) {
    this.currentScreen = screen;
    if (data?.mode) this.currentMode = data.mode as GameMode;
    this.overlay.innerHTML = '';

    switch (screen) {
      case 'menu':
        this.showMenu();
        break;
      case 'levels':
        this.activeTierIndex = 0;
        this.showLevelSelect();
        break;
      case 'themes':
        this.showThemeSelect();
        break;
      case 'game':
        this.showGameHUD(data as { levelId: number; progress: number; mode: GameMode; remainingUndos: number; maxUndos: number });
        break;
    }
  }

  getScreen(): Screen {
    return this.currentScreen;
  }

  updateHUD(progress: number, remainingUndos?: number) {
    const progressFill = this.overlay.querySelector('.progress-fill') as HTMLElement;
    if (progressFill) progressFill.style.width = `${progress * 100}%`;

    if (remainingUndos !== undefined) {
      const badge = this.overlay.querySelector('.undo-badge') as HTMLElement;
      const undoBtn = this.overlay.querySelector('#btn-undo') as HTMLElement;
      if (badge && this.currentMode === 'thinking') {
        badge.textContent = `${remainingUndos}`;
      }
      if (undoBtn) {
        if (remainingUndos <= 0) {
          undoBtn.classList.add('hud-btn-disabled');
        } else {
          undoBtn.classList.remove('hud-btn-disabled');
        }
      }
    }
  }

  private showMenu() {
    const html = `
      <div class="menu-screen">
        <div class="menu-title"><span class="chroma">Chroma</span>Slide</div>
        <div class="menu-subtitle">Kayarak Boya, Labirenti Coz</div>
        <div class="menu-modes">
          <button class="btn btn-mode-thinking" id="btn-thinking">
            <svg class="mode-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><line x1="9" y1="22" x2="15" y2="22"/></svg>
            TAKTIK MOD
          </button>
          <button class="btn btn-mode-relaxing" id="btn-relaxing">
            <svg class="mode-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8c.7-1 1-2.2 1-3.5C18 2.5 16.6 1 15 1c-1.3 0-2.4.8-2.8 2C11.8 1.8 10.7 1 9.5 1 7.6 1 6 2.5 6 4.5 6 5.8 6.3 7 7 8"/><path d="M3 14c0 4.4 3.6 8 8 8h2c4.4 0 8-3.6 8-8v-1c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v1z"/></svg>
            AKIS MODU
          </button>
        </div>
        <button class="btn btn-secondary" id="btn-themes">TEMALAR</button>
      </div>
    `;
    this.overlay.innerHTML = html;

    this.overlay.querySelector('#btn-thinking')!.addEventListener('click', () => {
      resumeAudio();
      playClick();
      this.callbacks.onSelectMode('thinking');
    });

    this.overlay.querySelector('#btn-relaxing')!.addEventListener('click', () => {
      resumeAudio();
      playClick();
      this.callbacks.onSelectMode('relaxing');
    });

    this.overlay.querySelector('#btn-themes')!.addEventListener('click', () => {
      resumeAudio();
      playClick();
      this.callbacks.onShowThemes();
    });
  }

  private showThemeSelect() {
    const currentTheme = getSelectedTheme();

    let themesHtml = '';
    for (const theme of THEMES) {
      const isActive = theme.id === currentTheme;
      const activeClass = isActive ? ' theme-card-active' : '';

      themesHtml += `
        <button class="theme-card${activeClass}" data-theme="${theme.id}">
          <div class="theme-preview">
            <div class="theme-preview-board" style="background: ${theme.previewBoard}"></div>
            <div class="theme-preview-path" style="background: ${theme.previewPath}"></div>
          </div>
          <div class="theme-name">${theme.name}</div>
          ${isActive ? '<div class="theme-active-badge">Aktif</div>' : ''}
        </button>
      `;
    }

    const html = `
      <div class="theme-screen">
        <button class="back-btn" id="btn-back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div class="theme-screen-title">Tema Sec</div>
        <div class="theme-grid">${themesHtml}</div>
      </div>
    `;
    this.overlay.innerHTML = html;

    this.overlay.querySelector('#btn-back')!.addEventListener('click', () => {
      playClick();
      this.callbacks.onBack();
    });

    this.overlay.querySelectorAll('.theme-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        playClick();
        const themeId = (btn as HTMLElement).dataset.theme!;
        const theme = THEMES.find(t => t.id === themeId);
        if (theme) this.callbacks.onSelectTheme(theme);
      });
    });
  }

  private showLevelSelect() {
    const tiers = getDifficultyTiers(this.currentMode);
    const modeTitle = this.currentMode === 'thinking' ? 'Taktik' : 'Akis';

    const html = `
      <div class="level-screen">
        <button class="back-btn" id="btn-back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div class="level-screen-title">${modeTitle} - Seviye Sec</div>
        <div class="tier-tabs" id="tier-tabs"></div>
        <div class="level-grid" id="level-grid"></div>
      </div>
    `;
    this.overlay.innerHTML = html;

    this.renderTabs(tiers);
    this.renderLevelsForTier(tiers[this.activeTierIndex]);

    this.overlay.querySelector('#btn-back')!.addEventListener('click', () => {
      playClick();
      this.callbacks.onBack();
    });
  }

  private renderTabs(tiers: DifficultyTier[]) {
    const tabsContainer = this.overlay.querySelector('#tier-tabs')!;
    let tabsHtml = '';
    for (let i = 0; i < tiers.length; i++) {
      const activeClass = i === this.activeTierIndex ? ' tier-tab-active' : '';
      tabsHtml += `<button class="tier-tab${activeClass}" data-tier="${i}">${tiers[i].name}</button>`;
    }
    tabsContainer.innerHTML = tabsHtml;

    tabsContainer.querySelectorAll('.tier-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        playClick();
        this.activeTierIndex = parseInt((btn as HTMLElement).dataset.tier!);
        this.renderTabs(tiers);
        this.renderLevelsForTier(tiers[this.activeTierIndex]);
      });
    });
  }

  private renderLevelsForTier(tier: DifficultyTier) {
    const gridContainer = this.overlay.querySelector('#level-grid')!;
    const allStars = getAllStars(this.currentMode);

    let levelsHtml = '';
    for (let i = tier.startLevel; i <= tier.endLevel; i++) {
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

    gridContainer.innerHTML = levelsHtml;

    gridContainer.querySelectorAll('.level-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        playClick();
        const levelId = parseInt((btn as HTMLElement).dataset.level!);
        this.callbacks.onSelectLevel(levelId);
      });
    });
  }

  private showGameHUD(data: { levelId: number; progress: number; mode: GameMode; remainingUndos: number; maxUndos: number }) {
    const isThinking = data.mode === 'thinking';
    const undoBadge = isThinking ? `<span class="undo-badge">${data.remainingUndos}</span>` : '';
    const undoDisabled = data.remainingUndos <= 0 ? ' hud-btn-disabled' : '';

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
          <button class="hud-btn hud-btn-undo${undoDisabled}" id="btn-undo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.69 3L3 13"/></svg>
            ${undoBadge}
          </button>
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

    this.overlay.querySelector('#btn-undo')!.addEventListener('click', () => {
      playClick();
      this.callbacks.onUndo();
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
