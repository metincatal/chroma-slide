import { Renderer, RenderPlayer } from '../game/Renderer';
import { Ball } from '../game/Ball';
import { Level } from '../game/Level';
import { Input } from '../game/Input';
import { generateArena, ARENA_COUNT } from '../levels/arena';
import { LevelData } from '../levels/types';
import {
  Direction, PAINT_GRADIENTS, TURN_DEFAULT_SETTINGS, TURN_TIMEOUT_MS,
  MP_ARENA_SIZES, TURN_MOVE_OPTIONS,
} from '../utils/constants';
import { getThemeById } from '../utils/themes';
import {
  getSelectedTheme, getMpName, getMpColorIndex, getOrCreatePlayerId,
  getTurnGameCodes, addTurnGameCode, removeTurnGameCode,
  getTurnSettingsPref, saveTurnSettingsPref, getDevTurnTimeoutMs,
} from '../utils/storage';
import { playSlide, playBump, playCapture, playPickup, playComplete, resumeAudio } from '../utils/sound';
import { db } from './FirebaseConfig';
import { TurnRoom, TurnGameData, nextSeatOf, resignedFlags } from './TurnRoom';
import { replayTurnGame, legalDirs, dirToTurn, TurnState, TurnMove } from './turnEngine';
import { TurnScreens, TurnSettingsDraft, TurnGameSummary, TurnHudInfo } from '../ui/TurnScreens';

type View = 'home' | 'waiting' | 'game' | 'results';

// ===== SIRALI TAKTIK MODU =====
// Tahta hamle günlüğünden türetilir (turnEngine). Firebase yalnızca günlüğü taşır.
export class TurnGame {
  private renderer: Renderer;
  private input: Input;
  private screens: TurnScreens;
  private room: TurnRoom;
  private myId: string;
  private myName: string;

  private view: View = 'home';
  private animFrameId = 0;
  private lastTime = 0;
  private originalTitle = document.title;

  // Ana ekran
  private homeUnsubs: (() => void)[] = [];
  private summaries: Map<string, TurnGameSummary> = new Map();

  // Açık oyun
  private code = '';
  private gameUnsub: (() => void) | null = null;
  private game: TurnGameData | null = null;
  private arena: LevelData | null = null;
  private level: Level | null = null;
  private balls: Ball[] = [];
  private ownerSeat: Uint8Array = new Uint8Array(0);
  private tileColors: Map<string, number> = new Map();
  private displayedMoves = 0;
  private hudTimer = 0;
  private wasMyTurn = false;

  // Hamle animasyonu
  private anim: { seat: number; target: TurnState } | null = null;
  private submitting = false;

  // Çizim için sıra koltuğu önbelleği (her karede yeniden oynatmamak için)
  private turnSeatCache = { key: '', seat: -1 };

  constructor(
    private canvas: HTMLCanvasElement,
    private overlay: HTMLDivElement,
    private onExit: () => void,
    private openCode?: string
  ) {
    this.renderer = new Renderer(canvas);
    this.renderer.setTheme(getThemeById(getSelectedTheme()));
    this.input = new Input(canvas, (dir) => this.handleSwipe(dir));
    this.input.setEnabled(false);
    this.screens = new TurnScreens(overlay);
    this.myId = getOrCreatePlayerId();
    this.myName = getMpName() || 'Oyuncu';
    this.room = new TurnRoom(db, this.myId);
  }

  // -------------------------------------------------------
  // Yaşam döngüsü
  // -------------------------------------------------------

  start() {
    this.lastTime = performance.now();
    this.loop(this.lastTime);
    if (this.openCode) this.openGame(this.openCode);
    else this.showHome();
  }

  stop() {
    cancelAnimationFrame(this.animFrameId);
    this.input.setEnabled(false);
    this.closeHome();
    this.closeGame();
    document.title = this.originalTitle;
  }

  resize(width: number, height: number, dpr: number) {
    this.renderer.resize(width, height, dpr);
  }

  private get timeoutMs(): number {
    return getDevTurnTimeoutMs() ?? TURN_TIMEOUT_MS;
  }

  // -------------------------------------------------------
  // Ana ekran
  // -------------------------------------------------------

  private loadDraft(): TurnSettingsDraft {
    const pref = getTurnSettingsPref();
    const d: TurnSettingsDraft = { ...TURN_DEFAULT_SETTINGS };
    if (pref) {
      if ((MP_ARENA_SIZES as readonly number[]).includes(pref.arenaSize)) d.arenaSize = pref.arenaSize;
      if ((TURN_MOVE_OPTIONS as readonly number[]).includes(pref.movesPerPlayer)) d.movesPerPlayer = pref.movesPerPlayer;
      if (typeof pref.capture === 'boolean') d.capture = pref.capture;
      if (typeof pref.collide === 'boolean') d.collide = pref.collide;
    }
    return d;
  }

  private showHome() {
    this.closeGame();
    this.view = 'home';
    this.input.setEnabled(false);
    this.renderer.clear();
    document.title = this.originalTitle;

    this.screens.showHome(this.myName, this.loadDraft(), {
      onBack: () => this.onExit(),
      onDraftChange: (d) => saveTurnSettingsPref(d),
      onCreate: (d) => this.createGame(d),
      onJoin: (code) => this.joinGame(code),
      onOpen: (code) => this.openGame(code),
      onForget: (code) => {
        removeTurnGameCode(code);
        this.summaries.delete(code);
        this.renderSummaries();
      },
    });

    this.closeHome();
    this.summaries.clear();
    const codes = getTurnGameCodes().slice(0, 12);
    if (codes.length === 0) {
      this.screens.updateGameList([]);
      return;
    }
    for (const code of codes) {
      this.homeUnsubs.push(this.room.listen(code, (game) => {
        if (!game) {
          // Silinmiş oyun (kuran bekleme odasından ayrılmış): listeden temizle
          removeTurnGameCode(code);
          this.summaries.delete(code);
        } else {
          this.summaries.set(code, this.summarize(game));
        }
        this.renderSummaries();
      }));
    }
  }

  private closeHome() {
    for (const u of this.homeUnsubs) u();
    this.homeUnsubs = [];
  }

  private renderSummaries() {
    if (this.view !== 'home') return;
    const order = { 'my-turn': 0, 'their-turn': 1, waiting: 2, finished: 3 };
    const items = [...this.summaries.values()].sort((a, b) =>
      order[a.status] - order[b.status] || b.updatedAt - a.updatedAt
    );
    this.screens.updateGameList(items);
  }

  private summarize(game: TurnGameData): TurnGameSummary {
    const others = Object.entries(game.players)
      .filter(([pid]) => pid !== this.myId)
      .map(([, p]) => p.name);
    const opponents = others.length ? others.join(', ') : 'Rakip bekleniyor';
    const base = { code: game.code, opponents, updatedAt: game.lastMoveAt };

    if (game.state === 'waiting') {
      const n = Object.keys(game.players).length;
      return { ...base, status: 'waiting', statusText: `Başlaması bekleniyor · ${n} oyuncu` };
    }

    const seat = nextSeatOf(game);
    if (game.state === 'finished' || seat < 0) {
      const arena = generateArena(game.settings.arenaId, game.settings.arenaSize);
      const st = replayTurnGame(arena, game.seatOrder.length, game.moves, game.settings, resignedFlags(game));
      const best = Math.max(...st.scores);
      const winners = game.seatOrder.filter((_, i) => st.scores[i] === best);
      const text = winners.length > 1
        ? 'Bitti · berabere'
        : winners[0] === this.myId
          ? 'Bitti · kazandın'
          : `Bitti · ${game.players[winners[0]]?.name ?? '?'} kazandı`;
      return { ...base, status: 'finished', statusText: text };
    }

    const turnPid = game.seatOrder[seat];
    if (turnPid === this.myId) return { ...base, status: 'my-turn', statusText: 'Sıra sende' };
    return { ...base, status: 'their-turn', statusText: `Sıra: ${game.players[turnPid]?.name ?? '?'}` };
  }

  private async createGame(d: TurnSettingsDraft) {
    try {
      const arenaId = 1 + Math.floor(Math.random() * ARENA_COUNT);
      const code = await this.room.createGame(this.myName, getMpColorIndex(), { ...d, arenaId });
      addTurnGameCode(code);
      this.openGame(code);
    } catch (e) {
      this.screens.toast(`Oyun kurulamadı: ${(e as Error).message}`, 'error');
    }
  }

  private async joinGame(code: string) {
    try {
      await this.room.joinGame(code, this.myName, getMpColorIndex());
      addTurnGameCode(code);
      this.openGame(code);
    } catch (e) {
      this.screens.toast(`Katılamadın: ${(e as Error).message}`, 'error');
    }
  }

  // -------------------------------------------------------
  // Oyun açma ve güncelleme
  // -------------------------------------------------------

  private openGame(code: string) {
    this.closeHome();
    this.closeGame();
    this.code = code;
    this.gameUnsub = this.room.listen(code, (game) => this.onGameUpdate(game));
    this.hudTimer = window.setInterval(() => {
      if (this.view === 'game') this.refreshHud();
    }, 5000);
  }

  private closeGame() {
    if (this.gameUnsub) { this.gameUnsub(); this.gameUnsub = null; }
    if (this.hudTimer) { clearInterval(this.hudTimer); this.hudTimer = 0; }
    this.game = null;
    this.arena = null;
    this.level = null;
    this.balls = [];
    this.anim = null;
    this.submitting = false;
    this.displayedMoves = 0;
    this.wasMyTurn = false;
    this.input.setEnabled(false);
  }

  private onGameUpdate(game: TurnGameData | null) {
    if (!game) {
      removeTurnGameCode(this.code);
      this.screens.toast('Bu oyun artık yok', 'error');
      this.showHome();
      return;
    }

    // Bu cihazda listede yoksa ekle (başka cihazdan katılım, bağlantıdan açılış)
    if (game.players[this.myId]) addTurnGameCode(game.code);

    const prev = this.game;
    this.game = game;

    if (game.state === 'waiting' && game.players[this.myId]) {
      this.view = 'waiting';
      this.input.setEnabled(false);
      this.renderer.clear();
      this.screens.showWaiting(game, this.myId, {
        onBack: () => this.showHome(),
        onStart: async () => {
          try { await this.room.startGame(game.code); }
          catch (e) { this.screens.toast((e as Error).message, 'error'); }
        },
        onLeave: async () => {
          try { await this.room.leaveWaiting(game.code); } catch { /* yoksay */ }
          removeTurnGameCode(game.code);
          this.showHome();
        },
      });
      return;
    }

    if (game.state === 'waiting' && !game.players[this.myId]) {
      // Bağlantıyla açıldı ve henüz katılmadım: otomatik katıl
      this.room.joinGame(game.code, this.myName, getMpColorIndex())
        .then(() => addTurnGameCode(game.code))
        .catch((e) => {
          this.screens.toast(`Katılamadın: ${(e as Error).message}`, 'error');
          this.showHome();
        });
      return;
    }

    if (!game.seatOrder.includes(this.myId)) {
      // Oyuncu değilim: izleme desteklenmiyor
      removeTurnGameCode(game.code);
      this.screens.toast('Bu oyun sen katılmadan başlamış', 'error');
      this.showHome();
      return;
    }

    const needsSetup =
      !this.level || !prev || prev.state === 'waiting' ||
      prev.settings.arenaId !== game.settings.arenaId ||
      game.moves.length < this.displayedMoves;

    if (needsSetup) {
      this.setupBoard(game);
    } else if (game.moves.length > this.displayedMoves && !this.anim) {
      this.playNewMoves(game);
    }

    if (this.view !== 'game') {
      this.view = 'game';
      this.screens.showGame(this.hudInfo(), {
        onBack: () => this.showHome(),
        onResign: () => this.screens.confirm(
          'Oyundan çekil',
          'Kalan hamlelerin atlanır, boyadığın karolar tahtada kalır. Bu geri alınamaz.',
          'ÇEKİL',
          async () => {
            const ok = await this.room.resign(this.code).catch(() => false);
            if (!ok) this.screens.toast('Çekilme işlenemedi', 'error');
          }
        ),
        onSkip: async () => {
          const ok = await this.room.skipTimedOut(this.code, this.timeoutMs).catch(() => false);
          if (!ok) this.screens.toast('Sıra geçilemedi, rakip oynamış olabilir', 'error');
        },
      });
    }
    this.refreshHud();
    this.maybeShowResults();
  }

  // Tahtayı günlükten sıfırdan kur (animasyonsuz)
  private setupBoard(game: TurnGameData) {
    this.arena = generateArena(game.settings.arenaId, game.settings.arenaSize);
    this.level = new Level(this.arena);
    this.renderer.invalidateStatic();
    this.tileColors = new Map();
    this.ownerSeat = new Uint8Array(this.arena.width * this.arena.height);
    this.anim = null;

    const state = this.replay(game, game.moves);
    this.balls = state.balls.map((b) => new Ball(b.x, b.y));
    this.applyOwner(state.ownerSeat, false);
    this.displayedMoves = game.moves.length;
  }

  private replay(game: TurnGameData, moves: TurnMove[]): TurnState {
    return replayTurnGame(this.arena!, game.seatOrder.length, moves, game.settings, resignedFlags(game));
  }

  private colorOfSeat(seat: number): number {
    const pid = this.game?.seatOrder[seat];
    if (!pid) return seat;
    return this.game?.players[pid]?.colorIndex ?? seat;
  }

  // Ekrandaki sahipliği hedef duruma getir; animate=true ise değişen karolar parlar
  private applyOwner(target: Uint8Array, animate: boolean) {
    if (!this.level || !this.arena) return;
    const w = this.arena.width;
    for (let idx = 0; idx < target.length; idx++) {
      const v = target[idx];
      if (v === 0 || this.ownerSeat[idx] === v) continue;
      this.ownerSeat[idx] = v;
      const x = idx % w, y = (idx - x) / w;
      this.level.paintTileMultiplayer(x, y);
      if (!animate) this.level.paintAnimations.delete(`${x},${y}`);
      this.tileColors.set(`${y}_${x}`, this.colorOfSeat(v - 1));
    }
  }

  // Yeni hamleler geldi: sonuncusu hariç anında uygula, sonuncuyu kaydır
  private playNewMoves(game: TurnGameData) {
    const n = game.moves.length;
    const before = this.replay(game, game.moves.slice(0, n - 1));
    this.applyOwner(before.ownerSeat, false);
    before.balls.forEach((b, i) => this.balls[i]?.reset(b.x, b.y));
    this.animateLastMove(game, game.moves, false);
  }

  private animateLastMove(game: TurnGameData, moves: TurnMove[], mine: boolean) {
    const target = this.replay(game, moves);
    const last = target.lastMove;
    this.displayedMoves = moves.length;

    if (!last || last.path.length === 0 || !this.arena) {
      this.finishAnimation(target, mine);
      return;
    }

    const w = this.arena.width;
    const path = last.path.map((idx) => ({ x: idx % w, y: Math.floor(idx / w) }));
    const end = path[path.length - 1];
    const ball = this.balls[last.seat];
    ball.startSlide({ path, finalX: end.x, finalY: end.y, dirX: 0, dirY: 0, finalColor: ball.color });
    this.anim = { seat: last.seat, target };
    playSlide();
  }

  private finishAnimation(target: TurnState, mine: boolean) {
    this.applyOwner(target.ownerSeat, true);
    target.balls.forEach((b, i) => this.balls[i]?.reset(b.x, b.y));
    this.anim = null;

    const captured = target.lastMove?.captured.length ?? 0;
    if (captured > 0) {
      playCapture();
      this.renderer.triggerShake(0.5);
      const who = mine ? 'Alan çevirdin' : `${this.game?.players[this.game.seatOrder[target.lastMove!.seat]]?.name ?? '?'} alan çevirdi`;
      this.screens.toast(`${who} · +${captured}`);
    }

    // Günlükte ekranda olmayan hamle kaldıysa onu da oynat
    if (this.game && this.game.moves.length > this.displayedMoves) {
      this.playNewMoves(this.game);
      return;
    }
    this.refreshHud();
    this.maybeShowResults();
  }

  // -------------------------------------------------------
  // HUD
  // -------------------------------------------------------

  private hudInfo(): TurnHudInfo {
    const game = this.game!;
    const seats = game.seatOrder.length;
    const state = this.replay(game, game.moves);
    const turnSeat = state.nextSeat;
    const mySeat = game.seatOrder.indexOf(this.myId);
    const resigned = resignedFlags(game);
    const turnPid = turnSeat >= 0 ? game.seatOrder[turnSeat] : '';
    const turnPlayer = game.players[turnPid];
    const [tc] = PAINT_GRADIENTS[(turnPlayer?.colorIndex ?? 0) % PAINT_GRADIENTS.length];

    let totalLeft = 0;
    for (let s = 0; s < seats; s++) {
      if (!resigned[s]) totalLeft += Math.max(0, game.settings.movesPerPlayer - state.used[s]);
    }

    return {
      code: game.code,
      isMyTurn: turnSeat >= 0 && turnSeat === mySeat,
      turnName: turnPlayer?.name ?? '?',
      turnColor: tc,
      myMovesLeft: Math.max(0, game.settings.movesPerPlayer - (state.used[mySeat] ?? 0)),
      totalMovesLeft: totalLeft,
      canSkip: turnSeat >= 0 && turnSeat !== mySeat && !resigned[mySeat]
        && Date.now() - game.lastMoveAt >= this.timeoutMs,
      resigned: !!resigned[mySeat],
      chips: game.seatOrder.map((pid, i) => {
        const p = game.players[pid];
        const [gs] = PAINT_GRADIENTS[(p?.colorIndex ?? i) % PAINT_GRADIENTS.length];
        return {
          name: p?.name ?? '?', color: gs, score: state.scores[i],
          isMe: pid === this.myId, active: i === turnSeat, resigned: !!resigned[i],
        };
      }),
    };
  }

  private refreshHud() {
    if (!this.game || this.view !== 'game') return;
    const info = this.hudInfo();
    this.screens.updateGame(info);

    const canMove = info.isMyTurn && !this.anim && !this.submitting;
    this.input.setEnabled(canMove);
    document.title = info.isMyTurn ? `● Sıra sende · ${this.originalTitle}` : this.originalTitle;

    if (info.isMyTurn && !this.wasMyTurn && this.displayedMoves > 0) playPickup();
    this.wasMyTurn = info.isMyTurn;
  }

  private maybeShowResults() {
    const game = this.game;
    if (!game || this.anim || this.view === 'results') return;
    if (game.state !== 'finished' && nextSeatOf(game) !== -1) return;

    const state = this.replay(game, game.moves);
    const total = this.level?.totalPaintable ?? 1;
    const resigned = resignedFlags(game);
    this.view = 'results';
    this.input.setEnabled(false);
    document.title = this.originalTitle;
    playComplete();

    this.screens.showResults(
      game.seatOrder.map((pid, i) => {
        const p = game.players[pid];
        const [gs] = PAINT_GRADIENTS[(p?.colorIndex ?? i) % PAINT_GRADIENTS.length];
        return {
          name: p?.name ?? '?', color: gs, score: state.scores[i],
          pct: Math.round((state.scores[i] / total) * 100),
          isMe: pid === this.myId, resigned: !!resigned[i],
        };
      }),
      () => this.showHome()
    );
  }

  // -------------------------------------------------------
  // Hamle
  // -------------------------------------------------------

  private async handleSwipe(dir: Direction) {
    const game = this.game;
    if (!game || !this.arena || this.view !== 'game') return;
    if (this.anim || this.submitting) return;
    resumeAudio();

    const mySeat = game.seatOrder.indexOf(this.myId);
    if (nextSeatOf(game) !== mySeat) return;

    const current = this.replay(game, game.moves);
    const legal = legalDirs(this.arena, current.balls, mySeat, game.settings);
    if (legal.length === 0) {
      // Hiç hamlem yoksa pas geç
      this.submitMove(game, 'P');
      return;
    }
    if (!legal.includes(dir)) {
      playBump();
      return;
    }
    this.submitMove(game, dirToTurn(dir));
  }

  private async submitMove(game: TurnGameData, d: TurnMove['d']) {
    const mySeat = game.seatOrder.indexOf(this.myId);
    const optimistic = [...game.moves, { s: mySeat, d }];

    // İyimser: hamleyi hemen oynat, onay arkadan gelsin
    this.submitting = true;
    this.input.setEnabled(false);
    this.animateLastMove(game, optimistic, true);

    const ok = await this.room.submitMove(game.code, d).catch(() => false);
    this.submitting = false;

    if (!ok) {
      this.screens.toast('Hamle kaydedilemedi, tahta yenilendi', 'error');
      if (this.game) this.setupBoard(this.game);
    }
    this.refreshHud();
  }

  // -------------------------------------------------------
  // Döngü
  // -------------------------------------------------------

  private loop = (time: number) => {
    const dt = time - this.lastTime;
    this.lastTime = time;

    if (this.view === 'game' && this.level && this.game) {
      this.update(dt);
      this.render();
    }

    this.animFrameId = requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    if (!this.arena) return;
    const w = this.arena.width;

    for (let seat = 0; seat < this.balls.length; seat++) {
      const painted = this.balls[seat].update(dt);
      if (!painted || !this.anim || this.anim.seat !== seat) continue;

      // Top ilerledikçe geçtiği karoları hamle yapan oyuncunun rengine boya
      const partial = new Uint8Array(this.ownerSeat);
      for (const t of painted) partial[t.y * w + t.x] = seat + 1;
      this.applyOwner(partial, true);

      if (!this.balls[seat].animating) this.finishAnimation(this.anim.target, this.anim.seat === this.game!.seatOrder.indexOf(this.myId));
    }
  }

  private render() {
    const game = this.game!;
    let turnSeat = -1;
    if (!this.anim) {
      const key = `${this.displayedMoves}:${resignedFlags(game).join(',')}`;
      if (this.turnSeatCache.key !== key) {
        this.turnSeatCache = { key, seat: this.replay(game, game.moves.slice(0, this.displayedMoves)).nextSeat };
      }
      turnSeat = this.turnSeatCache.seat;
    }

    const players: RenderPlayer[] = game.seatOrder.map((pid, i) => ({
      ball: this.balls[i],
      colorIndex: game.players[pid]?.colorIndex ?? i,
      name: game.players[pid]?.name ?? '?',
      isMe: pid === this.myId,
      shield: false, frozen: false, brush: false,
      turn: i === turnSeat && !game.players[pid]?.resigned,
    })).filter((p) => !!p.ball);

    this.renderer.renderMultiplayer(this.level!, players, this.tileColors, []);
  }
}
