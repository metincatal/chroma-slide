import { Renderer } from '../game/Renderer';
import { Ball } from '../game/Ball';
import { Level } from '../game/Level';
import { Input } from '../game/Input';
import { ScreenManager } from '../ui/ScreenManager';
import { getLevelById, getTotalLevels } from '../levels/index';
import { Direction, PAINT_GRADIENTS } from '../utils/constants';
import { getThemeById, ThemeConfig } from '../utils/themes';
import { getSelectedTheme } from '../utils/storage';
import { playSlide, playBump, resumeAudio } from '../utils/sound';
import { db } from './FirebaseConfig';
import { RoomManager, PlayerData, RoomInfo } from './RoomManager';
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
  private countdownEnd = 0;
  private gameStartAt  = 0;

  // Animasyon döngüsü
  private animFrameId = 0;
  private lastTime    = 0;

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

        // Multiplayer callback'ler
        onMpNameSubmit: (name: string) => {
          this.myName = name.trim() || 'Oyuncu';
          this.myColorIndex = Math.floor(Math.random() * PAINT_GRADIENTS.length);
          this.screenManager.show('mp-lobby');
        },
        onMpCreateRoom: async () => {
          try {
            const code = await this.roomManager.createRoom(this.myName, this.myColorIndex);
            this.roomCode = code;
            this.isHost   = true;
            this.enterWaiting();
          } catch (e) {
            this.screenManager.showMpError(`Oda oluşturulamadı: ${(e as Error).message}`);
          }
        },
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
        onMpPlayAgain: async () => {
          await this.roomManager.leaveRoom();
          this.cleanup();
          // Aynı ekranda sıfırdan başla
          this.roomManager = new RoomManager(db, this.myPlayerId);
          this.screenManager.show('mp-lobby');
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
    this.screenManager.show('mp-name');
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
      roomCode: this.roomCode,
      isHost:   this.isHost,
      players:  {},
      selectedLevel: this.selectedLevel,
      totalLevels:   getTotalLevels(),
    });

    // Oyuncu değişikliklerini dinle
    this.roomManager.onPlayersChange((players) => {
      this.players = players;
      this.screenManager.updateMpWaiting(players, this.roomCode, this.isHost, this.selectedLevel);

      // Sadece gerçekten oyuncu VAR ama hepsi disconnected olduysa çık
      // (boş ilk snapshot'ta tetiklenmesin diye Object.keys kontrolü)
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
      this.roomState     = info.state;
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
          // Sahiplik animasyonu: level.paintAnimations'u güncelle
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
        // Tek oyuncu kaldı → otomatik bitir
        this.onGameFinished();
      }
      // Uzak oyuncuların connected durumunu güncelle
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

    // Firebase'e yaz (fire-and-forget)
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

    // Kendi topumu güncelle
    const myPainted = this.myBall.update(dt);
    if (myPainted) {
      for (const tile of myPainted) {
        const isNew = this.level.paintTileMultiplayer(tile.x, tile.y);
        const key   = `${tile.y}_${tile.x}`;

        // Yerel sahiplik ata
        this.tileColors.set(key, this.myColorIndex);

        // Firebase'e karo sahipliği yaz (sadece yeni boyanan karolar için)
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

    // Uzak oyuncuları güncelle
    for (const [pid, rp] of this.remotePlayers) {
      if (!rp.connected) continue;

      const rpPainted = rp.update(dt, this.level.grid, this.level.data.width, this.level.data.height);
      if (rpPainted) {
        for (const tile of rpPainted) {
          this.level.paintTileMultiplayer(tile.x, tile.y);
          // Uzak oyuncu sahipliği: Firebase onTileOwnerChange'i bekle,
          // ama yerel görsel için hemen ata
          const key = `${tile.y}_${tile.x}`;
          this.tileColors.set(key, rp.colorIndex);
        }
      }

      if (!this.myBall.animating && !this.gameEnding && this.level.isComplete()) {
        this.triggerGameEnd();
      }
    }

    // Periyodik skor güncelleme (~500ms'de bir)
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

    // Son skoru yaz
    const myScore = this.calcMyScore();
    this.roomManager.updateScore(myScore);
    this.roomManager.finishGame();

    setTimeout(() => this.onGameFinished(), 800);
  }

  private onGameFinished() {
    if (this.roomState === 'finished' && this.gameEnding) return; // tekrar çağrılmasın
    this.roomState  = 'finished';
    this.gameEnding = true;
    this.input.setEnabled(false);

    // Son skorları hesapla
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
    this.input.setEnabled(false);
    this.renderer.stopConfetti();
  }
}
