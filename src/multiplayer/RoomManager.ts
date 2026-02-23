import {
  Database,
  ref,
  set,
  get,
  onValue,
  runTransaction,
  onDisconnect,
  serverTimestamp,
} from 'firebase/database';
import { Direction } from '../utils/constants';

export interface PlayerData {
  name: string;
  colorIndex: number;
  connected: boolean;
  score: number;
}

export type RoomState = 'waiting' | 'countdown' | 'playing' | 'finished';

export interface RoomInfo {
  state: RoomState;
  hostId: string;
  levelId: number;
  createdAt: number;
  gameStartAt: number | null;
}

export class RoomManager {
  private db: Database;
  private myId: string;
  private roomCode: string | null = null;
  private unsubscribers: (() => void)[] = [];
  // Daha önce işlenen hamleleri takip et (duplicate önlemek için)
  private processedMoves: Map<string, Set<number>> = new Map();

  constructor(db: Database, playerId: string) {
    this.db    = db;
    this.myId  = playerId;
  }

  get playerId(): string      { return this.myId; }
  get currentRoomCode(): string | null { return this.roomCode; }

  // --- Yardımcılar ---

  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  // --- Oda işlemleri ---

  async createRoom(name: string, colorIndex: number): Promise<string> {
    let code = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      code = this.generateCode();
      const snap = await get(ref(this.db, `rooms/${code}`));
      if (!snap.exists()) break;
    }
    if (!code) throw new Error('Benzersiz oda kodu üretilemedi');

    this.roomCode = code;

    await set(ref(this.db, `rooms/${code}`), {
      state:       'waiting',
      hostId:      this.myId,
      levelId:     1,
      createdAt:   Date.now(),
      gameStartAt: null,
    });

    await set(ref(this.db, `rooms/${code}/players/${this.myId}`), {
      name,
      colorIndex,
      connected: true,
      score:     0,
    });

    onDisconnect(ref(this.db, `rooms/${code}/players/${this.myId}/connected`))
      .set(false);

    return code;
  }

  async joinRoom(code: string, name: string, colorIndex: number): Promise<void> {
    const roomSnap = await get(ref(this.db, `rooms/${code}`));
    if (!roomSnap.exists()) throw new Error('Oda bulunamadı');

    const room = roomSnap.val() as RoomInfo;
    if (room.state === 'playing') throw new Error('Oyun zaten başlamış');
    if (room.state === 'finished') throw new Error('Oyun bitti');

    const playersSnap = await get(ref(this.db, `rooms/${code}/players`));
    const players = playersSnap.val() || {};
    const connectedCount = Object.values(players as Record<string, PlayerData>)
      .filter((p) => p.connected).length;
    if (connectedCount >= 4) throw new Error('Oda dolu (max 4 oyuncu)');

    this.roomCode = code;

    await set(ref(this.db, `rooms/${code}/players/${this.myId}`), {
      name,
      colorIndex,
      connected: true,
      score:     0,
    });

    onDisconnect(ref(this.db, `rooms/${code}/players/${this.myId}/connected`))
      .set(false);
  }

  async startGame(levelId: number): Promise<void> {
    if (!this.roomCode) throw new Error('Odada değilsiniz');
    const now = Date.now();
    await set(ref(this.db, `rooms/${this.roomCode}/levelId`),     levelId);
    await set(ref(this.db, `rooms/${this.roomCode}/state`),       'countdown');
    await set(ref(this.db, `rooms/${this.roomCode}/gameStartAt`), now + 3000);
  }

  async sendMove(dir: Direction, seq: number): Promise<void> {
    if (!this.roomCode) return;
    await set(
      ref(this.db, `rooms/${this.roomCode}/moves/${this.myId}/${seq}`),
      { dir, timestamp: Date.now() }
    );
  }

  async claimTile(x: number, y: number): Promise<void> {
    if (!this.roomCode) return;
    const key     = `${y}_${x}`;
    const tileRef = ref(this.db, `rooms/${this.roomCode}/tileOwners/${key}`);
    await runTransaction(tileRef, () => ({ playerId: this.myId }));
  }

  async updateScore(score: number): Promise<void> {
    if (!this.roomCode) return;
    await set(
      ref(this.db, `rooms/${this.roomCode}/players/${this.myId}/score`),
      score
    );
  }

  async finishGame(): Promise<void> {
    if (!this.roomCode) return;
    await set(ref(this.db, `rooms/${this.roomCode}/state`), 'finished');
  }

  async leaveRoom(): Promise<void> {
    if (!this.roomCode) return;
    try {
      await set(
        ref(this.db, `rooms/${this.roomCode}/players/${this.myId}/connected`),
        false
      );
    } catch { /* yoksay */ }
    this.cleanup();
  }

  // --- Dinleyiciler ---

  onPlayersChange(
    callback: (players: Record<string, PlayerData>) => void
  ): () => void {
    if (!this.roomCode) return () => {};
    const unsub = onValue(
      ref(this.db, `rooms/${this.roomCode}/players`),
      (snap) => callback((snap.val() as Record<string, PlayerData>) || {})
    );
    this.unsubscribers.push(unsub);
    return unsub;
  }

  onRoomChange(
    callback: (info: RoomInfo) => void
  ): () => void {
    if (!this.roomCode) return () => {};
    const unsub = onValue(
      ref(this.db, `rooms/${this.roomCode}`),
      (snap) => { if (snap.exists()) callback(snap.val() as RoomInfo); }
    );
    this.unsubscribers.push(unsub);
    return unsub;
  }

  onRemoteMove(
    callback: (playerId: string, dir: Direction, seq: number) => void
  ): () => void {
    if (!this.roomCode) return () => {};

    const unsub = onValue(
      ref(this.db, `rooms/${this.roomCode}/moves`),
      (snap) => {
        const allMoves = (snap.val() as Record<string, Record<string, { dir: Direction }>>) || {};
        for (const [pid, moves] of Object.entries(allMoves)) {
          if (pid === this.myId) continue;
          if (!this.processedMoves.has(pid)) this.processedMoves.set(pid, new Set());
          const seen = this.processedMoves.get(pid)!;

          for (const [seqStr, move] of Object.entries(moves)) {
            const seq = parseInt(seqStr, 10);
            if (!seen.has(seq)) {
              seen.add(seq);
              callback(pid, move.dir, seq);
            }
          }
        }
      }
    );
    this.unsubscribers.push(unsub);
    return unsub;
  }

  onTileOwnerChange(
    callback: (key: string, playerId: string) => void
  ): () => void {
    if (!this.roomCode) return () => {};

    const unsub = onValue(
      ref(this.db, `rooms/${this.roomCode}/tileOwners`),
      (snap) => {
        const tiles = (snap.val() as Record<string, { playerId: string }>) || {};
        for (const [key, data] of Object.entries(tiles)) {
          callback(key, data.playerId);
        }
      }
    );
    this.unsubscribers.push(unsub);
    return unsub;
  }

  // --- Temizlik ---

  cleanup(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers    = [];
    this.processedMoves   = new Map();
    this.roomCode         = null;
  }
}
