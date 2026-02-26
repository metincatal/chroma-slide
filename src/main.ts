import './style.css';
import { Game } from './game/Game';
import { MultiplayerGame } from './multiplayer/MultiplayerGame';
import { db } from './multiplayer/FirebaseConfig';
import { ref, onValue, set, onDisconnect } from 'firebase/database';
import { PublicRoomEntry, RoomVisibility } from './multiplayer/RoomManager';
import { getOrCreatePlayerId } from './utils/storage';

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
let latestOnlineCount = 0;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = window.innerWidth  * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width  = window.innerWidth  + 'px';
  canvas.style.height = window.innerHeight + 'px';
  if (currentGame)   currentGame.resize(canvas.width, canvas.height, dpr);
  if (currentMpGame) currentMpGame.resize(canvas.width, canvas.height, dpr);
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

function startSinglePlayer() {
  if (currentMpGame) {
    currentMpGame.stop();
    currentMpGame = null;
  }
  currentGame = new Game(canvas, overlay);
  resize();
  currentGame.start();
  startRoomNotifier();
  // Menü render olduktan sonra online sayısını güncelle
  setTimeout(() => updateOnlineCountUI(latestOnlineCount), 50);
}

function startMultiplayer(pendingRoom?: { code: string; visibility: RoomVisibility }) {
  if (currentGame) {
    currentGame.stop();
    currentGame = null;
  }
  stopRoomNotifier();
  currentMpGame = new MultiplayerGame(canvas, overlay, () => startSinglePlayer(), pendingRoom);
  resize();
  currentMpGame.start();
}

window.addEventListener('resize', resize);

// ScreenManager'daki "Çok Oyunculu" butonu bu event'i tetikler
document.addEventListener('chroma:startMultiplayer', () => startMultiplayer());

startSinglePlayer();
