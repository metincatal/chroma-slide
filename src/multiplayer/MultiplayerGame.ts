import { Renderer } from '../game/Renderer';
import { Ball } from '../game/Ball';
import { Level } from '../game/Level';
import { Input } from '../game/Input';
import { ScreenManager } from '../ui/ScreenManager';
import { generateArena, ARENA_COUNT } from '../levels/arena';
import {
  Direction, PATH, WALL, PAINT_GRADIENTS,
  MP_ROUND_DURATION_MS, MP_URGENT_SECONDS, MP_BOARD_FLUSH_MS, MP_END_GRACE_MS,
} from '../utils/constants';
import { getThemeById, ThemeConfig } from '../utils/themes';
import { getSelectedTheme, getMpName, saveMpName, getMpColorIndex, saveMpColorIndex, getOrCreatePlayerId, getDevRoundDurationMs } from '../utils/storage';
import { playSlide, playBump, playTick, playComplete, resumeAudio } from '../utils/sound';
import { db } from './FirebaseConfig';
import { RoomManager, PlayerData, RoomInfo, RoomVisibility, RematchData, BoardSync } from './RoomManager';
import { RemotePlayer } from './RemotePlayer';

// ===== ARENA MODU =====
// - Herkes ayrı köşeden başlar, boya çalmak serbest, süre dolunca en çok karo kazanır
// - Host yetkili: sahiplik gerçeği host'un tahtasıdır; istemciler tahmin eder,
//   snapshot gelince uzlaşır (host'un henüz uygulamadığı hamleler korunur)
export class MultiplayerGame {
  // Temel altyapı
  private canvas: HTMLCanvasElement;
  private renderer: Renderer;
  private input: Input;
  private screenManager: ScreenManager;
  private onBackToMenu: () => void;

  // Firebase
  private roomManager: RoomManager;
  private myPlayerId: string;
  private myName = '';
  private myColorIndex = 0;

  // Oda durumu
  private isHost = false;
  private roomCode = '';
  private players: Record<string, PlayerData> = {};
  private roomState: RoomInfo['state'] = 'waiting';
  private selectedLevel = 1;
  private roomVisibility: RoomVisibility = 'private';
  private roomHostId = '';

  // Oyun durumu
  private level: Level | null = null;
  private myBall: Ball | null = null;
  private remotePlayers: Map<string, RemotePlayer> = new Map();
  private tileColors: Map<string, number> = new Map(); // "y_x" → colorIndex (render için)

  // Koltuk ve sahiplik
  private seats: Record<string, number> = {};          // pid → koltuk (köşe)
  private seatOrder: string[] = [];                    // koltuk → pid
  private ownerSeat: Uint8Array = new Uint8Array(0);   // hücre → 0 (boş) | koltuk+1
  private pendingPaths: Map<string, Map<number, number[]>> = new Map(); // pid → seq → hücreler
  private applied: Record<string, number> = {};        // pid → uygulanan son seq (host yazar)
  private remoteRecordedSeq: Map<string, number> = new Map();
  private boardDirty = false;
  private lastFlushAt = 0;
  private lastScoreUiAt = 0;
  private lastSync: BoardSync | null = null;

  // Hamle yönetimi
  private moveSeq = 0;
  private myCurrentSeq = 0;
  private moveQueue: Direction[] = [];
  private readonly MAX_QUEUE = 3;
  private gameEnding = false;

  // Süre
  private gameStartAt = 0;
  private gameEndAt = 0;
  private lastTimerSec = -1;
  private deadlineReached = false;
  private deadlineAt = 0;
  private finishFallbackTimer = 0;

  // Animasyon döngüsü
  private animFrameId = 0;
  private lastTime = 0;

  // Rematch
  private rematchRequested = false;
  private rematchResolved = false;
  private pendingInfoMessage = '';

  // İstek onayı bekleme
  private approvalUnsub: (() => void) | null = null;

  // Lobide bilinen odalar (yeni oda tespiti için)
  private knownRoomCodes: Set<string> = new Set();

  // Bildirimden gelen bekleyen katılım (oda kodu + görünürlük)
  private pendingRoom: { code: string; visibility: RoomVisibility } | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    overlay: HTMLDivElement,
    onBackToMenu: () => void,
    pendingRoom?: { code: string; visibility: RoomVisibility }
  ) {
    this.pendingRoom  = pendingRoom ?? null;
    this.canvas       = canvas;
    this.onBackToMenu = onBackToMenu;

    this.renderer = new Renderer(canvas);
    const savedTheme = getThemeById(getSelectedTheme());
    this.renderer.setTheme(savedTheme);

    this.input = new Input(canvas, (dir) => this.handleSwipe(dir));
    this.input.setEnabled(false);

    this.myPlayerId  = getOrCreatePlayerId();
    this.roomManager = new RoomManager(db, this.myPlayerId);

    this.screenManager = new ScreenManager(
      overlay,
      ARENA_COUNT,
      {
        // Tek oyunculu callback'ler (mp ekranlarında kullanılmaz)
        onOnboardingDone: () => {},
        onSelectMode:  () => {},
        onSelectLevel: () => {},
        onBack:        () => {},
        onRestart:     () => {},
        onScreenshot:  () => {},
        onShowThemes:  () => {},
        onSelectTheme: (theme: ThemeConfig) => this.renderer.setTheme(theme),

        // --- Multiplayer callback'ler ---

        onMpNameSubmit: (name: string) => {
          this.myName       = name.trim() || 'Oyuncu';
          this.myColorIndex = getMpColorIndex();
          saveMpName(this.myName);
          saveMpColorIndex(this.myColorIndex);
          this.showLobby();
        },

        onMpChangeName: () => {
          this.screenManager.show('mp-name');
        },

        onMpCreateRoom: async (visibility: RoomVisibility = 'private') => {
          this.roomVisibility = visibility;
          try {
            const code = await this.roomManager.createRoom(
              this.myName, this.myColorIndex, visibility
            );
            this.roomCode = code;
            this.isHost   = true;
            this.enterWaiting();
          } catch (e) {
            this.screenManager.showMpError(`Oda oluşturulamadı: ${(e as Error).message}`);
          }
        },

        // Listeden direkt katılım (açık veya özel-kod giriş)
        onMpJoinFromList: (code: string) => this.joinPublicRoom(code),

        // Kod ile katılım
        onMpJoinRoom: (code: string) => this.joinPublicRoom(code),

        // İstekli odaya istek gönder
        onMpSendJoinRequest: (code: string) => this.sendInviteRequest(code),

        // Host: isteği onayla
        onMpApproveRequest: async (requesterId: string) => {
          const req = this.screenManager.getPendingRequest(requesterId);
          if (!req) return;
          try {
            await this.roomManager.approveRequest(
              requesterId, req.name, req.colorIndex
            );
          } catch (e) {
            this.screenManager.showMpError(`Onaylanamadı: ${(e as Error).message}`);
          }
        },

        // Host: isteği reddet
        onMpDeclineRequest: async (requesterId: string) => {
          try {
            await this.roomManager.declineRequest(requesterId);
          } catch (e) {
            this.screenManager.showMpError(`Reddedilemedi: ${(e as Error).message}`);
          }
        },

        // Host: oyunu başlat — koltukları dağıt, renk çakışmalarını çöz
        onMpStartGame: async (levelId: number) => {
          const connectedIds = Object.entries(this.players)
            .filter(([, p]) => p.connected)
            .map(([pid]) => pid)
            .sort();
          if (connectedIds.length < 2) {
            this.screenManager.showMpError('Oyunu başlatmak için en az 2 oyuncu gerekli');
            return;
          }
          this.selectedLevel = levelId;

          const seats: Record<string, number> = {};
          connectedIds.forEach((pid, i) => { seats[pid] = i; });

          const used = new Set<number>();
          const colorFixes: Record<string, number> = {};
          for (const pid of connectedIds) {
            let ci = (this.players[pid].colorIndex ?? 0) % PAINT_GRADIENTS.length;
            if (used.has(ci)) {
              ci = 0;
              while (used.has(ci)) ci++;
              colorFixes[pid] = ci;
            }
            used.add(ci);
          }

          try {
            await this.roomManager.startGame(levelId, seats, colorFixes, getDevRoundDurationMs() ?? MP_ROUND_DURATION_MS);
          } catch (e) {
            this.screenManager.showMpError(`Oyun başlatılamadı: ${(e as Error).message}`);
          }
        },

        onMpLeave: async () => {
          await this.handOverHostIfNeeded();
          await this.roomManager.leaveRoom();
          this.cleanup();
          this.onBackToMenu();
        },

        // Tekrar Oyna isteği gönder
        onMpRequestRematch: async () => {
          this.rematchRequested = true;
          try {
            await this.roomManager.requestRematch();
            this.screenManager.setRematchWaiting();
          } catch (e) {
            this.screenManager.showMpError(`Tekrar oyna isteği gönderilemedi: ${(e as Error).message}`);
          }
        },

        onMpAcceptRematch: async () => {
          try {
            await this.roomManager.respondToRematch(true);
          } catch (e) {
            this.screenManager.showMpError(`Yanıt gönderilemedi: ${(e as Error).message}`);
          }
        },

        onMpDeclineRematch: async () => {
          try {
            await this.roomManager.respondToRematch(false);
          } catch (e) { /* yoksay */ }
          await this.roomManager.leaveRoom();
          this.cleanup();
          this.onBackToMenu();
        },

        onMpPlayAgain: async () => {
          await this.roomManager.leaveRoom();
          this.cleanup();
          this.roomManager = new RoomManager(db, this.myPlayerId);
          this.showLobby();
        },

        onMpBackToMenu: async () => {
          await this.handOverHostIfNeeded();
          await this.roomManager.leaveRoom();
          this.cleanup();
          this.onBackToMenu();
        },
      },
      'thinking'
    );
  }

  // -------------------------------------------------------
  // Yaşam döngüsü
  // -------------------------------------------------------

  start() {
    this.lastTime = performance.now();
    this.loop(this.lastTime);

    const savedName = getMpName();
    if (savedName) {
      this.myName       = savedName;
      this.myColorIndex = getMpColorIndex();
      this.showLobby();
      if (this.pendingRoom) {
        const room = this.pendingRoom;
        this.pendingRoom = null;
        setTimeout(() => {
          if (room.visibility === 'invite') this.sendInviteRequest(room.code);
          else this.joinPublicRoom(room.code);
        }, 300);
      }
    } else {
      this.screenManager.show('mp-name');
    }
  }

  stop() {
    cancelAnimationFrame(this.animFrameId);
    this.input.setEnabled(false);
  }

  resize(width: number, height: number, dpr: number) {
    this.renderer.resize(width, height, dpr);
  }

  // -------------------------------------------------------
  // Oda katılım yardımcıları
  // -------------------------------------------------------

  private async joinPublicRoom(code: string) {
    try {
      await this.roomManager.joinRoom(code.toUpperCase(), this.myName, this.myColorIndex);
      this.roomCode = code.toUpperCase();
      this.isHost   = false;
      this.enterWaiting();
    } catch (e) {
      this.screenManager.showMpError(`Odaya katılamadı: ${(e as Error).message}`);
    }
  }

  private async sendInviteRequest(code: string) {
    const upperCode = code.toUpperCase();
    if (this.approvalUnsub) { this.approvalUnsub(); this.approvalUnsub = null; }
    try {
      await this.roomManager.sendJoinRequest(upperCode, this.myName, this.myColorIndex);
      this.roomCode = upperCode;
      this.isHost   = false;

      this.screenManager.showApprovalWaiting(upperCode, () => {
        if (this.approvalUnsub) { this.approvalUnsub(); this.approvalUnsub = null; }
        this.roomCode = '';
      });

      this.approvalUnsub = this.roomManager.listenForApproval(upperCode, () => {
        this.approvalUnsub = null;
        this.screenManager.hideApprovalWaiting();
        this.roomManager.setRoomCode(upperCode);
        this.roomManager.setupOnDisconnect();
        this.enterWaiting();
      });
    } catch (e) {
      this.screenManager.showMpError(`İstek gönderilemedi: ${(e as Error).message}`);
    }
  }

  // Host ayrılırken: kimse yoksa listeden sil, açık odada host'u devret
  private async handOverHostIfNeeded() {
    if (!this.isHost) return;
    const connectedOthers = Object.entries(this.players)
      .filter(([pid, p]) => pid !== this.myPlayerId && p.connected);
    if (connectedOthers.length === 0) {
      try { await this.roomManager.removePublicRoom(); } catch { /* yoksay */ }
    } else if (this.roomVisibility !== 'invite' && this.roomVisibility !== 'private') {
      const sorted = connectedOthers.sort(([a], [b]) => a.localeCompare(b));
      try { await this.roomManager.transferHost(sorted[0][0]); } catch { /* yoksay */ }
    }
  }

  // -------------------------------------------------------
  // Lobi
  // -------------------------------------------------------

  private showLobby() {
    if (this.approvalUnsub) { this.approvalUnsub(); this.approvalUnsub = null; }
    this.knownRoomCodes = new Set();
    this.screenManager.show('mp-lobby', { playerName: this.myName });

    let firstFetch = true;

    this.roomManager.listenToPublicRooms((rooms) => {
      this.screenManager.updatePublicRooms(rooms);

      if (firstFetch) {
        for (const r of rooms) this.knownRoomCodes.add(r.code);
        firstFetch = false;
        return;
      }

      for (const room of rooms) {
        if (this.knownRoomCodes.has(room.code)) continue;
        this.knownRoomCodes.add(room.code);
        if (room.code === this.roomCode) continue; // Kendi odam

        this.screenManager.showRoomNotification(
          room.hostName,
          room.visibility,
          () => {
            if (room.visibility === 'invite') {
              this.sendInviteRequest(room.code);
            } else {
              this.joinPublicRoom(room.code);
            }
          }
        );
      }

      const activeCodes = new Set(rooms.map((r) => r.code));
      for (const code of this.knownRoomCodes) {
        if (!activeCodes.has(code)) this.knownRoomCodes.delete(code);
      }
    });
  }

  // -------------------------------------------------------
  // Bekleme odası
  // -------------------------------------------------------

  private enterWaiting() {
    this.screenManager.show('mp-waiting', {
      roomCode:      this.roomCode,
      isHost:        this.isHost,
      players:       {},
      selectedLevel: this.selectedLevel,
      totalLevels:   ARENA_COUNT,
    });

    // Host + invite odası: join isteklerini dinle
    if (this.isHost && this.roomVisibility === 'invite') {
      this.roomManager.onJoinRequests((requests) => {
        this.screenManager.updateMpJoinRequests(requests);
      });
    }

    // Oyuncu değişikliklerini dinle
    this.roomManager.onPlayersChange((players) => {
      this.players = players;
      this.screenManager.updateMpWaiting(players, this.roomCode, this.isHost, this.selectedLevel);

      const connected = Object.values(players).filter((p) => p.connected);

      if (this.isHost && this.roomVisibility !== 'private') {
        if (connected.length >= 1) {
          this.roomManager.updatePublicRoomCount(connected.length).catch(() => {});
        } else {
          this.roomManager.removePublicRoom().catch(() => {});
        }
      }

      if (Object.keys(players).length > 0 && connected.length === 0) {
        this.roomManager.leaveRoom();
        this.cleanup();
        this.onBackToMenu();
        return;
      }

      // Host ayrıldıysa ve ben host değilsem
      if (this.roomHostId && players[this.roomHostId] && !players[this.roomHostId].connected && !this.isHost) {
        const capturedHostId = this.roomHostId;
        setTimeout(() => {
          if (this.roomHostId !== capturedHostId || this.isHost) return;

          if (this.roomVisibility === 'invite' || this.roomVisibility === 'private') {
            this.screenManager.showMpError('Host odadan ayrıldı. Oda kapatılıyor...');
            setTimeout(() => {
              this.roomManager.leaveRoom();
              this.cleanup();
              this.onBackToMenu();
            }, 2000);
          } else {
            const sorted = Object.entries(players)
              .filter(([, p]) => p.connected)
              .sort(([a], [b]) => a.localeCompare(b));
            if (sorted.length > 0 && sorted[0][0] === this.myPlayerId) {
              this.roomManager.transferHost(this.myPlayerId).catch(() => {});
            }
          }
        }, 800);
      }
    });

    // Oda durumu değişimini dinle
    this.roomManager.onRoomChange((info) => {
      this.selectedLevel = info.levelId;
      if (info.visibility) this.roomVisibility = info.visibility;
      if (info.seats) this.seats = info.seats;

      // Host değişimini takip et
      const prevHostId = this.roomHostId;
      this.roomHostId = info.hostId;
      if (prevHostId && prevHostId !== info.hostId && info.hostId === this.myPlayerId) {
        this.isHost = true;
        const connectedCount = Object.values(this.players).filter((p) => p.connected).length;

        if (this.roomState === 'playing') {
          // Oyun ortasında host oldum: tahta yayınını ben devralıyorum
          this.boardDirty = true;
          this.screenManager.showMpInfo('Artık Host Sensin');
        } else if (this.roomState !== 'finished') {
          const msg = connectedCount >= 2 ? 'Artık Host Sensin! Oyunu başlatabilirsin.' : 'Artık Host Sensin';
          this.screenManager.showMpInfo(msg);
          this.screenManager.updateMpWaiting(this.players, this.roomCode, true, this.selectedLevel);
        }
      }

      if (info.state === 'countdown' && this.gameStartAt === 0) {
        this.gameStartAt = info.gameStartAt ?? this.roomManager.serverNow() + 3000;
        this.gameEndAt   = info.gameEndAt ?? this.gameStartAt + MP_ROUND_DURATION_MS;
        this.seats       = info.seats ?? {};
        this.screenManager.show('mp-game', {
          players:  this.players,
          myId:     this.myPlayerId,
          roomCode: this.roomCode,
        });
        this.startCountdown(this.gameStartAt);
      }

      if (info.state === 'finished') {
        this.onGameFinished();
      }

      // Host resetForRematch() çağırdığında state 'waiting' döner
      if (info.state === 'waiting' && this.roomState === 'finished') {
        this.onRematchReset();
      }
    });

    // Rematch dinleyicisi (oyun bittikten sonra da geçerli)
    this.roomManager.onRematchChange((rematch) => {
      if (!rematch) return;
      if (rematch.requestedBy !== this.myPlayerId && !rematch.accepted?.[this.myPlayerId]) {
        const requester = this.players[rematch.requestedBy];
        this.screenManager.showRematchDialog(
          requester?.name ?? '?',
          () => this.callbacks_onMpAcceptRematch(),
          () => this.callbacks_onMpDeclineRematch()
        );
      }
      this.checkRematchResolution(rematch);
    });
  }

  private async callbacks_onMpAcceptRematch() {
    try {
      await this.roomManager.respondToRematch(true);
    } catch { /* yoksay */ }
  }

  private async callbacks_onMpDeclineRematch() {
    try {
      await this.roomManager.respondToRematch(false);
    } catch { /* yoksay */ }
    await this.roomManager.leaveRoom();
    this.cleanup();
    this.onBackToMenu();
  }

  private checkRematchResolution(rematch: RematchData) {
    if (this.rematchResolved) return;

    const accepted = rematch.accepted ?? {};
    const declinedIds = Object.entries(accepted)
      .filter(([, v]) => !v)
      .map(([k]) => k);

    for (const pid of declinedIds) {
      if (pid === this.myPlayerId) {
        this.rematchResolved = true;
        this.roomManager.leaveRoom();
        this.cleanup();
        this.onBackToMenu();
        return;
      }
    }

    const connectedPlayerIds = Object.entries(this.players)
      .filter(([, p]) => p.connected)
      .map(([pid]) => pid)
      .filter((pid) => pid !== rematch.requestedBy);

    if (connectedPlayerIds.length === 0) return;

    const allAnswered = connectedPlayerIds.every((pid) => accepted[pid] !== undefined);
    if (!allAnswered) return;

    const someAccepted = Object.values(accepted).some((v) => v);
    if (!someAccepted) {
      this.rematchResolved = true;
      this.roomManager.leaveRoom();
      this.cleanup();
      this.onBackToMenu();
      return;
    }

    this.rematchResolved = true;
    if (this.isHost) {
      this.roomManager.resetForRematch().catch(console.error);
    }
  }

  // Host resetForRematch() sonrası TÜM oyuncular buraya gelir (onRoomChange tetikler)
  private onRematchReset() {
    this.resetGameState();
    this.roomManager.cleanupListeners();
    this.enterWaiting();

    if (this.pendingInfoMessage) {
      const msg = this.pendingInfoMessage;
      this.pendingInfoMessage = '';
      this.screenManager.showMpInfo(msg);
    }
  }

  // -------------------------------------------------------
  // Geri sayım
  // -------------------------------------------------------

  private startCountdown(startAt: number) {
    const tick = () => {
      const remaining = Math.ceil((startAt - this.roomManager.serverNow()) / 1000);
      if (remaining > 0) {
        this.screenManager.updateMpCountdown(remaining);
        setTimeout(tick, 100);
      } else {
        this.screenManager.updateMpCountdown(0);
        this.launchGame();
      }
    };
    tick();
  }

  // -------------------------------------------------------
  // Oyun başlatma
  // -------------------------------------------------------

  private launchGame() {
    // Geri sayım sırasında katılan oyuncunun koltuğu yoktur
    if (this.seats[this.myPlayerId] === undefined) {
      this.screenManager.showMpError('Oyun sen katılmadan başlatıldı.');
      this.roomManager.leaveRoom().finally(() => {
        this.cleanup();
        this.onBackToMenu();
      });
      return;
    }

    const levelData = generateArena(this.selectedLevel);
    const starts    = levelData.starts ?? [{ x: levelData.startX, y: levelData.startY }];
    const w         = levelData.width;

    this.seatOrder = Object.entries(this.seats)
      .sort((a, b) => a[1] - b[1])
      .map(([pid]) => pid);

    this.level      = new Level(levelData);
    this.ownerSeat  = new Uint8Array(w * levelData.height);
    this.tileColors = new Map();
    this.remotePlayers.clear();
    this.pendingPaths      = new Map();
    this.applied           = {};
    this.remoteRecordedSeq = new Map();
    this.lastSync          = null;
    this.moveSeq      = 0;
    this.myCurrentSeq = 0;
    this.moveQueue    = [];
    this.gameEnding      = false;
    this.deadlineReached = false;
    this.lastTimerSec    = -1;
    this.boardDirty  = false;
    this.lastFlushAt = 0;
    this.renderer.invalidateStatic();

    const mySeat  = this.seats[this.myPlayerId];
    const myStart = starts[mySeat % starts.length];
    this.myBall   = new Ball(myStart.x, myStart.y);

    this.seatOrder.forEach((pid, seat) => {
      const pdata = this.players[pid];
      const start = starts[seat % starts.length];
      this.applied[pid] = 0;
      if (pid === this.myPlayerId) {
        this.myColorIndex = pdata?.colorIndex ?? this.myColorIndex;
      } else if (pdata) {
        const rp = new RemotePlayer(start.x, start.y, pdata.colorIndex, pdata.name);
        rp.connected = pdata.connected;
        this.remotePlayers.set(pid, rp);
      }
      // Köşeler baştan sahipli
      this.setOwner(start.y * w + start.x, seat, true);
    });

    // Uzak hamleleri dinle
    this.roomManager.onRemoteMove((pid, dir, seq) => {
      const rp = this.remotePlayers.get(pid);
      if (rp) rp.addMove(dir, seq);
    });

    // Host tahtasını dinle (host kendi snapshot'ını yok sayar)
    this.roomManager.onBoardChange((sync) => {
      this.lastSync = sync;
      this.applyBoard(sync, false);
    });

    // Oyuncu bağlantı değişimleri
    this.roomManager.onPlayersChange((players) => {
      const newlyDisconnected = Object.entries(players)
        .filter(([pid, p]) => !p.connected && this.players[pid]?.connected)
        .map(([, p]) => p.name);

      this.players = players;
      for (const [pid, rp] of this.remotePlayers) {
        rp.connected = players[pid]?.connected ?? false;
        if (players[pid]) rp.colorIndex = players[pid].colorIndex;
      }
      this.rebuildTileColors();

      const connected = Object.values(players).filter((p) => p.connected);
      if (connected.length <= 1 && !this.gameEnding) {
        this.onGameFinished();
      }

      // Sonuç ekranındayken birisi ayrıldıysa
      if (this.roomState === 'finished') {
        if (connected.length === 0) {
          this.screenManager.hideRematchButton();
        } else if (connected.length === 1) {
          if (newlyDisconnected.length > 0) {
            this.screenManager.showMpError(`${newlyDisconnected[0]} odayı terk etti.`);
          }
          setTimeout(() => {
            const stillConnected = Object.values(this.players).filter((p) => p.connected).length;
            if (this.isHost && this.roomState === 'finished' && stillConnected <= 1) {
              this.pendingInfoMessage = 'Artık Host Sensin! Yeni oyuncu bekleniyor...';
              this.roomManager.resetForRematch().then(() => {
                if (this.roomVisibility !== 'private') {
                  this.roomManager.republishRoom(
                    this.myName, 1, this.roomVisibility as 'public' | 'invite'
                  ).catch(() => {});
                }
              }).catch(() => {});
            }
          }, 1200);
        }
      }
      this.screenManager.updateMpGameScores(players, this.myPlayerId, this.tileColors);
    });

    this.input.setEnabled(true);
    this.roomState = 'playing';
  }

  // -------------------------------------------------------
  // Sahiplik (tahta)
  // -------------------------------------------------------

  private colorOfSeat(seat: number): number {
    const pid = this.seatOrder[seat];
    return this.players[pid]?.colorIndex ?? seat;
  }

  private getPending(pid: string): Map<number, number[]> {
    let m = this.pendingPaths.get(pid);
    if (!m) { m = new Map(); this.pendingPaths.set(pid, m); }
    return m;
  }

  // Bir hücreyi koltuğa ver. Yol karosu ilk kez boyanıyorsa veya sahibi değişiyorsa animasyon tetiklenir.
  private setOwner(idx: number, seat: number, markDirty: boolean) {
    if (!this.level) return;
    if (this.level.grid[idx] === WALL) return;
    const w = this.level.data.width;
    const x = idx % w, y = (idx - x) / w;

    const isNewTile = this.level.grid[idx] === PATH;
    const prev = this.ownerSeat[idx];
    if (!isNewTile && prev === seat + 1) return;

    this.level.paintTileMultiplayer(x, y);
    this.ownerSeat[idx] = seat + 1;
    this.tileColors.set(`${y}_${x}`, this.colorOfSeat(seat));
    if (markDirty) this.boardDirty = true;
  }

  private rebuildTileColors() {
    if (!this.level) return;
    const w = this.level.data.width;
    for (let idx = 0; idx < this.ownerSeat.length; idx++) {
      const v = this.ownerSeat[idx];
      if (v === 0) continue;
      const x = idx % w, y = (idx - x) / w;
      this.tileColors.set(`${y}_${x}`, this.colorOfSeat(v - 1));
    }
  }

  private encodeBoard(): string {
    let s = '';
    for (let i = 0; i < this.ownerSeat.length; i++) {
      s += String.fromCharCode(48 + this.ownerSeat[i]);
    }
    return s;
  }

  private flushBoard() {
    this.boardDirty  = false;
    this.lastFlushAt = performance.now();
    this.roomManager.writeBoard(this.encodeBoard(), { ...this.applied }).catch(() => {});
  }

  // Host snapshot'ını uygula. force=false iken host'un henüz uygulamadığı
  // hamlelerin (seq > applied) karoları yerel tahmin olarak korunur.
  private applyBoard(sync: BoardSync, force: boolean) {
    if (!this.level) return;
    if (this.isHost && !force) return;

    const { board, applied } = sync;
    const n = Math.min(board.length, this.ownerSeat.length);

    const protectedCells = new Set<number>();
    if (!force) {
      for (const [pid, paths] of this.pendingPaths) {
        const ap = applied[pid] ?? 0;
        for (const [seq, cells] of paths) {
          if (seq <= ap) { paths.delete(seq); continue; }
          for (const c of cells) protectedCells.add(c);
        }
      }
    }

    for (let idx = 0; idx < n; idx++) {
      const v = board.charCodeAt(idx) - 48;
      if (v <= 0 || this.ownerSeat[idx] === v) continue;
      if (protectedCells.has(idx)) continue;
      this.setOwner(idx, v - 1, false);
    }
  }

  private computeScores(): Record<string, number> {
    const counts = new Array<number>(this.seatOrder.length).fill(0);
    for (let i = 0; i < this.ownerSeat.length; i++) {
      const v = this.ownerSeat[i];
      if (v > 0 && v - 1 < counts.length) counts[v - 1]++;
    }
    const scores: Record<string, number> = {};
    for (const pid of Object.keys(this.players)) scores[pid] = 0;
    this.seatOrder.forEach((pid, i) => { scores[pid] = counts[i]; });
    return scores;
  }

  // -------------------------------------------------------
  // Hamle işleme
  // -------------------------------------------------------

  private handleSwipe(dir: Direction) {
    if (!this.level || !this.myBall) return;
    if (this.roomState !== 'playing' || this.gameEnding || this.deadlineReached) return;

    resumeAudio();

    if (this.myBall.animating) {
      if (this.moveQueue.length < this.MAX_QUEUE) this.moveQueue.push(dir);
      return;
    }

    this.executeMove(dir);
  }

  private executeMove(dir: Direction) {
    if (!this.level || !this.myBall || this.deadlineReached) return;
    const w = this.level.data.width;

    const result = this.myBall.calculateSlide(dir, this.level.grid, w, this.level.data.height);

    if (!result) {
      playBump();
      if (this.moveQueue.length > 0) this.executeMove(this.moveQueue.shift()!);
      return;
    }

    const seq = ++this.moveSeq;
    this.myCurrentSeq = seq;
    this.getPending(this.myPlayerId).set(seq, result.path.map((t) => t.y * w + t.x));

    playSlide();
    this.myBall.startSlide(result);
    this.roomManager.sendMove(dir, seq).catch(() => {});
  }

  // -------------------------------------------------------
  // Oyun döngüsü
  // -------------------------------------------------------

  private loop = (time: number) => {
    const dt = time - this.lastTime;
    this.lastTime = time;

    if (this.roomState === 'playing' && this.level && this.myBall) {
      this.update(dt);
      this.updateTimer();
      this.renderer.renderMultiplayer(
        this.level,
        this.myBall,
        this.myColorIndex,
        Array.from(this.remotePlayers.values()),
        this.tileColors
      );
    }

    this.animFrameId = requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    if (!this.level || !this.myBall || this.gameEnding) return;
    const w = this.level.data.width;
    const h = this.level.data.height;
    const mySeat = this.seats[this.myPlayerId] ?? 0;

    // Kendi topum
    const myPainted = this.myBall.update(dt);
    if (myPainted) {
      for (const t of myPainted) this.setOwner(t.y * w + t.x, mySeat, true);
      if (!this.myBall.animating) {
        this.applied[this.myPlayerId] = this.myCurrentSeq;
        if (!this.deadlineReached && this.moveQueue.length > 0) {
          this.executeMove(this.moveQueue.shift()!);
        }
      }
    }

    // Uzak toplar
    for (const [pid, rp] of this.remotePlayers) {
      if (!rp.connected) continue;
      const seat = this.seats[pid];
      if (seat === undefined) continue;

      const painted = rp.update(dt, this.level.grid, w, h);
      if (painted) {
        for (const t of painted) this.setOwner(t.y * w + t.x, seat, true);
      }

      if (rp.ball.animating) {
        // Yeni bir kayma başladıysa yolunu bekleyenlere kaydet (snapshot uzlaşması için)
        const seq = rp.currentSeq;
        if (this.remoteRecordedSeq.get(pid) !== seq) {
          this.remoteRecordedSeq.set(pid, seq);
          this.getPending(pid).set(seq, rp.ball.animPath.map((t) => t.y * w + t.x));
        }
      } else {
        this.applied[pid] = rp.currentSeq;
      }
    }

    const now = performance.now();

    // Host: tahtayı yayınla
    if (this.isHost && this.boardDirty && now - this.lastFlushAt >= MP_BOARD_FLUSH_MS) {
      this.flushBoard();
    }

    // Host: süre doldu → havadaki kaymalar bitince (veya tolerans sonunda) kapat
    if (this.isHost && this.deadlineReached) {
      let idle = !this.myBall.animating;
      for (const rp of this.remotePlayers.values()) {
        if (rp.connected && (rp.ball.animating || rp.hasPending)) idle = false;
      }
      if (idle || now - this.deadlineAt > MP_END_GRACE_MS) this.hostFinish();
    }

    // Skor çipleri (saniyede 5)
    if (now - this.lastScoreUiAt > 200) {
      this.lastScoreUiAt = now;
      this.screenManager.updateMpGameScores(this.players, this.myPlayerId, this.tileColors);
    }
  }

  // -------------------------------------------------------
  // Süre
  // -------------------------------------------------------

  private updateTimer() {
    if (this.gameEndAt <= 0 || this.gameEnding) return;

    const remainMs = this.gameEndAt - this.roomManager.serverNow();
    const sec = Math.max(0, Math.ceil(remainMs / 1000));

    if (sec !== this.lastTimerSec) {
      this.lastTimerSec = sec;
      this.screenManager.updateMpTimer(sec, sec <= MP_URGENT_SECONDS);
      if (sec > 0 && sec <= 5) playTick();
    }

    if (remainMs <= 0 && !this.deadlineReached) this.onDeadline();
  }

  private onDeadline() {
    this.deadlineReached = true;
    this.deadlineAt = performance.now();
    this.moveQueue = [];
    this.input.setEnabled(false);

    // Host 'finished' yazamazsa (bağlantı sorunu) yerel sonuçla bitir
    this.finishFallbackTimer = window.setTimeout(() => {
      if (this.roomState === 'playing') this.onGameFinished();
    }, 3000);
  }

  // -------------------------------------------------------
  // Oyun bitiş
  // -------------------------------------------------------

  // Host: son tahtayı yayınla, skorları yaz, odayı bitir
  private hostFinish() {
    if (this.gameEnding) return;
    this.gameEnding = true;
    this.input.setEnabled(false);
    this.flushBoard();
    this.roomManager.updateScores(this.computeScores()).catch(() => {});
    this.roomManager.finishGame().catch(() => {});
  }

  private onGameFinished() {
    if (this.roomState === 'finished') return;
    this.roomState  = 'finished';
    this.gameEnding = true;
    this.input.setEnabled(false);
    this.rematchRequested = false;
    if (this.finishFallbackTimer) {
      clearTimeout(this.finishFallbackTimer);
      this.finishFallbackTimer = 0;
    }

    // Son sözü host söyler: bekleyen tahminleri bırak, son snapshot'ı olduğu gibi al
    if (!this.isHost && this.lastSync) this.applyBoard(this.lastSync, true);

    playComplete();

    this.screenManager.show('mp-results', {
      players:     this.players,
      finalScores: this.computeScores(),
      myId:        this.myPlayerId,
      totalTiles:  this.level?.totalPathTiles ?? 0,
    });
  }

  // -------------------------------------------------------
  // Temizlik
  // -------------------------------------------------------

  // Oyun içi durumu sıfırla (roomCode ve isHost korunur)
  private resetGameState() {
    this.level  = null;
    this.myBall = null;
    this.remotePlayers.clear();
    this.tileColors = new Map();
    this.seats      = {};
    this.seatOrder  = [];
    this.ownerSeat  = new Uint8Array(0);
    this.pendingPaths      = new Map();
    this.applied           = {};
    this.remoteRecordedSeq = new Map();
    this.boardDirty = false;
    this.lastSync   = null;
    this.moveSeq      = 0;
    this.myCurrentSeq = 0;
    this.moveQueue    = [];
    this.gameStartAt = 0;
    this.gameEndAt   = 0;
    this.lastTimerSec    = -1;
    this.deadlineReached = false;
    this.deadlineAt      = 0;
    if (this.finishFallbackTimer) {
      clearTimeout(this.finishFallbackTimer);
      this.finishFallbackTimer = 0;
    }
    this.roomState  = 'waiting';
    this.gameEnding = false;
    this.rematchRequested = false;
    this.rematchResolved  = false;
    this.input.setEnabled(false);
    this.renderer.stopConfetti();
  }

  private cleanup() {
    if (this.approvalUnsub) { this.approvalUnsub(); this.approvalUnsub = null; }
    this.resetGameState();
    this.roomHostId = '';
  }
}
