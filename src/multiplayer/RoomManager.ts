import {
  Database,
  ref,
  set,
  get,
  update,
  onValue,
  runTransaction,
  onDisconnect,
} from 'firebase/database';
import { Direction } from '../utils/constants';

export interface PlayerData {
  name: string;
  colorIndex: number;
  connected: boolean;
  score: number;
}

export type RoomState = 'waiting' | 'countdown' | 'playing' | 'finished';
export type RoomVisibility = 'public' | 'invite' | 'private';

export interface RoomInfo {
  state: RoomState;
  hostId: string;
  levelId: number;
  createdAt: number;
  gameStartAt: number | null;
  visibility?: RoomVisibility;
}

export interface PublicRoomEntry {
  hostName: string;
  playerCount: number;
  visibility: 'public' | 'invite';
  createdAt: number;
  code: string; // İstemci tarafında eklenir
}

export interface JoinRequest {
  name: string;
  colorIndex: number;
  timestamp: number;
}

export interface RematchData {
  requestedBy: string;
  accepted?: Record<string, boolean>;
}

export class RoomManager {
  private db: Database;
  private myId: string;
  private roomCode: string | null = null;
  private unsubscribers: (() => void)[] = [];
  // Daha önce işlenen hamleleri takip et (duplicate önlemek için)
  private processedMoves: Map<string, Set<number>> = new Map();

  constructor(db: Database, playerId: string) {
    this.db   = db;
    this.myId = playerId;
  }

  get playerId(): string { return this.myId; }
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

  async createRoom(
    name: string,
    colorIndex: number,
    visibility: RoomVisibility = 'private'
  ): Promise<string> {
    let code = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      code = this.generateCode();
      const snap = await get(ref(this.db, `rooms/${code}`));
      if (!snap.exists()) break;
    }
    if (!code) throw new Error('Benzersiz oda kodu üretilemedi');

    this.roomCode = code;

    // Oda ve host oyuncuyu aynı anda yaz
    const updates: Record<string, unknown> = {
      [`rooms/${code}/state`]:       'waiting',
      [`rooms/${code}/hostId`]:      this.myId,
      [`rooms/${code}/levelId`]:     1,
      [`rooms/${code}/createdAt`]:   Date.now(),
      [`rooms/${code}/gameStartAt`]: null,
      [`rooms/${code}/visibility`]:  visibility,
      [`rooms/${code}/players/${this.myId}`]: {
        name,
        colorIndex,
        connected: true,
        score:     0,
      },
    };

    // Açık veya istekli odayı publicRooms'a ekle
    if (visibility === 'public' || visibility === 'invite') {
      updates[`publicRooms/${code}`] = {
        hostName:    name,
        playerCount: 1,
        visibility,
        createdAt:   Date.now(),
      };
    }

    await update(ref(this.db), updates);

    // Bağlantı kesilince oyuncuyu disconnected yap
    onDisconnect(ref(this.db, `rooms/${code}/players/${this.myId}/connected`))
      .set(false);

    // Bağlantı kesilince publicRooms kaydını sil
    if (visibility === 'public' || visibility === 'invite') {
      onDisconnect(ref(this.db, `publicRooms/${code}`)).remove();
    }

    return code;
  }

  async joinRoom(code: string, name: string, colorIndex: number): Promise<void> {
    const roomSnap = await get(ref(this.db, `rooms/${code}`));
    if (!roomSnap.exists()) throw new Error('Oda bulunamadı');

    const room = roomSnap.val() as RoomInfo;
    if (room.state === 'playing')  throw new Error('Oyun zaten başlamış');
    if (room.state === 'finished') throw new Error('Oyun bitti');

    const playersSnap = await get(ref(this.db, `rooms/${code}/players`));
    const players = playersSnap.val() || {};
    const connectedCount = Object.values(players as Record<string, PlayerData>)
      .filter((p) => p.connected).length;
    if (connectedCount >= 4) throw new Error('Oda dolu (max 4 oyuncu)');

    this.roomCode = code;

    const updates: Record<string, unknown> = {
      [`rooms/${code}/players/${this.myId}`]: {
        name,
        colorIndex,
        connected: true,
        score:     0,
      },
    };

    // Açık/istekli odalarda playerCount güncelle
    const visib = room.visibility;
    if (visib === 'public' || visib === 'invite') {
      updates[`publicRooms/${code}/playerCount`] = connectedCount + 1;
    }

    await update(ref(this.db), updates);

    onDisconnect(ref(this.db, `rooms/${code}/players/${this.myId}/connected`))
      .set(false);
  }

  // --- İstek tabanlı katılım (invite odalar) ---

  async sendJoinRequest(code: string, name: string, colorIndex: number): Promise<void> {
    const roomSnap = await get(ref(this.db, `rooms/${code}`));
    if (!roomSnap.exists()) throw new Error('Oda bulunamadı');

    await set(ref(this.db, `rooms/${code}/joinRequests/${this.myId}`), {
      name,
      colorIndex,
      timestamp: Date.now(),
    });
  }

  async approveRequest(
    requesterId: string,
    requesterName: string,
    requesterColorIndex: number
  ): Promise<void> {
    if (!this.roomCode) return;
    const updates: Record<string, unknown> = {
      [`rooms/${this.roomCode}/players/${requesterId}`]: {
        name:       requesterName,
        colorIndex: requesterColorIndex,
        connected:  true,
        score:      0,
      },
      [`rooms/${this.roomCode}/joinRequests/${requesterId}`]: null,
    };

    // publicRooms playerCount'u güncelle
    const snap = await get(ref(this.db, `publicRooms/${this.roomCode}/playerCount`));
    if (snap.exists()) {
      updates[`publicRooms/${this.roomCode}/playerCount`] = (snap.val() as number) + 1;
    }

    await update(ref(this.db), updates);
  }

  async declineRequest(requesterId: string): Promise<void> {
    if (!this.roomCode) return;
    await set(ref(this.db, `rooms/${this.roomCode}/joinRequests/${requesterId}`), null);
  }

  onJoinRequests(
    callback: (requests: Record<string, JoinRequest>) => void
  ): () => void {
    if (!this.roomCode) return () => {};
    const unsub = onValue(
      ref(this.db, `rooms/${this.roomCode}/joinRequests`),
      (snap) => callback((snap.val() as Record<string, JoinRequest>) || {})
    );
    this.unsubscribers.push(unsub);
    return unsub;
  }

  // --- Aktif oda listesi ---

  listenToPublicRooms(
    callback: (rooms: PublicRoomEntry[]) => void
  ): () => void {
    const unsub = onValue(
      ref(this.db, 'publicRooms'),
      (snap) => {
        const raw = (snap.val() as Record<string, Omit<PublicRoomEntry, 'code'>>) || {};
        const list: PublicRoomEntry[] = Object.entries(raw).map(([code, data]) => ({
          ...data,
          code,
        }));
        callback(list);
      }
    );
    this.unsubscribers.push(unsub);
    return unsub;
  }

  async removePublicRoom(): Promise<void> {
    if (!this.roomCode) return;
    await set(ref(this.db, `publicRooms/${this.roomCode}`), null);
  }

  // --- Oyun başlatma (atomik) ---

  async startGame(levelId: number): Promise<void> {
    if (!this.roomCode) throw new Error('Odada değilsiniz');
    const now = Date.now();
    await update(ref(this.db, `rooms/${this.roomCode}`), {
      levelId,
      state:       'countdown',
      gameStartAt: now + 3000,
    });
    // Oyun başlayınca publicRooms'tan sil
    await this.removePublicRoom();
  }

  // --- Hamle gönderme ---

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

  // --- Rematch ---

  async requestRematch(): Promise<void> {
    if (!this.roomCode) return;
    await set(ref(this.db, `rooms/${this.roomCode}/rematch`), {
      requestedBy: this.myId,
      accepted:    {},
    });
  }

  async respondToRematch(accept: boolean): Promise<void> {
    if (!this.roomCode) return;
    await set(
      ref(this.db, `rooms/${this.roomCode}/rematch/accepted/${this.myId}`),
      accept
    );
  }

  onRematchChange(
    callback: (rematch: RematchData | null) => void
  ): () => void {
    if (!this.roomCode) return () => {};
    const unsub = onValue(
      ref(this.db, `rooms/${this.roomCode}/rematch`),
      (snap) => callback(snap.exists() ? (snap.val() as RematchData) : null)
    );
    this.unsubscribers.push(unsub);
    return unsub;
  }

  // --- Oda terk ---

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
    this.unsubscribers  = [];
    this.processedMoves = new Map();
    this.roomCode       = null;
  }
}
