import { Renderer } from '../game/Renderer';
import { Ball } from '../game/Ball';
import { Level } from '../game/Level';
import { Input } from '../game/Input';
import { ScreenManager } from '../ui/ScreenManager';
import { getLevelById, getTotalLevels } from '../levels/index';
import { Direction, PAINT_GRADIENTS } from '../utils/constants';
import { getThemeById, ThemeConfig } from '../utils/themes';
import { getSelectedTheme, getMpName, saveMpName, getMpColorIndex, saveMpColorIndex } from '../utils/storage';
import { playSlide, playBump, resumeAudio } from '../utils/sound';
import { db } from './FirebaseConfig';
import { RoomManager, PlayerData, RoomInfo, RoomVisibility, PublicRoomEntry, JoinRequest, RematchData } from './RoomManager';
import { RemotePlayer } from './RemotePlayer';

// localStorage'da kalıcı oyuncu kimliği
function getOrCreatePlayerId(): string {
  let id = localStorage.getItem('chroma_mp_id');
  if (!id) {
    id = `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    localStorage.setItem('chroma_mp_id', id);
  }
  return id;
}

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

  // Oyun durumu
  private level: Level | null = null;
  private myBall: Ball | null = null;
  private remotePlayers: Map<string, RemotePlayer> = new Map();
  private tileColors: Map<string, number> = new Map(); // "y_x" → colorIndex

  // Hamle yönetimi
  private moveSeq   = 0;
  private moveQueue: Direction[] = [];
  private readonly MAX_QUEUE = 3;
  private gameEnding = false;

  // Geri sayım
  private gameStartAt  = 0;

  // Animasyon döngüsü
  private animFrameId = 0;
  private lastTime    = 0;

  // Rematch — "TEKRAR OYNA" butonuna basıldı mı
  private rematchRequested = false;

  constructor(canvas: HTMLCanvasElement, overlay: HTMLDivElement, onBackToMenu: () => void) {
    this.canvas      = canvas;
    this.onBackToMenu = onBackToMenu;

    this.renderer = new Renderer(canvas);
    const savedTheme = getThemeById(getSelectedTheme());
    this.renderer.setTheme(savedTheme);

    this.input = new Input(canvas, (dir) => this.handleSwipe(dir));
    this.input.setEnabled(false);

    this.myPlayerId = getOrCreatePlayerId();
    this.roomManager = new RoomManager(db, this.myPlayerId);

    this.screenManager = new ScreenManager(
      overlay,
      getTotalLevels(),
      {
        // Tek oyunculu callback'ler (mp ekranlarında kullanılmaz)
        onSelectMode:  () => {},
        onSelectLevel: () => {},
        onBack:        () => {},
        onRestart:     () => {},
        onUndo:        () => {},
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
          // İsim ekranını göster; kaydet; lobiye dön
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
        onMpJoinFromList: async (code: string) => {
          try {
            await this.roomManager.joinRoom(code.toUpperCase(), this.myName, this.myColorIndex);
            this.roomCode = code.toUpperCase();
            this.isHost   = false;
            this.enterWaiting();
          } catch (e) {
            this.screenManager.showMpError(`Odaya katılamadı: ${(e as Error).message}`);
          }
        },

        // Kod ile katılım (eski onMpJoinRoom yerine)
        onMpJoinRoom: async (code: string) => {
          try {
            await this.roomManager.joinRoom(code.toUpperCase(), this.myName, this.myColorIndex);
            this.roomCode = code.toUpperCase();
            this.isHost   = false;
            this.enterWaiting();
          } catch (e) {
            this.screenManager.showMpError(`Odaya katılamadı: ${(e as Error).message}`);
          }
        },

        // İstekli odaya istek gönder
        onMpSendJoinRequest: async (code: string) => {
          try {
            await this.roomManager.sendJoinRequest(
              code.toUpperCase(), this.myName, this.myColorIndex
            );
            this.screenManager.showMpError('Katılma isteği gönderildi — host onaylaması bekleniyor');
          } catch (e) {
            this.screenManager.showMpError(`İstek gönderilemedi: ${(e as Error).message}`);
          }
        },

        // Host: isteği onayla
        onMpApproveRequest: async (requesterId: string) => {
          // Pending isteklerden isim/renk bilgisini almak için UI callback'i kullan
          // ScreenManager bu veriyi callbacks aracılığıyla iletir
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

        onMpStartGame: async (levelId: number) => {
          this.selectedLevel = levelId;
          try {
            await this.roomManager.startGame(levelId);
          } catch (e) {
            this.screenManager.showMpError(`Oyun başlatılamadı: ${(e as Error).message}`);
          }
        },

        onMpLeave: async () => {
          await this.roomManager.leaveRoom();
          this.cleanup();
          this.onBackToMenu();
        },

        // Tekrar Oyna isteği gönder
        onMpRequestRematch: async () => {
          this.rematchRequested = true;
          try {
            await this.roomManager.requestRematch();
            // Buton "Bekleniyor..." görünümüne ScreenManager geçirir
            this.screenManager.setRematchWaiting();
          } catch (e) {
            this.screenManager.showMpError(`Tekrar oyna isteği gönderilemedi: ${(e as Error).message}`);
          }
        },

        // Tekrar Oyna kabul
        onMpAcceptRematch: async () => {
          try {
            await this.roomManager.respondToRematch(true);
          } catch (e) {
            this.screenManager.showMpError(`Yanıt gönderilemedi: ${(e as Error).message}`);
          }
        },

        // Tekrar Oyna reddet
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

    // Kaydedilmiş isim varsa lobi'ye direkt git
    const savedName = getMpName();
    if (savedName) {
      this.myName       = savedName;
      this.myColorIndex = getMpColorIndex();
      this.showLobby();
    } else {
      this.screenManager.show('mp-name');
    }
  }

  // Lobiye geç ve aktif oda listesini dinlemeye başla
  private showLobby() {
    this.screenManager.show('mp-lobby');
    // Lobi ekranı DOM'da oluşturulduktan sonra listener'ı başlat
    this.roomManager.listenToPublicRooms((rooms) => {
      this.screenManager.updatePublicRooms(rooms);
    });
  }

  stop() {
    cancelAnimationFrame(this.animFrameId);
    this.input.setEnabled(false);
  }

  resize(width: number, height: number, dpr: number) {
    this.renderer.resize(width, height, dpr);
  }

  // -------------------------------------------------------
  // Bekleme odası
  // -------------------------------------------------------

  private enterWaiting() {
    this.screenManager.show('mp-waiting', {
      roomCode:    this.roomCode,
      isHost:      this.isHost,
      players:     {},
      selectedLevel: this.selectedLevel,
      totalLevels:   getTotalLevels(),
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

      const allPlayers = Object.keys(players);
      const connected  = Object.values(players).filter((p) => p.connected);
      if (allPlayers.length > 0 && connected.length === 0) {
        this.roomManager.leaveRoom();
        this.cleanup();
        this.onBackToMenu();
      }
    });

    // Oda durumu değişimini dinle
    this.roomManager.onRoomChange((info) => {
      this.selectedLevel = info.levelId;

      if (info.state === 'countdown' && this.gameStartAt === 0) {
        this.gameStartAt = info.gameStartAt ?? Date.now() + 3000;
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
    });

    // Rematch dinleyicisi (oyun bittikten sonra da geçerli)
    this.roomManager.onRematchChange((rematch) => {
      if (!rematch) return;
      // Başka biri istek atmışsa ve ben henüz cevap vermedim
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

  // Callback proxy metodları (screenManager callback'lerinin içinden çağrılamaz, bu yüzden burada sarıyoruz)
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
    const accepted = rematch.accepted ?? {};
    const accepted_ids = Object.entries(accepted)
      .filter(([, v]) => v)
      .map(([k]) => k);
    const declined_ids = Object.entries(accepted)
      .filter(([, v]) => !v)
      .map(([k]) => k);

    // Reddeden oyuncuları odadan çıkar
    for (const pid of declined_ids) {
      if (pid === this.myPlayerId) {
        this.roomManager.leaveRoom();
        this.cleanup();
        this.onBackToMenu();
        return;
      }
    }

    // Tüm oyuncular (requestedBy hariç) yanıt verdi mi?
    const connectedPlayerIds = Object.entries(this.players)
      .filter(([, p]) => p.connected)
      .map(([pid]) => pid)
      .filter((pid) => pid !== rematch.requestedBy);

    if (connectedPlayerIds.length === 0) return;

    const allAnswered = connectedPlayerIds.every(
      (pid) => accepted[pid] !== undefined
    );
    if (!allAnswered) return;

    // En az 1 kişi kabul etti mi?
    const someAccepted = accepted_ids.some((pid) => pid !== rematch.requestedBy);
    if (!someAccepted) {
      // Hiç kimse kabul etmedi
      this.roomManager.leaveRoom();
      this.cleanup();
      this.onBackToMenu();
      return;
    }

    // Rematch başlat: temizle, yeni RoomManager al
    if (this.isHost || rematch.requestedBy === this.myPlayerId) {
      this.rematchStart();
    }
  }

  private async rematchStart() {
    await this.roomManager.leaveRoom();
    this.cleanup();
    this.roomManager = new RoomManager(db, this.myPlayerId);
    this.showLobby();
  }

  // -------------------------------------------------------
  // Geri sayım
  // -------------------------------------------------------

  private startCountdown(startAt: number) {
    const tick = () => {
      const remaining = Math.ceil((startAt - Date.now()) / 1000);
      if (remaining > 0) {
        this.screenManager.updateMpCountdown(remaining);
        setTimeout(tick, 300);
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
    const levelData = getLevelById(this.selectedLevel, 'thinking');
    if (!levelData) return;

    this.level     = new Level(levelData);
    this.myBall    = new Ball(levelData.startX, levelData.startY);
    this.moveSeq   = 0;
    this.moveQueue = [];
    this.gameEnding = false;
    this.tileColors = new Map();
    this.remotePlayers.clear();

    // Uzak oyuncular için Ball instance oluştur
    for (const [pid, pdata] of Object.entries(this.players)) {
      if (pid === this.myPlayerId) {
        this.myColorIndex = pdata.colorIndex;
        continue;
      }
      if (pdata.connected) {
        this.remotePlayers.set(pid, new RemotePlayer(
          levelData.startX, levelData.startY,
          pdata.colorIndex, pdata.name
        ));
      }
    }

    // Uzak hamleleri dinle
    this.roomManager.onRemoteMove((pid, dir, seq) => {
      const rp = this.remotePlayers.get(pid);
      if (rp) rp.addMove(dir, seq);
    });

    // Karo sahiplik değişimlerini dinle
    this.roomManager.onTileOwnerChange((key, playerId) => {
      const owner = this.players[playerId];
      if (owner) {
        const prev = this.tileColors.get(key);
        if (prev !== owner.colorIndex) {
          this.tileColors.set(key, owner.colorIndex);
          const parts = key.split('_').map(Number);
          const [ky, kx] = parts;
          this.level?.paintAnimations.set(`${kx},${ky}`, performance.now());
        }
      }
    });

    // Oyuncu bağlantı değişimlerini takip et
    this.roomManager.onPlayersChange((players) => {
      this.players = players;
      const connected = Object.values(players).filter((p) => p.connected);
      if (connected.length <= 1 && !this.gameEnding) {
        this.onGameFinished();
      }
      for (const [pid, rp] of this.remotePlayers) {
        rp.connected = players[pid]?.connected ?? false;
      }
      this.screenManager.updateMpGameScores(players, this.myPlayerId, this.tileColors);
    });

    this.input.setEnabled(true);
    this.roomState = 'playing';
  }

  // -------------------------------------------------------
  // Hamle işleme
  // -------------------------------------------------------

  private handleSwipe(dir: Direction) {
    if (!this.level || !this.myBall) return;
    if (this.roomState !== 'playing' || this.gameEnding) return;

    resumeAudio();

    if (this.myBall.animating) {
      if (this.moveQueue.length < this.MAX_QUEUE) this.moveQueue.push(dir);
      return;
    }

    this.executeMove(dir);
  }

  private executeMove(dir: Direction) {
    if (!this.level || !this.myBall) return;

    const result = this.myBall.calculateSlide(
      dir,
      this.level.grid,
      this.level.data.width,
      this.level.data.height
    );

    if (!result) {
      playBump();
      if (this.moveQueue.length > 0) this.executeMove(this.moveQueue.shift()!);
      return;
    }

    const seq = ++this.moveSeq;
    playSlide();
    this.myBall.startSlide(result);

    this.roomManager.sendMove(dir, seq);
  }

  // -------------------------------------------------------
  // Oyun döngüsü
  // -------------------------------------------------------

  private loop = (time: number) => {
    const dt = time - this.lastTime;
    this.lastTime = time;

    if (this.roomState === 'playing' && this.level && this.myBall) {
      this.update(dt);
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
    if (!this.level || !this.myBall) return;

    const myPainted = this.myBall.update(dt);
    if (myPainted) {
      for (const tile of myPainted) {
        const isNew = this.level.paintTileMultiplayer(tile.x, tile.y);
        const key   = `${tile.y}_${tile.x}`;
        this.tileColors.set(key, this.myColorIndex);
        if (isNew) {
          this.roomManager.claimTile(tile.x, tile.y);
        }
      }
    }

    if (!this.myBall.animating && myPainted) {
      if (this.level.isComplete() && !this.gameEnding) {
        this.triggerGameEnd();
      } else if (this.moveQueue.length > 0) {
        this.executeMove(this.moveQueue.shift()!);
      }
    }

    for (const [pid, rp] of this.remotePlayers) {
      if (!rp.connected) continue;

      const rpPainted = rp.update(dt, this.level.grid, this.level.data.width, this.level.data.height);
      if (rpPainted) {
        for (const tile of rpPainted) {
          this.level.paintTileMultiplayer(tile.x, tile.y);
          const key = `${tile.y}_${tile.x}`;
          this.tileColors.set(key, rp.colorIndex);
        }
      }

      if (!this.myBall.animating && !this.gameEnding && this.level.isComplete()) {
        this.triggerGameEnd();
      }
    }

    if (Math.random() < 0.03) {
      const myScore = this.calcMyScore();
      this.roomManager.updateScore(myScore);
      this.screenManager.updateMpGameScores(this.players, this.myPlayerId, this.tileColors);
    }
  }

  private calcMyScore(): number {
    let count = 0;
    for (const v of this.tileColors.values()) {
      if (v === this.myColorIndex) count++;
    }
    return count;
  }

  // -------------------------------------------------------
  // Oyun bitiş
  // -------------------------------------------------------

  private triggerGameEnd() {
    if (this.gameEnding) return;
    this.gameEnding = true;
    this.input.setEnabled(false);

    const myScore = this.calcMyScore();
    this.roomManager.updateScore(myScore);
    this.roomManager.finishGame();

    setTimeout(() => this.onGameFinished(), 800);
  }

  private onGameFinished() {
    if (this.roomState === 'finished' && this.gameEnding) return;
    this.roomState  = 'finished';
    this.gameEnding = true;
    this.input.setEnabled(false);
    this.rematchRequested = false;

    const finalScores: Record<string, number> = {};
    for (const [pid, pdata] of Object.entries(this.players)) {
      const colorIdx = pdata.colorIndex;
      let cnt = 0;
      for (const v of this.tileColors.values()) {
        if (v === colorIdx) cnt++;
      }
      finalScores[pid] = cnt;
    }

    this.screenManager.show('mp-results', {
      players:      this.players,
      finalScores,
      myId:         this.myPlayerId,
    });
  }

  // -------------------------------------------------------
  // Temizlik
  // -------------------------------------------------------

  private cleanup() {
    this.level      = null;
    this.myBall     = null;
    this.remotePlayers.clear();
    this.tileColors = new Map();
    this.moveSeq    = 0;
    this.gameStartAt = 0;
    this.roomState  = 'waiting';
    this.gameEnding = false;
    this.rematchRequested = false;
    this.input.setEnabled(false);
    this.renderer.stopConfetti();
  }
}
