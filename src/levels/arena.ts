import { WALL, PATH, MP_ARENA_SIZES } from '../utils/constants';
import { LevelData } from './types';
import { mulberry32 } from './generator';

// ===== ÇOK OYUNCULU ARENA HARİTALARI =====
// - 4 kat dönme simetrisi: dört köşe birbirine denk, adil başlangıç
// - Açık alan + sütunlar: kayma için duraklama noktaları
// - Her yol karosu en az bir kaydırma ile boyanabilir (BFS ile doğrulanır)

export const ARENA_COUNT = 500;

export interface ArenaStats {
  pathCount: number;
  stopCount: number;
  avgSlide: number;
  deadEnds: number;
  coverage: number;
}

// 90 derece döndür: (x, y) → (n-1-y, x)
function rotate(x: number, y: number, n: number): { x: number; y: number } {
  return { x: n - 1 - y, y: x };
}

// Hücrenin dönme yörüngesindeki en küçük indeks (kanonik anahtar)
function orbitKey(x: number, y: number, n: number): number {
  let min = y * n + x;
  let cx = x, cy = y;
  for (let i = 0; i < 3; i++) {
    const r = rotate(cx, cy, n);
    cx = r.x; cy = r.y;
    min = Math.min(min, cy * n + cx);
  }
  return min;
}

// Simetrik aday harita: kenarlar duvar, iç alan yol, yörünge bazlı sütunlar
function buildCandidate(rng: () => number, n: number, density: number): number[] {
  const grid = new Array<number>(n * n).fill(WALL);
  for (let y = 1; y < n - 1; y++)
    for (let x = 1; x < n - 1; x++)
      grid[y * n + x] = PATH;

  // Köşe başlangıçları ve iki komşusu daima yol
  const protectedKeys = new Set([
    orbitKey(1, 1, n), orbitKey(2, 1, n), orbitKey(1, 2, n),
  ]);
  const decided = new Map<number, boolean>();

  for (let y = 1; y < n - 1; y++) {
    for (let x = 1; x < n - 1; x++) {
      const k = orbitKey(x, y, n);
      if (!decided.has(k)) {
        decided.set(k, !protectedKeys.has(k) && rng() < density);
      }
      if (decided.get(k)) grid[y * n + x] = WALL;
    }
  }
  return grid;
}

// İç alanda 2x2 duvar bloğu var mı (alan israfı)
function has2x2Wall(grid: number[], n: number): boolean {
  for (let y = 1; y < n - 2; y++) {
    for (let x = 1; x < n - 2; x++) {
      if (
        grid[y * n + x] === WALL && grid[y * n + x + 1] === WALL &&
        grid[(y + 1) * n + x] === WALL && grid[(y + 1) * n + x + 1] === WALL
      ) return true;
    }
  }
  return false;
}

const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]] as const;

// Kaydırma erişilebilirliği: köşeden başlayıp tüm duraklama noktalarını gez,
// geçilen karoları "kapsandı" say. Kenarlar duvar olduğu için sınır kontrolü gerekmez.
function analyze(grid: number[], n: number, sx: number, sy: number): ArenaStats {
  const visited = new Uint8Array(n * n);
  const covered = new Uint8Array(n * n);
  const start = sy * n + sx;
  const queue: number[] = [start];
  visited[start] = 1;
  covered[start] = 1;
  let slides = 0, totalLen = 0;

  while (queue.length) {
    const cur = queue.pop()!;
    const cx = cur % n, cy = (cur - cx) / n;
    for (const [dx, dy] of DIRS) {
      let x = cx, y = cy, len = 0;
      while (grid[(y + dy) * n + (x + dx)] !== WALL) {
        x += dx; y += dy; len++;
        covered[y * n + x] = 1;
      }
      if (len === 0) continue;
      slides++; totalLen += len;
      const end = y * n + x;
      if (!visited[end]) { visited[end] = 1; queue.push(end); }
    }
  }

  let pathCount = 0, coveredCount = 0, stopCount = 0, deadEnds = 0;
  for (let i = 0; i < n * n; i++) {
    if (grid[i] !== PATH) continue;
    pathCount++;
    if (covered[i]) coveredCount++;
    if (visited[i]) stopCount++;
    const x = i % n, y = (i - x) / n;
    let walls = 0;
    for (const [dx, dy] of DIRS) if (grid[(y + dy) * n + (x + dx)] === WALL) walls++;
    if (walls >= 3) deadEnds++;
  }

  return {
    pathCount,
    stopCount,
    avgSlide: slides ? totalLen / slides : 0,
    deadEnds,
    coverage: pathCount ? coveredCount / pathCount : 0,
  };
}

export function getArenaStats(level: LevelData): ArenaStats {
  return analyze(level.grid, level.width, level.startX, level.startY);
}

const arenaCache = new Map<number, LevelData>();

export function generateArena(id: number, size = 13): LevelData {
  const n = (MP_ARENA_SIZES as readonly number[]).includes(size) ? size : 13;
  const cacheKey = n * 10000 + id;
  const cached = arenaCache.get(cacheKey);
  if (cached) return cached;

  const innerArea = (n - 2) * (n - 2);

  let chosen: number[] | null = null;
  let fallback: number[] | null = null;
  let fallbackCoverage = -1;

  outer:
  for (const strict of [true, false]) {
    for (let seedOffset = 0; seedOffset < 40; seedOffset++) {
      const rng = mulberry32(id * 4099 + seedOffset * 7331 + 777);
      for (let attempt = 0; attempt < 60; attempt++) {
        const density = 0.15 + rng() * 0.10;
        const grid = buildCandidate(rng, n, density);
        if (has2x2Wall(grid, n)) continue;

        const st = analyze(grid, n, 1, 1);
        if (st.coverage > fallbackCoverage) { fallbackCoverage = st.coverage; fallback = grid; }
        if (st.coverage < 1) continue;

        if (strict) {
          // Ne çok boş (uzun düz kaymalar) ne çok dolu
          if (st.pathCount < innerArea * 0.68) continue;
          if (st.pathCount > innerArea * 0.86) continue;
          if (st.stopCount < st.pathCount * 0.3) continue;
          if (st.avgSlide < 1.8 || st.avgSlide > 5) continue;
          if (st.deadEnds > 4) continue;
        }
        chosen = grid;
        break outer;
      }
    }
  }

  const grid = chosen ?? fallback ?? buildCandidate(mulberry32(id), n, 0.2);

  // Koltuk sırası: 0 sol-üst, 1 sağ-alt (karşı köşe), 2 sağ-üst, 3 sol-alt
  const starts = [
    { x: 1, y: 1 },
    { x: n - 2, y: n - 2 },
    { x: n - 2, y: 1 },
    { x: 1, y: n - 2 },
  ];

  const level: LevelData = {
    id,
    name: `Arena ${id}`,
    width: n,
    height: n,
    grid,
    startX: starts[0].x,
    startY: starts[0].y,
    targetMoves: 0,
    colorIndex: (id - 1) % 10,
    starts,
    difficulty: 'Arena',
    mode: 'thinking',
  };
  arenaCache.set(cacheKey, level);
  return level;
}
