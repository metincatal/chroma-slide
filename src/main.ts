import './style.css';
import { Game } from './game/Game';
import { MultiplayerGame } from './multiplayer/MultiplayerGame';
import { TurnGame } from './multiplayer/TurnGame';
import { TurnRoom, nextSeatOf } from './multiplayer/TurnRoom';
import { scheduleCleanup } from './multiplayer/gcFirebase';
import { db } from './multiplayer/FirebaseConfig';
import { ref, onValue, set, onDisconnect } from 'firebase/database';
import { PublicRoomEntry, RoomVisibility } from './multiplayer/RoomManager';
import { getOrCreatePlayerId, getTurnGameCodes, removeTurnGameCode } from './utils/storage';

const canvas  = document.getElementById('game-canvas') as HTMLCanvasElement;
const overlay = document.getElementById('ui-overlay') as HTMLDivElement;

if (!canvas || !overlay) {
  throw new Error('Canvas veya UI overlay bulunamadı');
}

// Global bildirim katmanı — canvas ve overlay'in üzerinde
const globalNotifLayer = document.createElement('div');
globalNotifLayer.id = 'global-notif-layer';
document.body.appendChild(globalNotifLayer);

// -------------------------------------------------------
// Presence (aktif oyuncu sayısı)
// -------------------------------------------------------

// presence → rooms/_presence altında (mevcut rooms izni kapsamında çalışır)
const myPresenceId = getOrCreatePlayerId();
const presenceRef  = ref(db, `rooms/_presence/${myPresenceId}`);
set(presenceRef, true);
onDisconnect(presenceRef).remove();

function updateOnlineCountUI(count: number) {
  const el = overlay.querySelector('#online-count-text');
  if (el) el.textContent = count === 1 ? '1 kişi aktif' : `${count} kişi aktif`;
}

onValue(ref(db, 'rooms/_presence'), (snap) => {
  const data = snap.val();
  latestOnlineCount = data ? Object.keys(data).length : 0;
  updateOnlineCountUI(latestOnlineCount);
});

let currentGame:   Game | null            = null;
let currentMpGame: MultiplayerGame | null = null;
let currentTurnGame: TurnGame | null      = null;
let latestOnlineCount = 0;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = window.innerWidth  * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width  = window.innerWidth  + 'px';
  canvas.style.height = window.innerHeight + 'px';
  if (currentGame)     currentGame.resize(canvas.width, canvas.height, dpr);
  if (currentMpGame)   currentMpGame.resize(canvas.width, canvas.height, dpr);
  if (currentTurnGame) currentTurnGame.resize(canvas.width, canvas.height, dpr);
}

// -------------------------------------------------------
// Global oda bildirim dinleyicisi (tek oyunculu moddayken aktif)
// -------------------------------------------------------

let roomNotifUnsub: (() => void) | null = null;
const notifKnownRooms: Set<string> = new Set();
let notifFirstFetch = true;

function startRoomNotifier() {
  if (roomNotifUnsub) return;
  notifFirstFetch = true;
  notifKnownRooms.clear();

  roomNotifUnsub = onValue(ref(db, 'rooms/_index'), (snap) => {
    const raw = (snap.val() as Record<string, Omit<PublicRoomEntry, 'code'>>) || {};
    // Geçersiz kayıtları filtrele (zombie odalar)
    const rooms: PublicRoomEntry[] = Object.entries(raw)
      .filter(([, r]) => r?.hostName && r?.playerCount && r.playerCount > 0)
      .map(([code, r]) => ({ ...r, code }));

    if (notifFirstFetch) {
      rooms.forEach((r) => notifKnownRooms.add(r.code));
      notifFirstFetch = false;
      return;
    }

    for (const room of rooms) {
      if (notifKnownRooms.has(room.code)) continue;
      notifKnownRooms.add(room.code);
      showGlobalRoomNotif(room);
    }

    const active = new Set(rooms.map((r) => r.code));
    for (const code of notifKnownRooms) {
      if (!active.has(code)) notifKnownRooms.delete(code);
    }
  });
}

function stopRoomNotifier() {
  if (roomNotifUnsub) { roomNotifUnsub(); roomNotifUnsub = null; }
  globalNotifLayer.innerHTML = '';
}

function showGlobalRoomNotif(room: PublicRoomEntry) {
  if (globalNotifLayer.querySelectorAll('.global-room-notif').length >= 2) return;

  const isInvite = room.visibility === 'invite';
  const icon     = isInvite ? '🔒' : '🌐';
  const btnLabel = isInvite ? 'İstek Gönder' : 'Katıl';

  const el = document.createElement('div');
  el.className = 'global-room-notif';
  el.innerHTML = `
    <div class="global-notif-info">
      <span class="global-notif-icon">${icon}</span>
      <span class="global-notif-text"><strong>${room.hostName}</strong> oyun açtı</span>
    </div>
    <button class="global-notif-btn">${btnLabel}</button>
  `;
  globalNotifLayer.appendChild(el);

  requestAnimationFrame(() => el.classList.add('global-room-notif-show'));

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    el.classList.remove('global-room-notif-show');
    el.classList.add('global-room-notif-hide');
    setTimeout(() => el.remove(), 350);
  };

  el.querySelector('.global-notif-btn')!.addEventListener('click', () => {
    dismiss();
    startMultiplayer({ code: room.code, visibility: room.visibility });
  });

  setTimeout(dismiss, 5000);
}

// -------------------------------------------------------
// Oyun başlatma
// -------------------------------------------------------

function stopTurnGame() {
  if (currentTurnGame) {
    currentTurnGame.stop();
    currentTurnGame = null;
  }
}

function startSinglePlayer() {
  stopTurnGame();
  if (currentMpGame) {
    currentMpGame.stop();
    currentMpGame = null;
  }
  currentGame = new Game(canvas, overlay);
  resize();
  currentGame.start();
  startRoomNotifier();
  startTurnBadge();
  // Menü render olduktan sonra online sayısını güncelle
  setTimeout(() => updateOnlineCountUI(latestOnlineCount), 50);
}

function startMultiplayer(pendingRoom?: { code: string; visibility: RoomVisibility }) {
  stopTurnGame();
  if (currentGame) {
    currentGame.stop();
    currentGame = null;
  }
  stopRoomNotifier();
  stopTurnBadge();
  currentMpGame = new MultiplayerGame(canvas, overlay, () => startSinglePlayer(), pendingRoom);
  resize();
  currentMpGame.start();
}

// -------------------------------------------------------
// Sıralı oyun
// -------------------------------------------------------

function startTurnGame(openCode?: string, from: 'menu' | 'lobby' = 'menu') {
  if (currentGame)   { currentGame.stop();   currentGame = null; }
  if (currentMpGame) { currentMpGame.stop(); currentMpGame = null; }
  stopTurnGame();
  stopRoomNotifier();
  stopTurnBadge();

  // Geri tuşu geldiği yere dönsün
  const exit = from === 'lobby' ? () => startMultiplayer() : () => startSinglePlayer();
  currentTurnGame = new TurnGame(canvas, overlay, exit, openCode);
  resize();
  currentTurnGame.start();
}

// Ana menüdeki "sıra sende" rozeti: bu cihazdaki sıralı oyunları dinler
let turnBadgeUnsubs: (() => void)[] = [];
const turnBadgeState = new Map<string, boolean>();

function startTurnBadge() {
  stopTurnBadge();
  const codes = getTurnGameCodes().slice(0, 12);
  if (codes.length === 0) { renderTurnBadge(); return; }
  const myId = getOrCreatePlayerId();
  const room = new TurnRoom(db, myId);
  for (const code of codes) {
    turnBadgeUnsubs.push(room.listen(code, (game) => {
      // Temizlenmiş oyun: cihazdaki listeden de düş
      if (!game) { removeTurnGameCode(code); turnBadgeState.delete(code); renderTurnBadge(); return; }
      const seat = nextSeatOf(game);
      const mine = !!game && game.state === 'playing' && seat >= 0 && game.seatOrder[seat] === myId;
      turnBadgeState.set(code, mine);
      renderTurnBadge();
    }));
  }
}

function stopTurnBadge() {
  for (const u of turnBadgeUnsubs) u();
  turnBadgeUnsubs = [];
  turnBadgeState.clear();
  document.title = 'ChromaSlide';
}

function myTurnCodes(): string[] {
  return [...turnBadgeState.entries()].filter(([, mine]) => mine).map(([c]) => c);
}

function renderTurnBadge() {
  const codes = myTurnCodes();
  const badge = overlay.querySelector('#turn-menu-badge');
  const text  = overlay.querySelector('#turn-menu-badge-text');
  if (badge && text) {
    badge.classList.toggle('turn-menu-badge-show', codes.length > 0);
    text.textContent = codes.length === 1 ? 'Bir oyunda sıra sende' : `${codes.length} oyunda sıra sende`;
  }
  document.title = codes.length > 0 ? `(${codes.length}) Sıra sende · ChromaSlide` : 'ChromaSlide';
}

// Menü her çizildiğinde dinamik alanları yeniden doldur
document.addEventListener('chroma:menuShown', () => {
  updateOnlineCountUI(latestOnlineCount);
  renderTurnBadge();
});

document.addEventListener('chroma:openTurnBadge', () => {
  const codes = myTurnCodes();
  startTurnGame(codes.length === 1 ? codes[0] : undefined, 'menu');
});

document.addEventListener('chroma:startTurnGame', (e) => {
  const from = (e as CustomEvent<{ from?: 'menu' | 'lobby' }>).detail?.from ?? 'menu';
  startTurnGame(undefined, from);
});

window.addEventListener('resize', resize);

// ScreenManager'daki "Çok Oyunculu" butonu bu event'i tetikler
document.addEventListener('chroma:startMultiplayer', () => startMultiplayer());

// Eski oyun temizliği (cihaz başına 6 saatte bir, açılıştan birkaç saniye sonra)
scheduleCleanup(db, import.meta.env.VITE_FIREBASE_DATABASE_URL ?? '');

// Bağlantıyla açılış: ?turn=KOD
const turnParam = new URLSearchParams(window.location.search).get('turn');
if (turnParam && /^[A-Z0-9]{5}$/i.test(turnParam)) {
  startTurnGame(turnParam.toUpperCase(), 'menu');
} else {
  startSinglePlayer();
}
