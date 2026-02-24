import { getAllStars } from '../utils/storage';
import { GameMode, LEVEL_COLORS, PAINT_GRADIENTS } from '../utils/constants';
import { THEMES, ThemeConfig } from '../utils/themes';
import { getSelectedTheme } from '../utils/storage';
import { getDifficultyTiers, DifficultyTier } from '../levels/procedural';
import { playClick, resumeAudio } from '../utils/sound';
import { PlayerData, RoomVisibility, PublicRoomEntry, JoinRequest } from '../multiplayer/RoomManager';

export type Screen =
  | 'menu'
  | 'levels'
  | 'themes'
  | 'game'
  | 'mp-name'
  | 'mp-lobby'
  | 'mp-waiting'
  | 'mp-game'
  | 'mp-results';

interface ScreenCallbacks {
  onSelectMode: (mode: GameMode) => void;
  onSelectLevel: (levelId: number) => void;
  onBack: () => void;
  onRestart: () => void;
  onUndo: () => void;
  onScreenshot: () => void;
  onSelectTheme: (theme: ThemeConfig) => void;
  onShowThemes: () => void;
  // Multiplayer callbacks (isteğe bağlı — sadece MultiplayerGame geçirir)
  onMpNameSubmit?:       (name: string) => void;
  onMpChangeName?:       () => void;
  onMpCreateRoom?:       (visibility: RoomVisibility) => void;
  onMpJoinRoom?:         (code: string) => void;
  onMpJoinFromList?:     (code: string) => void;
  onMpSendJoinRequest?:  (code: string) => void;
  onMpApproveRequest?:   (requesterId: string) => void;
  onMpDeclineRequest?:   (requesterId: string) => void;
  onMpStartGame?:        (levelId: number) => void;
  onMpLeave?:            () => void;
  onMpRestart?:          () => void;
  onMpPlayAgain?:        () => void;
  onMpBackToMenu?:       () => void;
  onMpRequestRematch?:   () => void;
  onMpAcceptRematch?:    () => void;
  onMpDeclineRematch?:   () => void;
}

export class ScreenManager {
  private overlay: HTMLDivElement;
  private callbacks: ScreenCallbacks;
  private currentScreen: Screen = 'menu';
  private totalLevels: number;
  private currentMode: GameMode;
  private activeTierIndex = 0;

  // Bekleyen join istekleri (approveRequest için isim/renk gerekli)
  private pendingRequests: Record<string, JoinRequest> = {};

  // Seçili visibility (lobby'de)
  private selectedVisibility: RoomVisibility = 'private';

  constructor(
    overlay: HTMLDivElement,
    totalLevels: number,
    callbacks: ScreenCallbacks,
    initialMode: GameMode = 'thinking'
  ) {
    this.overlay      = overlay;
    this.totalLevels  = totalLevels;
    this.callbacks    = callbacks;
    this.currentMode  = initialMode;
  }

  show(screen: Screen, data?: Record<string, unknown>) {
    this.currentScreen = screen;
    if (data?.mode) this.currentMode = data.mode as GameMode;
    this.overlay.innerHTML = '';

    switch (screen) {
      case 'menu':       this.showMenu();   break;
      case 'levels':     this.activeTierIndex = 0; this.showLevelSelect(); break;
      case 'themes':     this.showThemeSelect(); break;
      case 'game':
        this.showGameHUD(data as {
          levelId: number; progress: number;
          mode: GameMode; remainingUndos: number; maxUndos: number;
        });
        break;
      case 'mp-name':    this.showMpName();  break;
      case 'mp-lobby':   this.showMpLobby(); break;
      case 'mp-waiting':
        this.showMpWaiting(
          (data?.roomCode as string) ?? '',
          (data?.isHost as boolean)  ?? false,
          (data?.players as Record<string, PlayerData>) ?? {},
          (data?.selectedLevel as number) ?? 1,
          (data?.totalLevels as number)   ?? this.totalLevels
        );
        break;
      case 'mp-game':
        this.showMpGame(
          (data?.players as Record<string, PlayerData>) ?? {},
          (data?.myId as string)    ?? '',
          (data?.roomCode as string) ?? ''
        );
        break;
      case 'mp-results':
        this.showMpResults(
          (data?.players as Record<string, PlayerData>) ?? {},
          (data?.finalScores as Record<string, number>) ?? {},
          (data?.myId as string) ?? ''
        );
        break;
    }
  }

  getScreen(): Screen { return this.currentScreen; }

  // Bekleyen istek sorgula (MultiplayerGame'den çağrılır)
  getPendingRequest(requesterId: string): JoinRequest | undefined {
    return this.pendingRequests[requesterId];
  }

  // -------------------------------------------------------
  // Tek oyunculu HUD güncelleme
  // -------------------------------------------------------

  updateHUD(progress: number, remainingUndos?: number) {
    const progressFill = this.overlay.querySelector('.progress-fill') as HTMLElement;
    if (progressFill) progressFill.style.width = `${progress * 100}%`;

    if (remainingUndos !== undefined) {
      const badge   = this.overlay.querySelector('.undo-badge') as HTMLElement;
      const undoBtn = this.overlay.querySelector('#btn-undo') as HTMLElement;
      if (badge && this.currentMode === 'thinking') {
        badge.textContent = `${remainingUndos}`;
      }
      if (undoBtn) {
        if (remainingUndos <= 0) undoBtn.classList.add('hud-btn-disabled');
        else                     undoBtn.classList.remove('hud-btn-disabled');
      }
    }
  }

  // -------------------------------------------------------
  // Çok oyunculu dinamik güncellemeler
  // -------------------------------------------------------

  updateMpWaiting(
    players: Record<string, PlayerData>,
    roomCode: string,
    isHost: boolean,
    selectedLevel: number
  ) {
    const list = this.overlay.querySelector('#mp-player-list');
    if (!list) return;
    list.innerHTML = this.buildPlayerListHtml(players);

    // Level input'u burada güncelleme — host'un elle girdiği değeri ezer

    const startBtn = this.overlay.querySelector('#btn-mp-start') as HTMLButtonElement;
    if (startBtn) {
      const connected = Object.values(players).filter((p) => p.connected).length;
      startBtn.disabled = connected < 2;
    }
  }

  updateMpCountdown(remaining: number) {
    const el = this.overlay.querySelector('#mp-countdown') as HTMLElement;
    if (!el) return;
    if (remaining <= 0) {
      el.style.display = 'none';
    } else {
      el.style.display = 'flex';
      el.textContent   = String(remaining);
    }
  }

  updateMpGameScores(
    players: Record<string, PlayerData>,
    myId: string,
    tileColors: Map<string, number>
  ) {
    const scoresEl = this.overlay.querySelector('#mp-scores');
    if (!scoresEl) return;

    const scores: Record<string, number> = {};
    for (const [, colorIdx] of tileColors) {
      for (const [pid, p] of Object.entries(players)) {
        if (p.colorIndex === colorIdx) {
          scores[pid] = (scores[pid] ?? 0) + 1;
          break;
        }
      }
    }

    scoresEl.innerHTML = this.buildScoreChipsHtml(players, scores, myId);
  }

  showMpError(message: string) {
    const existing = this.overlay.querySelector('.mp-error-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className   = 'mp-error-toast';
    toast.textContent = message;
    this.overlay.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // Aktif odalar listesini güncelle (lobby'de gösterilir)
  updatePublicRooms(rooms: PublicRoomEntry[]) {
    const container = this.overlay.querySelector('#mp-rooms-list');
    if (!container) return;

    if (rooms.length === 0) {
      container.innerHTML = '<div class="mp-rooms-empty">Aktif oda yok</div>';
      return;
    }

    container.innerHTML = rooms
      .map((room) => {
        const lockIcon = room.visibility === 'invite'
          ? '<span class="mp-room-lock">🔒</span>'
          : '<span class="mp-room-open">🌐</span>';
        const btnText  = room.visibility === 'invite' ? 'İstek Gönder' : 'Katıl';
        const action   = room.visibility === 'invite'
          ? `onMpSendJoinRequest:'${room.code}'`
          : `onMpJoinFromList:'${room.code}'`;
        return `
          <div class="mp-room-item">
            ${lockIcon}
            <div class="mp-room-info">
              <span class="mp-room-host">${room.hostName}</span>
              <span class="mp-room-players">${room.playerCount}/4 oyuncu</span>
            </div>
            <button class="mp-room-join-btn" data-code="${room.code}" data-vis="${room.visibility}">
              ${btnText}
            </button>
          </div>
        `;
      })
      .join('');

    // Butonlara event ekle
    container.querySelectorAll('.mp-room-join-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        playClick();
        const code = (btn as HTMLElement).dataset.code!;
        const vis  = (btn as HTMLElement).dataset.vis as RoomVisibility;
        if (vis === 'invite') {
          this.callbacks.onMpSendJoinRequest?.(code);
        } else {
          this.callbacks.onMpJoinFromList?.(code);
        }
      });
    });
  }

  // Katılma isteklerini bekleme odasında güncelle
  updateMpJoinRequests(requests: Record<string, JoinRequest>) {
    // Bekleyen istekleri sakla (approveRequest için gerekli)
    this.pendingRequests = requests;

    const section = this.overlay.querySelector('#mp-join-request-section');
    if (!section) return;

    const entries = Object.entries(requests).filter(([, r]) => r);
    if (entries.length === 0) {
      section.innerHTML = '';
      return;
    }

    let html = '<div class="mp-join-request-label">Katılma İstekleri</div>';
    for (const [pid, req] of entries) {
      const [gs] = PAINT_GRADIENTS[req.colorIndex % PAINT_GRADIENTS.length];
      html += `
        <div class="mp-join-request-item">
          <span class="mp-player-dot" style="background:${gs}"></span>
          <span class="mp-join-req-name">${req.name}</span>
          <button class="mp-req-btn mp-req-approve" data-pid="${pid}">Onayla</button>
          <button class="mp-req-btn mp-req-decline" data-pid="${pid}">Reddet</button>
        </div>
      `;
    }
    section.innerHTML = html;

    section.querySelectorAll('.mp-req-approve').forEach((btn) => {
      btn.addEventListener('click', () => {
        playClick();
        this.callbacks.onMpApproveRequest?.((btn as HTMLElement).dataset.pid!);
      });
    });
    section.querySelectorAll('.mp-req-decline').forEach((btn) => {
      btn.addEventListener('click', () => {
        playClick();
        this.callbacks.onMpDeclineRequest?.((btn as HTMLElement).dataset.pid!);
      });
    });
  }

  // Rematch dialog (mevcut overlay üstüne)
  showRematchDialog(
    fromName: string,
    onAccept: () => void,
    onDecline: () => void
  ) {
    // Önceki varsa kaldır
    this.overlay.querySelector('.mp-rematch-dialog')?.remove();

    const dialog = document.createElement('div');
    dialog.className = 'mp-rematch-dialog';
    dialog.innerHTML = `
      <div class="mp-rematch-box">
        <div class="mp-rematch-title">${fromName} tekrar oynamak istiyor!</div>
        <div class="mp-rematch-actions">
          <button class="btn btn-mode-multi" id="btn-rematch-accept">KABUL</button>
          <button class="btn btn-secondary"  id="btn-rematch-decline">REDDET</button>
        </div>
      </div>
    `;
    this.overlay.appendChild(dialog);

    dialog.querySelector('#btn-rematch-accept')!.addEventListener('click', () => {
      playClick();
      dialog.remove();
      onAccept();
    });
    dialog.querySelector('#btn-rematch-decline')!.addEventListener('click', () => {
      playClick();
      dialog.remove();
      onDecline();
    });
  }

  // Sonuç ekranında "Tekrar Oyna" butonunu "Bekleniyor..." hâline getir
  setRematchWaiting() {
    const btn = this.overlay.querySelector('#btn-mp-again') as HTMLButtonElement;
    if (!btn) return;
    btn.textContent = 'Bekleniyor...';
    btn.disabled    = true;
  }

  // Bir oyuncu ayrıldığında "Tekrar Oyna" butonunu düşme animasyonuyla gizle
  hideRematchButton(leavingName?: string) {
    const btn = this.overlay.querySelector('#btn-mp-again') as HTMLButtonElement;
    if (!btn || btn.classList.contains('mp-btn-dropping')) return;
    btn.classList.add('mp-btn-dropping');
    setTimeout(() => btn.remove(), 400);
    if (leavingName) {
      this.showMpError(`${leavingName} odayı terk etti.`);
    }
  }

  // İstekli odada onay bekleme dialog'unu göster
  showApprovalWaiting(code: string, onCancel: () => void) {
    this.overlay.querySelector('.mp-approval-dialog')?.remove();
    const dialog = document.createElement('div');
    dialog.className = 'mp-approval-dialog';
    dialog.innerHTML = `
      <div class="mp-approval-box">
        <div class="mp-approval-title">İstek Gönderildi</div>
        <div class="mp-approval-code">Oda: <strong>${code}</strong></div>
        <div class="mp-approval-hint">Host onaylamasını bekliyorsun...</div>
        <div class="mp-waiting-dots"><span></span><span></span><span></span></div>
        <button class="btn btn-secondary" id="btn-approval-cancel">İptal</button>
      </div>
    `;
    this.overlay.appendChild(dialog);
    dialog.querySelector('#btn-approval-cancel')!.addEventListener('click', () => {
      playClick();
      dialog.remove();
      onCancel();
    });
  }

  // Onay bekleme dialog'unu kaldır
  hideApprovalWaiting() {
    this.overlay.querySelector('.mp-approval-dialog')?.remove();
  }

  // -------------------------------------------------------
  // ANA MENÜ
  // -------------------------------------------------------

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
          <button class="btn btn-mode-multi" id="btn-multiplayer">
            <svg class="mode-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><circle cx="19" cy="7" r="2"/><path d="M23 21v-1a3 3 0 0 0-3-3h-1"/></svg>
            COK OYUNCULU
          </button>
        </div>
        <button class="btn btn-secondary" id="btn-themes">TEMALAR</button>
      </div>
    `;
    this.overlay.innerHTML = html;

    this.overlay.querySelector('#btn-thinking')!.addEventListener('click', () => {
      resumeAudio(); playClick();
      this.callbacks.onSelectMode('thinking');
    });
    this.overlay.querySelector('#btn-relaxing')!.addEventListener('click', () => {
      resumeAudio(); playClick();
      this.callbacks.onSelectMode('relaxing');
    });
    this.overlay.querySelector('#btn-themes')!.addEventListener('click', () => {
      resumeAudio(); playClick();
      this.callbacks.onShowThemes();
    });
    this.overlay.querySelector('#btn-multiplayer')!.addEventListener('click', () => {
      resumeAudio(); playClick();
      if (this.callbacks.onMpBackToMenu) {
        // Zaten multiplayer ScreenManager
      } else {
        document.dispatchEvent(new CustomEvent('chroma:startMultiplayer'));
      }
    });
  }

  // -------------------------------------------------------
  // TEMA SEÇIMI
  // -------------------------------------------------------

  private showThemeSelect() {
    const currentTheme = getSelectedTheme();
    let themesHtml = '';
    for (const theme of THEMES) {
      const isActive    = theme.id === currentTheme;
      const activeClass = isActive ? ' theme-card-active' : '';
      themesHtml += `
        <button class="theme-card${activeClass}" data-theme="${theme.id}">
          <div class="theme-preview">
            <div class="theme-preview-board" style="background: ${theme.previewBoard}"></div>
            <div class="theme-preview-path"  style="background: ${theme.previewPath}"></div>
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
      playClick(); this.callbacks.onBack();
    });
    this.overlay.querySelectorAll('.theme-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        playClick();
        const themeId = (btn as HTMLElement).dataset.theme!;
        const theme   = THEMES.find((t) => t.id === themeId);
        if (theme) this.callbacks.onSelectTheme(theme);
      });
    });
  }

  // -------------------------------------------------------
  // SEVİYE SEÇIMI
  // -------------------------------------------------------

  private showLevelSelect() {
    const tiers     = getDifficultyTiers(this.currentMode);
    const modeTitle = this.currentMode === 'thinking' ? 'Taktik' : 'Akis';
    const html = `
      <div class="level-screen">
        <button class="back-btn" id="btn-back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div class="level-screen-title">${modeTitle} - Seviye Sec</div>
        <div class="tier-tabs"  id="tier-tabs"></div>
        <div class="level-grid" id="level-grid"></div>
      </div>
    `;
    this.overlay.innerHTML = html;
    this.renderTabs(tiers);
    this.renderLevelsForTier(tiers[this.activeTierIndex]);
    this.overlay.querySelector('#btn-back')!.addEventListener('click', () => {
      playClick(); this.callbacks.onBack();
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
    const allStars      = getAllStars(this.currentMode);
    let levelsHtml      = '';
    for (let i = tier.startLevel; i <= tier.endLevel; i++) {
      const stars       = allStars[i] || 0;
      const isCompleted = stars > 0;
      const className   = 'level-btn ' + (isCompleted ? 'completed' : 'unlocked');
      const colorIdx    = (i - 1) % LEVEL_COLORS.length;
      const style       = !isCompleted
        ? `background: linear-gradient(135deg, ${LEVEL_COLORS[colorIdx]}, ${this.darkenColor(LEVEL_COLORS[colorIdx], 20)})`
        : '';
      const starsText   = isCompleted
        ? `<div class="level-stars">${'\u2605'.repeat(stars)}${'\u2606'.repeat(3 - stars)}</div>`
        : '';
      levelsHtml += `
        <button class="${className}" data-level="${i}" ${style ? `style="${style}"` : ''}>
          ${i}${starsText}
        </button>
      `;
    }
    gridContainer.innerHTML = levelsHtml;
    gridContainer.querySelectorAll('.level-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        playClick();
        this.callbacks.onSelectLevel(parseInt((btn as HTMLElement).dataset.level!));
      });
    });
  }

  // -------------------------------------------------------
  // OYUN HUD (tek oyunculu)
  // -------------------------------------------------------

  private showGameHUD(data: {
    levelId: number; progress: number;
    mode: GameMode; remainingUndos: number; maxUndos: number;
  }) {
    const isThinking   = data.mode === 'thinking';
    const undoBadge    = isThinking ? `<span class="undo-badge">${data.remainingUndos}</span>` : '';
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
    this.overlay.querySelector('#btn-hud-back')!.addEventListener('click',   () => { playClick(); this.callbacks.onBack(); });
    this.overlay.querySelector('#btn-undo')!.addEventListener('click',       () => { playClick(); this.callbacks.onUndo(); });
    this.overlay.querySelector('#btn-restart')!.addEventListener('click',    () => { playClick(); this.callbacks.onRestart(); });
    this.overlay.querySelector('#btn-screenshot')!.addEventListener('click', () => { playClick(); this.callbacks.onScreenshot(); });
  }

  // -------------------------------------------------------
  // MULTIPLAYER EKRANLAR
  // -------------------------------------------------------

  private showMpName() {
    const html = `
      <div class="mp-screen mp-name-screen">
        <div class="mp-title"><span class="chroma">Chroma</span>Slide</div>
        <div class="mp-subtitle">Çok Oyunculu</div>
        <div class="mp-name-form">
          <input class="mp-name-input" id="mp-name-input" type="text"
            placeholder="Adınızı girin..." maxlength="12" autocomplete="off" />
          <button class="btn btn-mode-multi" id="btn-mp-name-submit">DEVAM</button>
        </div>
        <button class="btn btn-secondary mp-back-btn" id="btn-mp-back-menu">ANA MENÜ</button>
      </div>
    `;
    this.overlay.innerHTML = html;

    const input = this.overlay.querySelector('#mp-name-input') as HTMLInputElement;
    setTimeout(() => input?.focus(), 100);

    this.overlay.querySelector('#btn-mp-name-submit')!.addEventListener('click', () => {
      playClick();
      const name = input.value.trim();
      if (!name) { input.classList.add('mp-input-error'); return; }
      this.callbacks.onMpNameSubmit?.(name);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const name = input.value.trim();
        if (name) this.callbacks.onMpNameSubmit?.(name);
      }
    });
    this.overlay.querySelector('#btn-mp-back-menu')!.addEventListener('click', () => {
      playClick(); this.callbacks.onMpBackToMenu?.();
    });
  }

  private showMpLobby() {
    // Visibility seçimi için varsayılan
    this.selectedVisibility = 'private';

    const html = `
      <div class="mp-screen mp-lobby-screen">
        <div class="mp-lobby-card">

          <!-- İsim satırı -->
          <div class="mp-lobby-name-row">
            <div class="mp-lobby-section-label">Yeni oyun</div>
            <button class="mp-change-name-btn" id="btn-mp-change-name">İsmi Değiştir</button>
          </div>

          <!-- Görünürlük seçici -->
          <div class="mp-visibility-picker" id="mp-vis-picker">
            <button class="mp-vis-btn active" data-vis="private">Özel</button>
            <button class="mp-vis-btn" data-vis="public">Açık</button>
            <button class="mp-vis-btn" data-vis="invite">İstekli</button>
          </div>

          <button class="btn btn-mode-multi mp-full-btn" id="btn-create-room">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            ODA OLUŞTUR
          </button>

          <div class="mp-lobby-divider">
            <span>veya bir odaya katıl</span>
          </div>

          <div class="mp-lobby-section">
            <div class="mp-lobby-section-label">Oda kodu</div>
            <input class="mp-code-input" id="mp-code-input" type="text"
              placeholder="X X X X" maxlength="4" autocomplete="off"
              inputmode="text" />
            <button class="btn btn-mode-thinking mp-full-btn" id="btn-join-room">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
              ODAYA KATIL
            </button>
          </div>

          <!-- Aktif odalar listesi -->
          <div class="mp-lobby-divider">
            <span>aktif odalar</span>
          </div>
          <div class="mp-rooms-section">
            <div class="mp-rooms-list" id="mp-rooms-list">
              <div class="mp-rooms-empty">Yükleniyor...</div>
            </div>
          </div>

        </div>

        <button class="mp-text-btn" id="btn-mp-back">← Geri</button>
      </div>
    `;
    this.overlay.innerHTML = html;

    const codeInput = this.overlay.querySelector('#mp-code-input') as HTMLInputElement;

    // Visibility picker
    this.overlay.querySelectorAll('.mp-vis-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.overlay.querySelectorAll('.mp-vis-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedVisibility = (btn as HTMLElement).dataset.vis as RoomVisibility;
      });
    });

    this.overlay.querySelector('#btn-mp-change-name')!.addEventListener('click', () => {
      playClick(); this.callbacks.onMpChangeName?.();
    });
    this.overlay.querySelector('#btn-create-room')!.addEventListener('click', () => {
      playClick(); this.callbacks.onMpCreateRoom?.(this.selectedVisibility);
    });
    this.overlay.querySelector('#btn-join-room')!.addEventListener('click', () => {
      playClick();
      const code = codeInput.value.trim().toUpperCase();
      if (code.length !== 4) {
        codeInput.classList.add('mp-input-error');
        codeInput.focus();
        return;
      }
      this.callbacks.onMpJoinRoom?.(code);
    });
    codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const code = codeInput.value.trim().toUpperCase();
        if (code.length === 4) this.callbacks.onMpJoinRoom?.(code);
      }
    });
    this.overlay.querySelector('#btn-mp-back')!.addEventListener('click', () => {
      playClick(); this.callbacks.onMpBackToMenu?.();
    });
  }

  private showMpWaiting(
    roomCode: string,
    isHost: boolean,
    players: Record<string, PlayerData>,
    selectedLevel: number,
    totalLevels: number
  ) {
    const connectedCount = Object.values(players).filter((p) => p.connected).length;
    const canStart = connectedCount >= 2;

    const hostControls = isHost ? `
      <div class="mp-waiting-controls">
        <div class="mp-level-picker">
          <button class="mp-picker-btn" id="btn-level-down">−</button>
          <input class="mp-level-input" id="mp-level-input" type="number"
            value="${selectedLevel}" min="1" max="${totalLevels}"
            inputmode="numeric" />
          <button class="mp-picker-btn" id="btn-level-up">+</button>
        </div>
        <button class="btn btn-mode-multi mp-full-btn" id="btn-mp-start" ${canStart ? '' : 'disabled'}>
          BAŞLAT
        </button>
        ${connectedCount < 2 ? '<div class="mp-waiting-hint-text">Oyunu başlatmak için en az 2 oyuncu gerekli</div>' : ''}
      </div>
      <div id="mp-join-request-section" class="mp-join-request-section"></div>
    ` : `
      <div class="mp-waiting-hint">
        <div class="mp-waiting-dots"><span></span><span></span><span></span></div>
        Host oyunu başlatmayı bekliyor
      </div>
    `;

    const html = `
      <div class="mp-screen mp-waiting-screen">
        <div class="mp-waiting-top">
          <div class="mp-room-code-label">Oda Kodu</div>
          <div class="mp-room-code">${roomCode}</div>
          <div class="mp-room-code-hint">Bu kodu arkadaşlarınla paylaş</div>
        </div>

        <div class="mp-player-list" id="mp-player-list">
          ${this.buildPlayerListHtml(players)}
        </div>

        ${hostControls}

        <button class="mp-text-btn mp-leave-btn" id="btn-mp-leave">Odadan ayrıl</button>
      </div>
    `;
    this.overlay.innerHTML = html;

    if (isHost) {
      const levelInput = this.overlay.querySelector('#mp-level-input') as HTMLInputElement;

      const getLevel = () => {
        const v = parseInt(levelInput.value, 10);
        if (isNaN(v) || v < 1) return 1;
        if (v > totalLevels) return totalLevels;
        return v;
      };
      const setLevel = (val: number) => {
        levelInput.value = String(Math.max(1, Math.min(totalLevels, val)));
      };

      this.overlay.querySelector('#btn-level-down')!.addEventListener('click', () => {
        setLevel(getLevel() - 1);
      });
      this.overlay.querySelector('#btn-level-up')!.addEventListener('click', () => {
        setLevel(getLevel() + 1);
      });
      levelInput.addEventListener('change', () => {
        setLevel(getLevel());
      });
      this.overlay.querySelector('#btn-mp-start')!.addEventListener('click', () => {
        playClick(); this.callbacks.onMpStartGame?.(getLevel());
      });
    }
    this.overlay.querySelector('#btn-mp-leave')!.addEventListener('click', () => {
      playClick(); this.callbacks.onMpLeave?.();
    });
  }

  private showMpGame(
    players: Record<string, PlayerData>,
    myId: string,
    roomCode: string
  ) {
    const scores: Record<string, number> = {};
    for (const pid of Object.keys(players)) scores[pid] = 0;

    const html = `
      <div class="mp-game-hud">
        <div class="mp-scores" id="mp-scores">
          ${this.buildScoreChipsHtml(players, scores, myId)}
        </div>
        <div class="mp-room-tag">${roomCode}</div>
        <div class="mp-countdown" id="mp-countdown" style="display:none"></div>
        <div class="mp-hud-actions">
          <button class="hud-btn mp-restart-btn" id="btn-mp-restart" title="Topu Sıfırla">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4"/></svg>
          </button>
          <button class="hud-btn mp-leave-game-btn" id="btn-mp-leave-game" title="Ayrıl">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </div>
    `;
    this.overlay.innerHTML = html;

    this.overlay.querySelector('#btn-mp-restart')!.addEventListener('click', () => {
      playClick(); this.callbacks.onMpRestart?.();
    });
    this.overlay.querySelector('#btn-mp-leave-game')!.addEventListener('click', () => {
      playClick(); this.callbacks.onMpLeave?.();
    });
  }

  private showMpResults(
    players: Record<string, PlayerData>,
    finalScores: Record<string, number>,
    myId: string
  ) {
    const sorted = Object.entries(players)
      .filter(([, p]) => p)
      .sort(([aid], [bid]) => (finalScores[bid] ?? 0) - (finalScores[aid] ?? 0));

    const medals = ['🥇', '🥈', '🥉', '4.'];
    let rankHtml = '';
    sorted.forEach(([pid, p], idx) => {
      const isMe    = pid === myId;
      const meClass = isMe ? ' mp-result-me' : '';
      const [gs]    = PAINT_GRADIENTS[p.colorIndex % PAINT_GRADIENTS.length];
      rankHtml += `
        <div class="mp-result-row${meClass}">
          <span class="mp-result-medal">${medals[idx] ?? ''}</span>
          <span class="mp-result-dot" style="background:${gs}"></span>
          <span class="mp-result-name">${p.name}${isMe ? ' (sen)' : ''}</span>
          <span class="mp-result-score">${finalScores[pid] ?? 0} karo</span>
        </div>
      `;
    });

    const html = `
      <div class="mp-screen mp-results-screen">
        <div class="mp-screen-title">Oyun Bitti!</div>
        <div class="mp-results-list">${rankHtml}</div>
        <div class="mp-results-actions">
          <button class="btn btn-mode-multi" id="btn-mp-again">TEKRAR OYNA</button>
          <button class="btn btn-secondary"  id="btn-mp-menu">ANA MENÜ</button>
        </div>
      </div>
    `;
    this.overlay.innerHTML = html;

    this.overlay.querySelector('#btn-mp-again')!.addEventListener('click', () => {
      playClick(); this.callbacks.onMpRequestRematch?.();
    });
    this.overlay.querySelector('#btn-mp-menu')!.addEventListener('click', () => {
      playClick(); this.callbacks.onMpBackToMenu?.();
    });
  }

  // -------------------------------------------------------
  // Yardımcı HTML parçaları
  // -------------------------------------------------------

  private buildPlayerListHtml(players: Record<string, PlayerData>): string {
    let html = '';
    for (const [, p] of Object.entries(players)) {
      if (!p) continue;
      const [gs]      = PAINT_GRADIENTS[p.colorIndex % PAINT_GRADIENTS.length];
      const connClass = p.connected ? '' : ' mp-player-disconnected';
      html += `
        <div class="mp-player-item${connClass}">
          <span class="mp-player-dot" style="background:${gs}"></span>
          <span class="mp-player-name">${p.name}</span>
          <span class="mp-player-status">${p.connected ? '●' : '○'}</span>
        </div>
      `;
    }
    return html || '<div class="mp-player-item">Bekleniyor...</div>';
  }

  private buildScoreChipsHtml(
    players: Record<string, PlayerData>,
    scores: Record<string, number>,
    myId: string
  ): string {
    return Object.entries(players)
      .map(([pid, p]) => {
        if (!p) return '';
        const [gs] = PAINT_GRADIENTS[p.colorIndex % PAINT_GRADIENTS.length];
        const isMe = pid === myId ? ' mp-score-me' : '';
        return `
          <div class="mp-score-chip${isMe}">
            <span class="mp-score-dot" style="background:${gs}"></span>
            <span class="mp-score-name">${p.name.slice(0, 6)}</span>
            <span class="mp-score-val">${scores[pid] ?? 0}</span>
          </div>
        `;
      })
      .join('');
  }

  // -------------------------------------------------------
  // Yardımcı
  // -------------------------------------------------------

  private darkenColor(hex: string, amount: number): string {
    const num = parseInt(hex.slice(1), 16);
    const r   = Math.max(0, ((num >> 16) & 0xff) - amount);
    const g   = Math.max(0, ((num >> 8)  & 0xff) - amount);
    const b   = Math.max(0, (num & 0xff)          - amount);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }
}
