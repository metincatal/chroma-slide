import { Database, ref, get, set, update, onValue, runTransaction } from 'firebase/database';
import { TurnSettings, TURN_MAX_PLAYERS, PAINT_GRADIENTS } from '../utils/constants';
import { TurnDir, computeNextSeat } from './turnEngine';
import { TurnGameData, normalizeGame, resignedFlags, nextSeatOf } from './turnData';
import { touchGc, dropGc } from './gcFirebase';

export type { TurnGameData, TurnPlayer, TurnPhase } from './turnData';
export { normalizeGame, resignedFlags, nextSeatOf } from './turnData';

// Veri yolu rooms/_turn/{kod}: veritabanı kuralı yalnızca rooms/ altına yazma izni verir.
// Kodlar 5 karakter (arena odaları 4): kullanıcı hangi moda ait olduğunu ayırt edebilsin.
const ROOT = 'rooms/_turn';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';


export class TurnRoom {
  private db: Database;
  private myId: string;

  constructor(db: Database, playerId: string) {
    this.db = db;
    this.myId = playerId;
  }

  get playerId(): string { return this.myId; }

  private gameRef(code: string, path = '') {
    return ref(this.db, `${ROOT}/${code}${path ? '/' + path : ''}`);
  }

  private generateCode(): string {
    let code = '';
    for (let i = 0; i < 5; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return code;
  }

  async createGame(name: string, colorIndex: number, settings: TurnSettings): Promise<string> {
    let code = '';
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = this.generateCode();
      const snap = await get(this.gameRef(candidate));
      if (!snap.exists()) { code = candidate; break; }
    }
    if (!code) throw new Error('Benzersiz oyun kodu üretilemedi');

    const now = Date.now();
    await set(this.gameRef(code), {
      createdAt: now,
      hostId: this.myId,
      state: 'waiting',
      settings,
      players: { [this.myId]: { name, colorIndex, joinedAt: now } },
      lastMoveAt: now,
    });
    touchGc(this.db, 'turn', code);
    return code;
  }

  async joinGame(code: string, name: string, colorIndex: number): Promise<void> {
    const snap = await get(this.gameRef(code));
    const game = normalizeGame(code, snap.val());
    if (!game) throw new Error('Oyun bulunamadı');

    // Zaten oyuncuysa tekrar katılmak serbest (başka cihazdan dönüş)
    if (game.players[this.myId]) return;

    if (game.state !== 'waiting') throw new Error('Oyun başlamış, yeni oyuncu katılamaz');
    if (Object.keys(game.players).length >= TURN_MAX_PLAYERS) {
      throw new Error(`Oyun dolu (en fazla ${TURN_MAX_PLAYERS} oyuncu)`);
    }

    // Katılım da etkinliktir: bekleyen oyun temizlik süresini buradan saymaya başlar
    const now = Date.now();
    await update(this.gameRef(code), {
      [`players/${this.myId}`]: { name, colorIndex, joinedAt: now },
      lastMoveAt: now,
    });
    touchGc(this.db, 'turn', code);
  }

  // Host: koltukları katılım sırasına göre dağıt, renk çakışmalarını çöz, başlat
  async startGame(code: string): Promise<void> {
    const snap = await get(this.gameRef(code));
    const game = normalizeGame(code, snap.val());
    if (!game) throw new Error('Oyun bulunamadı');
    if (game.hostId !== this.myId) throw new Error('Oyunu yalnızca kuran başlatabilir');

    const ids = Object.entries(game.players)
      .sort((a, b) => a[1].joinedAt - b[1].joinedAt)
      .map(([pid]) => pid);
    if (ids.length < 2) throw new Error('Başlatmak için en az 2 oyuncu gerekli');

    const updates: Record<string, unknown> = {
      state: 'playing',
      seatOrder: ids,
      moves: null,
      lastMoveAt: Date.now(),
    };
    const used = new Set<number>();
    for (const pid of ids) {
      let ci = (game.players[pid].colorIndex ?? 0) % PAINT_GRADIENTS.length;
      if (used.has(ci)) {
        ci = 0;
        while (used.has(ci)) ci++;
        updates[`players/${pid}/colorIndex`] = ci;
      }
      used.add(ci);
    }
    await update(this.gameRef(code), updates);
    touchGc(this.db, 'turn', code);
  }

  // Hamleyi atomik ekle: yalnızca sıra bendeyse yazılır
  async submitMove(code: string, dir: TurnDir): Promise<boolean> {
    const result = await runTransaction(this.gameRef(code), (raw) => {
      // Yerel önbellek boşsa null gelir; null döndürünce sunucu gerçek değerle tekrar dener
      if (raw === null) return raw;
      const game = normalizeGame(code, raw);
      if (!game || game.state !== 'playing') return undefined;

      const mySeat = game.seatOrder.indexOf(this.myId);
      if (mySeat < 0) return undefined;
      if (nextSeatOf(game) !== mySeat) return undefined;

      const moves = [...game.moves, { s: mySeat, d: dir, t: Date.now() }];
      const next = computeNextSeat(moves, game.seatOrder.length, game.settings.movesPerPlayer, resignedFlags(game));

      raw.moves = moves;
      raw.lastMoveAt = Date.now();
      if (next === -1) raw.state = 'finished';
      return raw;
    });
    if (result.committed) touchGc(this.db, 'turn', code);
    return result.committed;
  }

  // Oyundan çekil: kalan hamlelerin atlanır, karoların tahtada kalır
  async resign(code: string): Promise<boolean> {
    const result = await runTransaction(this.gameRef(code), (raw) => {
      if (raw === null) return raw;
      const game = normalizeGame(code, raw);
      if (!game || game.state !== 'playing') return undefined;
      if (!game.players[this.myId]) return undefined;

      raw.players[this.myId].resigned = true;
      const after = normalizeGame(code, raw)!;
      if (nextSeatOf(after) === -1) raw.state = 'finished';
      raw.lastMoveAt = Date.now();
      return raw;
    });
    if (result.committed) touchGc(this.db, 'turn', code);
    return result.committed;
  }

  // Sıradaki oyuncu süre aşımına uğradıysa onun yerine pas yaz
  async skipTimedOut(code: string, timeoutMs: number): Promise<boolean> {
    const result = await runTransaction(this.gameRef(code), (raw) => {
      if (raw === null) return raw;
      const game = normalizeGame(code, raw);
      if (!game || game.state !== 'playing') return undefined;
      if (!game.seatOrder.includes(this.myId)) return undefined;

      const seat = nextSeatOf(game);
      if (seat < 0) return undefined;
      if (game.seatOrder[seat] === this.myId) return undefined;
      if (Date.now() - game.lastMoveAt < timeoutMs) return undefined;

      const moves = [...game.moves, { s: seat, d: 'P' as TurnDir, t: Date.now() }];
      const next = computeNextSeat(moves, game.seatOrder.length, game.settings.movesPerPlayer, resignedFlags(game));
      raw.moves = moves;
      raw.lastMoveAt = Date.now();
      if (next === -1) raw.state = 'finished';
      return raw;
    });
    if (result.committed) touchGc(this.db, 'turn', code);
    return result.committed;
  }

  // Bekleme odasından ayrıl (oyun başlamadan)
  async leaveWaiting(code: string): Promise<void> {
    const snap = await get(this.gameRef(code));
    const game = normalizeGame(code, snap.val());
    if (!game || game.state !== 'waiting') return;

    if (game.hostId === this.myId) {
      const others = Object.entries(game.players)
        .filter(([pid]) => pid !== this.myId)
        .sort((a, b) => a[1].joinedAt - b[1].joinedAt);
      if (others.length === 0) {
        await set(this.gameRef(code), null);
        dropGc(this.db, 'turn', code);
        return;
      }
      await update(this.gameRef(code), {
        hostId: others[0][0],
        [`players/${this.myId}`]: null,
      });
      touchGc(this.db, 'turn', code);
      return;
    }
    await set(this.gameRef(code, `players/${this.myId}`), null);
    touchGc(this.db, 'turn', code);
  }

  async fetchGame(code: string): Promise<TurnGameData | null> {
    const snap = await get(this.gameRef(code));
    return normalizeGame(code, snap.val());
  }

  listen(code: string, cb: (game: TurnGameData | null) => void): () => void {
    return onValue(this.gameRef(code), (snap) => cb(normalizeGame(code, snap.val())));
  }
}
