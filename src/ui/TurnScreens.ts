import {
  PAINT_GRADIENTS, MP_ARENA_SIZES, MP_ARENA_SIZE_NAMES, TURN_MOVE_OPTIONS, TurnSettings,
} from '../utils/constants';
import { playClick } from '../utils/sound';
import { TurnGameData } from '../multiplayer/TurnRoom';

// Sıralı mod ekranları. Mevcut çok oyunculu CSS sınıflarını yeniden kullanır.

export type TurnSettingsDraft = Omit<TurnSettings, 'arenaId'>;

export interface TurnGameSummary {
  code: string;
  opponents: string;
  status: 'my-turn' | 'their-turn' | 'waiting' | 'finished';
  statusText: string;
  updatedAt: number;
}

export interface TurnHomeHandlers {
  onBack: () => void;
  onCreate: (draft: TurnSettingsDraft) => void;
  onJoin: (code: string) => void;
  onOpen: (code: string) => void;
  onForget: (code: string) => void;
  onDraftChange: (draft: TurnSettingsDraft) => void;
}

export interface TurnWaitingHandlers {
  onStart: () => void;
  onLeave: () => void;
  onBack: () => void;
}

export interface TurnHudHandlers {
  onBack: () => void;
  onResign: () => void;
  onSkip: () => void;
}

export interface TurnHudInfo {
  code: string;
  isMyTurn: boolean;
  turnName: string;
  turnColor: string;
  myMovesLeft: number;
  totalMovesLeft: number;
  canSkip: boolean;
  resigned: boolean;
  chips: { name: string; color: string; score: number; isMe: boolean; active: boolean; resigned: boolean }[];
}

const ICON_BACK = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`;
const ICON_FLAG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`;
const ICON_SKIP = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>`;

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function seg(id: string, opts: { v: string; label: string }[], current: string): string {
  return `
    <div class="mp-seg" id="${id}">
      ${opts.map((o) => `<button class="mp-seg-btn${o.v === current ? ' active' : ''}" data-v="${o.v}">${o.label}</button>`).join('')}
    </div>`;
}

export class TurnScreens {
  constructor(private overlay: HTMLDivElement) {}

  // -------------------------------------------------------
  // Ana ekran: yeni oyun, kod ile katıl, oyunlarım
  // -------------------------------------------------------

  showHome(playerName: string, draft: TurnSettingsDraft, h: TurnHomeHandlers) {
    const d = { ...draft };
    this.overlay.innerHTML = `
      <div class="mp-screen mp-lobby-screen">
        <div class="mp-lobby-inner">
          <div class="mp-lobby-header">
            <button class="mp-lobby-back-btn" id="turn-back">${ICON_BACK}</button>
            <div class="mp-lobby-page-title">Sıralı Oyun</div>
            <div class="turn-name-tag">${esc(playerName)}</div>
          </div>

          <div class="turn-intro">
            Herkes sırayla tek hamle yapar. Aynı anda çevrimiçi olmanız gerekmez,
            sıra sana gelince oyuna dön.
          </div>

          <div class="mp-lobby-actions">
            <div class="mp-action-panel">
              <div class="mp-panel-label">Yeni Oyun</div>
              <div class="mp-setting-row">
                <span class="mp-setting-label">Boyut</span>
                ${seg('turn-size', MP_ARENA_SIZES.map((n) => ({ v: String(n), label: MP_ARENA_SIZE_NAMES[n] })), String(d.arenaSize))}
              </div>
              <div class="mp-setting-row">
                <span class="mp-setting-label">Hamle</span>
                ${seg('turn-moves', TURN_MOVE_OPTIONS.map((n) => ({ v: String(n), label: `${n}` })), String(d.movesPerPlayer))}
              </div>
              <div class="mp-setting-row">
                <span class="mp-setting-label">Çevirme</span>
                ${seg('turn-capture', [{ v: '1', label: 'Açık' }, { v: '0', label: 'Kapalı' }], d.capture ? '1' : '0')}
              </div>
              <div class="mp-setting-row">
                <span class="mp-setting-label">Çarpışma</span>
                ${seg('turn-collide', [{ v: '1', label: 'Açık' }, { v: '0', label: 'Kapalı' }], d.collide ? '1' : '0')}
              </div>
              <div class="mp-arena-info" id="turn-draft-info">${this.draftInfo(d)}</div>
              <button class="btn btn-mode-multi mp-panel-btn" id="turn-create">OYUN KUR</button>
            </div>

            <div class="mp-action-panel">
              <div class="mp-panel-label">Kod ile Katıl</div>
              <input class="mp-code-input" id="turn-code" type="text"
                placeholder="X X X X X" maxlength="5" autocomplete="off" inputmode="text" />
              <button class="btn btn-mode-thinking mp-panel-btn" id="turn-join">KATIL</button>
            </div>
          </div>

          <div class="mp-rooms-panel">
            <div class="mp-rooms-panel-title">Oyunlarım</div>
            <div class="mp-rooms-list" id="turn-list">
              <div class="mp-rooms-empty">Yükleniyor...</div>
            </div>
          </div>
        </div>
      </div>
    `;

    const bindSeg = (id: string, apply: (v: string) => void) => {
      const el = this.overlay.querySelector(`#${id}`);
      el?.querySelectorAll('.mp-seg-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          playClick();
          el.querySelectorAll('.mp-seg-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          apply((btn as HTMLElement).dataset.v ?? '');
          const info = this.overlay.querySelector('#turn-draft-info');
          if (info) info.textContent = this.draftInfo(d);
          h.onDraftChange({ ...d });
        });
      });
    };
    bindSeg('turn-size',    (v) => { d.arenaSize = parseInt(v, 10); });
    bindSeg('turn-moves',   (v) => { d.movesPerPlayer = parseInt(v, 10); });
    bindSeg('turn-capture', (v) => { d.capture = v === '1'; });
    bindSeg('turn-collide', (v) => { d.collide = v === '1'; });

    this.overlay.querySelector('#turn-back')!.addEventListener('click', () => { playClick(); h.onBack(); });
    this.overlay.querySelector('#turn-create')!.addEventListener('click', () => { playClick(); h.onCreate({ ...d }); });

    const input = this.overlay.querySelector('#turn-code') as HTMLInputElement;
    const join = () => {
      const code = input.value.trim().toUpperCase();
      if (code.length !== 5) { input.classList.add('mp-input-error'); input.focus(); return; }
      h.onJoin(code);
    };
    this.overlay.querySelector('#turn-join')!.addEventListener('click', () => { playClick(); join(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
    input.addEventListener('input', () => input.classList.remove('mp-input-error'));

    this.homeHandlers = h;
  }

  private homeHandlers: TurnHomeHandlers | null = null;

  private draftInfo(d: TurnSettingsDraft): string {
    const rules: string[] = [];
    if (d.capture) rules.push('alan çevirme');
    if (d.collide) rules.push('top çarpışması');
    const tail = rules.length ? ` · ${rules.join(' + ')}` : '';
    return `${MP_ARENA_SIZE_NAMES[d.arenaSize]} arena · oyuncu başına ${d.movesPerPlayer} hamle${tail}`;
  }

  updateGameList(items: TurnGameSummary[]) {
    const list = this.overlay.querySelector('#turn-list');
    if (!list) return;
    if (items.length === 0) {
      list.innerHTML = '<div class="mp-rooms-empty">Henüz sıralı oyunun yok</div>';
      return;
    }
    list.innerHTML = items.map((it) => `
      <div class="turn-card turn-card-${it.status}">
        <button class="turn-card-main" data-open="${it.code}">
          <span class="turn-card-code">${it.code}</span>
          <span class="turn-card-info">
            <span class="turn-card-opp">${esc(it.opponents)}</span>
            <span class="turn-card-status">${esc(it.statusText)}</span>
          </span>
        </button>
        ${it.status === 'finished' ? `<button class="turn-card-forget" data-forget="${it.code}" title="Listeden kaldır">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>` : ''}
      </div>
    `).join('');

    list.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => {
      playClick(); this.homeHandlers?.onOpen((b as HTMLElement).dataset.open!);
    }));
    list.querySelectorAll('[data-forget]').forEach((b) => b.addEventListener('click', () => {
      playClick(); this.homeHandlers?.onForget((b as HTMLElement).dataset.forget!);
    }));
  }

  // -------------------------------------------------------
  // Bekleme odası
  // -------------------------------------------------------

  showWaiting(game: TurnGameData, myId: string, h: TurnWaitingHandlers) {
    const isHost = game.hostId === myId;
    const players = Object.entries(game.players).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
    const canStart = players.length >= 2;

    this.overlay.innerHTML = `
      <div class="mp-screen mp-waiting-screen">
        <button class="mp-lobby-back-btn turn-float-back" id="turn-wait-back">${ICON_BACK}</button>
        <div class="mp-waiting-top">
          <div class="mp-room-code-label">Sıralı Oyun Kodu</div>
          <div class="mp-room-code">${game.code}</div>
          <div class="mp-room-code-hint">Kodu paylaş, arkadaşın ne zaman isterse katılsın</div>
          <button class="turn-foot-btn turn-copy-btn" id="turn-copy">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <span>Bağlantıyı kopyala</span>
          </button>
        </div>

        <div class="mp-player-list" id="turn-wait-players">
          ${players.map(([pid, p]) => {
            const [gs] = PAINT_GRADIENTS[p.colorIndex % PAINT_GRADIENTS.length];
            const hostTag = pid === game.hostId ? '<span class="turn-host-tag">kuran</span>' : '';
            return `
              <div class="mp-player-item">
                <span class="mp-player-dot" style="background:${gs}"></span>
                <span class="mp-player-name">${esc(p.name)}${pid === myId ? ' (sen)' : ''}</span>
                ${hostTag}
              </div>`;
          }).join('')}
        </div>

        <div class="mp-arena-info">${this.draftInfo(game.settings)} · Arena #${game.settings.arenaId}</div>

        ${isHost ? `
          <div class="mp-waiting-controls">
            <button class="btn btn-mode-multi mp-full-btn" id="turn-start" ${canStart ? '' : 'disabled'}>BAŞLAT</button>
            ${canStart ? '' : '<div class="mp-waiting-hint-text">Başlatmak için en az 2 oyuncu gerekli</div>'}
          </div>
        ` : `
          <div class="mp-waiting-hint">
            <div class="mp-waiting-dots"><span></span><span></span><span></span></div>
            Oyunu kuran kişinin başlatması bekleniyor
          </div>
        `}

        <button class="mp-text-btn mp-leave-btn" id="turn-leave">Oyundan ayrıl</button>
      </div>
    `;

    this.overlay.querySelector('#turn-wait-back')!.addEventListener('click', () => { playClick(); h.onBack(); });
    this.overlay.querySelector('#turn-copy')!.addEventListener('click', async () => {
      playClick();
      const url = `${location.origin}${location.pathname}?turn=${game.code}`;
      try {
        await navigator.clipboard.writeText(url);
        this.toast('Bağlantı kopyalandı');
      } catch {
        this.toast(url);
      }
    });
    this.overlay.querySelector('#turn-leave')!.addEventListener('click', () => { playClick(); h.onLeave(); });
    this.overlay.querySelector('#turn-start')?.addEventListener('click', () => { playClick(); h.onStart(); });
  }

  // -------------------------------------------------------
  // Oyun ekranı
  // -------------------------------------------------------

  showGame(info: TurnHudInfo, h: TurnHudHandlers) {
    // Eylem butonları sol üst sütunda: tahtanın altına koyunca tahtanın kenarını kapatıyordu
    this.overlay.innerHTML = `
      <div class="mp-game-hud turn-hud">
        <div class="turn-banner" id="turn-banner"></div>
        <div class="mp-scores" id="turn-scores"></div>
        <div class="mp-room-tag">${info.code}</div>
        <div class="mp-hud-actions">
          <button class="hud-btn" id="turn-back" title="Oyunlarım">${ICON_BACK}</button>
          <button class="hud-btn" id="turn-resign" title="Oyundan çekil">${ICON_FLAG}</button>
          <button class="hud-btn turn-skip-btn" id="turn-skip" title="Rakip süreyi aştı: sırasını geç">${ICON_SKIP}</button>
        </div>
      </div>
    `;
    this.overlay.querySelector('#turn-back')!.addEventListener('click', () => { playClick(); h.onBack(); });
    this.overlay.querySelector('#turn-resign')!.addEventListener('click', () => { playClick(); this.hudHandlers?.onResign(); });
    this.overlay.querySelector('#turn-skip')!.addEventListener('click', () => { playClick(); this.hudHandlers?.onSkip(); });
    this.hudHandlers = h;
    this.updateGame(info);
  }

  private hudHandlers: TurnHudHandlers | null = null;

  updateGame(info: TurnHudInfo) {
    const banner = this.overlay.querySelector('#turn-banner') as HTMLElement | null;
    if (banner) {
      banner.classList.toggle('turn-banner-mine', info.isMyTurn);
      banner.style.setProperty('--turn-color', info.turnColor);
      // Kısa tutuldu: uzun metin dar ekranda geri butonunun ve oyun kodunun üstüne biniyordu
      const sub = info.isMyTurn
        ? `${info.myMovesLeft} hamlen kaldı`
        : info.canSkip ? 'süre doldu' : `${info.totalMovesLeft} hamle kaldı`;
      const main = info.isMyTurn ? 'Sıra sende' : `Sıra: ${esc(info.turnName)}`;
      banner.innerHTML = `<span class="turn-banner-dot"></span><span class="turn-banner-text">${main}</span><span class="turn-banner-sub">${sub}</span>`;
    }

    const scores = this.overlay.querySelector('#turn-scores');
    if (scores) {
      scores.innerHTML = info.chips.map((c) => `
        <div class="mp-score-chip${c.isMe ? ' mp-score-me' : ''}${c.active ? ' turn-chip-active' : ''}${c.resigned ? ' turn-chip-resigned' : ''}">
          <span class="mp-score-dot" style="background:${c.color}"></span>
          <span class="mp-score-name">${esc(c.name.slice(0, 6))}</span>
          <span class="mp-score-val">${c.score}</span>
        </div>
      `).join('');
    }

    const resignBtn = this.overlay.querySelector('#turn-resign') as HTMLElement | null;
    if (resignBtn) resignBtn.style.display = info.resigned ? 'none' : '';

    // Sırasını geç yalnızca rakip süreyi aştığında görünür; sol sütunda durur, tahtayı kapatmaz
    const skipBtn = this.overlay.querySelector('#turn-skip') as HTMLElement | null;
    if (skipBtn) skipBtn.style.display = info.canSkip ? '' : 'none';

  }

  // Onay kutusu (çekilme gibi geri alınamaz işlemler)
  confirm(title: string, text: string, okLabel: string, onOk: () => void) {
    this.overlay.querySelector('.mp-rematch-dialog')?.remove();
    const el = document.createElement('div');
    el.className = 'mp-rematch-dialog';
    el.innerHTML = `
      <div class="mp-rematch-box">
        <div class="mp-rematch-title">${esc(title)}</div>
        <div class="turn-confirm-text">${esc(text)}</div>
        <div class="mp-rematch-actions">
          <button class="btn btn-mode-multi" id="turn-ok">${esc(okLabel)}</button>
          <button class="btn btn-secondary" id="turn-cancel">VAZGEÇ</button>
        </div>
      </div>
    `;
    this.overlay.appendChild(el);
    el.querySelector('#turn-ok')!.addEventListener('click', () => { playClick(); el.remove(); onOk(); });
    el.querySelector('#turn-cancel')!.addEventListener('click', () => { playClick(); el.remove(); });
  }

  // -------------------------------------------------------
  // Sonuç
  // -------------------------------------------------------

  showResults(
    rows: { name: string; color: string; score: number; pct: number; isMe: boolean; resigned: boolean }[],
    onHome: () => void
  ) {
    const sorted = [...rows].sort((a, b) => b.score - a.score);
    this.overlay.innerHTML = `
      <div class="mp-screen mp-results-screen">
        <div class="mp-screen-title">Oyun Bitti</div>
        <div class="mp-results-list">
          ${sorted.map((r, i) => `
            <div class="mp-result-row${r.isMe ? ' mp-result-me' : ''}">
              <span class="turn-rank turn-rank-${i + 1}">${i + 1}</span>
              <span class="mp-result-dot" style="background:${r.color}"></span>
              <span class="mp-result-name">${esc(r.name)}${r.isMe ? ' (sen)' : ''}${r.resigned ? ' <span class="turn-resigned-tag">çekildi</span>' : ''}</span>
              <span class="mp-result-score">${r.score} karo<span class="mp-result-pct">%${r.pct}</span></span>
            </div>
          `).join('')}
        </div>
        <div class="mp-results-actions">
          <button class="btn btn-mode-multi" id="turn-home">OYUNLARIM</button>
        </div>
      </div>
    `;
    this.overlay.querySelector('#turn-home')!.addEventListener('click', () => { playClick(); onHome(); });
  }

  toast(message: string, kind: 'info' | 'error' = 'info') {
    this.overlay.querySelectorAll('.mp-error-toast, .mp-info-toast').forEach((e) => e.remove());
    const el = document.createElement('div');
    // turn-toast: bilgi bildirimini alta alır; üstte sıra şeridinin üstüne biniyordu
    el.className = kind === 'error' ? 'mp-error-toast' : 'mp-info-toast turn-toast';
    el.textContent = message;
    this.overlay.appendChild(el);
    // Bilgi bildirimi gecisle gorunur olur; hata bildirimi kendi animasyonuyla gelir
    if (kind === 'info') requestAnimationFrame(() => el.classList.add('mp-info-toast-show'));
    setTimeout(() => el.remove(), 2800);
  }
}
