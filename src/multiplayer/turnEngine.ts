import { LevelData } from '../levels/types';
import { computeSlide } from '../game/slide';
import { findCapturedCells } from './capture';
import {
  WALL, isPaintable, DIRECTIONS, Direction,
  CAPTURE_MAX_REGION_RATIO, CAPTURE_MIN_REGION, TurnSettings,
} from '../utils/constants';

// ===== SIRALI TAKTIK MODU: DETERMINISTIK MOTOR =====
// Tek doğruluk kaynağı hamle günlüğüdür. Tahta her zaman günlükten yeniden
// oynatılarak türetilir; aynı günlük her cihazda aynı tahtayı üretir.
// Bu yüzden host, senkron veya uzlaşma gerekmez: oyuncular farklı zamanlarda
// bağlansa bile herkes aynı sonucu görür.

export type TurnDir = 'U' | 'D' | 'L' | 'R' | 'P';

export interface TurnMove {
  s: number;     // koltuk
  d: TurnDir;    // yön, P = pas
  t?: number;    // zaman damgası (yalnızca gösterim için)
}

export interface TurnState {
  ownerSeat: Uint8Array;               // hücre → 0 | koltuk+1
  balls: { x: number; y: number }[];   // koltuk → konum
  scores: number[];                    // koltuk → karo sayısı
  used: number[];                      // koltuk → kullanılan hamle
  nextSeat: number;                    // sıradaki koltuk, -1 = bitti
  finished: boolean;
  lastMove: {
    seat: number;
    path: number[];
    captured: number[];
  } | null;
}

const DIR_MAP: Record<Exclude<TurnDir, 'P'>, Direction> = {
  U: 'UP', D: 'DOWN', L: 'LEFT', R: 'RIGHT',
};

export function dirToTurn(dir: Direction): TurnDir {
  switch (dir) {
    case 'UP': return 'U';
    case 'DOWN': return 'D';
    case 'LEFT': return 'L';
    case 'RIGHT': return 'R';
  }
}

// Firebase ardışık sayısal anahtarları dizi olarak da obje olarak da döndürebilir
export function normalizeMoves(raw: unknown): TurnMove[] {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : Object.keys(raw as object)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => (raw as Record<string, unknown>)[k]);
  return list.filter((m): m is TurnMove =>
    !!m && typeof (m as TurnMove).s === 'number' && typeof (m as TurnMove).d === 'string'
  );
}

// Sıradaki koltuk: son hamlenin koltuğundan sonraki, çekilmemiş ve hamlesi kalmış ilk koltuk.
// Aktif oyuncu ikiden azsa oyun biter.
export function computeNextSeat(
  moves: TurnMove[],
  seatCount: number,
  movesPerPlayer: number,
  resigned: boolean[]
): number {
  // Koltuk sayısı üzerinden say: eksik/boş dizi "kimse çekilmedi" demektir.
  // (resigned.filter ile saymak boş dizide aktif oyuncuyu sıfır bulup oyunu bitiriyordu.)
  let active = 0;
  for (let seat = 0; seat < seatCount; seat++) if (!resigned[seat]) active++;
  if (active < 2) return -1;

  const used = new Array<number>(seatCount).fill(0);
  for (const m of moves) if (m.s >= 0 && m.s < seatCount) used[m.s]++;

  const start = moves.length > 0 ? (moves[moves.length - 1].s + 1) % seatCount : 0;
  for (let i = 0; i < seatCount; i++) {
    const seat = (start + i) % seatCount;
    if (!resigned[seat] && used[seat] < movesPerPlayer) return seat;
  }
  return -1;
}

// Çarpışma açıksa rakip toplar geçici duvar olur
function gridWithBalls(
  grid: number[], w: number,
  balls: { x: number; y: number }[], mover: number
): number[] {
  const g = grid.slice();
  balls.forEach((b, seat) => {
    if (seat !== mover) g[b.y * w + b.x] = WALL;
  });
  return g;
}

// Bir koltuğun bu durumda yapabileceği geçerli hamleler
export function legalDirs(
  level: LevelData,
  balls: { x: number; y: number }[],
  seat: number,
  settings: Pick<TurnSettings, 'collide'>
): Direction[] {
  const w = level.width, h = level.height;
  const grid = settings.collide ? gridWithBalls(level.grid, w, balls, seat) : level.grid;
  const out: Direction[] = [];
  for (const dir of ['UP', 'DOWN', 'LEFT', 'RIGHT'] as Direction[]) {
    const d = DIRECTIONS[dir];
    if (computeSlide(grid, w, h, balls[seat].x, balls[seat].y, d.dx, d.dy)) out.push(dir);
  }
  return out;
}

export function replayTurnGame(
  level: LevelData,
  seatCount: number,
  moves: TurnMove[],
  settings: Pick<TurnSettings, 'movesPerPlayer' | 'capture' | 'collide'>,
  resigned: boolean[] = []
): TurnState {
  const w = level.width, h = level.height;
  const starts = level.starts ?? [{ x: level.startX, y: level.startY }];
  const ownerSeat = new Uint8Array(w * h);
  const balls = Array.from({ length: seatCount }, (_, i) => ({ ...starts[i % starts.length] }));
  const used = new Array<number>(seatCount).fill(0);

  const totalPaintable = level.grid.filter(isPaintable).length;
  const maxRegion = Math.floor(totalPaintable * CAPTURE_MAX_REGION_RATIO);

  // Köşeler baştan sahipli
  balls.forEach((b, seat) => { ownerSeat[b.y * w + b.x] = seat + 1; });

  let lastMove: TurnState['lastMove'] = null;

  for (const m of moves) {
    const seat = m.s;
    if (seat < 0 || seat >= seatCount) continue;
    used[seat]++;

    if (m.d === 'P') {
      lastMove = { seat, path: [], captured: [] };
      continue;
    }

    const dir = DIRECTIONS[DIR_MAP[m.d]];
    if (!dir) continue;

    const grid = settings.collide ? gridWithBalls(level.grid, w, balls, seat) : level.grid;
    const out = computeSlide(grid, w, h, balls[seat].x, balls[seat].y, dir.dx, dir.dy);
    if (!out) {
      // Geçersiz hamle günlüğe girmiş olabilir (eski istemci): pas say
      lastMove = { seat, path: [], captured: [] };
      continue;
    }

    const path = out.path.map((t) => t.y * w + t.x);
    for (const idx of path) ownerSeat[idx] = seat + 1;
    balls[seat] = { x: out.finalX, y: out.finalY };

    let captured: number[] = [];
    if (settings.capture && maxRegion >= CAPTURE_MIN_REGION) {
      const ballCells = new Set(balls.map((b) => b.y * w + b.x));
      const cells = findCapturedCells(ownerSeat, level.grid, w, h, seat, ballCells, maxRegion);
      if (cells.length >= CAPTURE_MIN_REGION) {
        for (const idx of cells) ownerSeat[idx] = seat + 1;
        captured = cells;
      }
    }

    lastMove = { seat, path, captured };
  }

  const scores = new Array<number>(seatCount).fill(0);
  for (let i = 0; i < ownerSeat.length; i++) {
    const v = ownerSeat[i];
    if (v > 0 && v <= seatCount) scores[v - 1]++;
  }

  const nextSeat = computeNextSeat(moves, seatCount, settings.movesPerPlayer, resigned);
  return { ownerSeat, balls, scores, used, nextSeat, finished: nextSeat === -1, lastMove };
}
