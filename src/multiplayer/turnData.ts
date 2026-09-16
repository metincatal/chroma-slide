import { TurnSettings } from '../utils/constants';
import { TurnMove, normalizeMoves, computeNextSeat } from './turnEngine';

// Sıralı oyun verisinin saf yardımcıları. Firebase'e bağımlı değildir;
// hem TurnRoom hem temizlik modülü (gcPolicy) kullanır, testte doğrudan çalışır.

export type TurnPhase = 'waiting' | 'playing' | 'finished';

export interface TurnPlayer {
  name: string;
  colorIndex: number;
  joinedAt: number;
  resigned?: boolean;
}

export interface TurnGameData {
  code: string;
  createdAt: number;
  hostId: string;
  state: TurnPhase;
  settings: TurnSettings;
  players: Record<string, TurnPlayer>;
  seatOrder: string[];
  moves: TurnMove[];
  lastMoveAt: number;
}

// Firebase ardışık sayısal anahtarları dizi ya da obje olarak döndürebilir
function normalizeStringList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string');
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    return Object.keys(obj)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => obj[k])
      .filter((x): x is string => typeof x === 'string');
  }
  return [];
}

export function normalizeGame(code: string, raw: unknown): TurnGameData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as {
    createdAt?: number; hostId?: string; state?: TurnPhase; settings?: TurnSettings;
    players?: Record<string, TurnPlayer>; seatOrder?: unknown; moves?: unknown; lastMoveAt?: number;
  };
  if (!r.settings || !r.hostId) return null;
  const seatOrder = normalizeStringList(r.seatOrder);
  return {
    code,
    createdAt: r.createdAt ?? 0,
    hostId: r.hostId,
    state: r.state ?? 'waiting',
    settings: r.settings,
    players: r.players ?? {},
    seatOrder,
    moves: normalizeMoves(r.moves),
    lastMoveAt: r.lastMoveAt ?? 0,
  };
}

export function resignedFlags(game: TurnGameData): boolean[] {
  return game.seatOrder.map((pid) => !!game.players[pid]?.resigned);
}

export function nextSeatOf(game: TurnGameData): number {
  return computeNextSeat(game.moves, game.seatOrder.length, game.settings.movesPerPlayer, resignedFlags(game));
}
