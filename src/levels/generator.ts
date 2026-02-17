import { WALL, PATH, Direction } from '../utils/constants';
import { LevelData } from './types';
import { DifficultyConfig } from './procedural';

// Seeded PRNG - mulberry32
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIR_VECTORS: { dx: number; dy: number; dir: Direction }[] = [
  { dx: 0, dy: -1, dir: 'UP' },
  { dx: 0, dy: 1, dir: 'DOWN' },
  { dx: -1, dy: 0, dir: 'LEFT' },
  { dx: 1, dy: 0, dir: 'RIGHT' },
];

const OPPOSITE: Record<Direction, Direction> = {
  UP: 'DOWN',
  DOWN: 'UP',
  LEFT: 'RIGHT',
  RIGHT: 'LEFT',
};

// Fisher-Yates shuffle
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Slide simülasyonu: bir yönde duvara çarpana kadar kay
function simulateSlide(
  grid: number[],
  w: number,
  h: number,
  sx: number,
  sy: number,
  dx: number,
  dy: number
): { x: number; y: number; dist: number } {
  let cx = sx;
  let cy = sy;
  let dist = 0;
  while (true) {
    const nx = cx + dx;
    const ny = cy + dy;
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) break;
    if (grid[ny * w + nx] === WALL) break;
    cx = nx;
    cy = ny;
    dist++;
  }
  return { x: cx, y: cy, dist };
}

// Koridor aç: başlangıç noktasından belirli yönde karoları PATH yap
function carveCorridorFromPoint(
  grid: number[],
  w: number,
  h: number,
  sx: number,
  sy: number,
  dx: number,
  dy: number,
  minLen: number,
  maxLen: number,
  rng: () => number
): { x: number; y: number; length: number } | null {
  // Kaç karo açabileceğimizi hesapla
  let maxPossible = 0;
  let cx = sx;
  let cy = sy;

  while (true) {
    const nx = cx + dx;
    const ny = cy + dy;
    // Sınır kontrolü (en az 1 karo kenarda duvar kalsın)
    if (nx <= 0 || nx >= w - 1 || ny <= 0 || ny >= h - 1) break;
    // Yanlara sızma kontrolü: açılacak karo, slide yolunun yanlarında
    // başka PATH'lere bitişik olmamalı (kendi yolumuz hariç)
    const perpDx = dy;
    const perpDy = dx;
    let sideConflict = false;
    for (const mult of [-1, 1]) {
      const checkX = nx + perpDx * mult;
      const checkY = ny + perpDy * mult;
      if (checkX >= 0 && checkX < w && checkY >= 0 && checkY < h) {
        if (grid[checkY * w + checkX] === PATH) {
          // Yandaki PATH bizim koridorumuzdaki bir önceki karo değilse sorun
          if (!(checkX === cx && checkY === cy)) {
            sideConflict = true;
          }
        }
      }
    }
    // Koridorun önündeki karo da kontrol (2 karo ileri)
    const aheadX = nx + dx;
    const aheadY = ny + dy;
    if (aheadX >= 0 && aheadX < w && aheadY >= 0 && aheadY < h) {
      if (grid[aheadY * w + aheadX] === PATH && maxPossible >= minLen - 1) {
        // Eğer min uzunluğa ulaştıysak ve önde PATH varsa, burada durabiliriz
        break;
      }
    }

    if (sideConflict && maxPossible >= minLen) break;

    maxPossible++;
    cx = nx;
    cy = ny;

    if (grid[cy * w + cx] === PATH) {
      // Mevcut PATH'e çarptık
      break;
    }
  }

  if (maxPossible < minLen) return null;

  const len = Math.min(minLen + Math.floor(rng() * (maxLen - minLen + 1)), maxPossible);

  // Karoları aç
  let fx = sx;
  let fy = sy;
  for (let i = 0; i < len; i++) {
    fx += dx;
    fy += dy;
    grid[fy * w + fx] = PATH;
  }

  return { x: fx, y: fy, length: len };
}

// BFS ile tüm PATH karoların erişilebilir olduğunu kontrol et (slide mekaniği ile)
function validateConnectivity(
  grid: number[],
  w: number,
  h: number,
  startX: number,
  startY: number
): boolean {
  const pathCount = grid.filter((c) => c === PATH).length;
  const visited = new Set<string>();
  const queue: { x: number; y: number }[] = [{ x: startX, y: startY }];
  visited.add(`${startX},${startY}`);

  while (queue.length > 0) {
    const { x, y } = queue.shift()!;
    for (const { dx, dy } of DIR_VECTORS) {
      const result = simulateSlide(grid, w, h, x, y, dx, dy);
      if (result.dist > 0) {
        // Slide yolundaki tüm karoları ziyaret edilmiş say
        let cx = x;
        let cy = y;
        for (let i = 0; i < result.dist; i++) {
          cx += dx;
          cy += dy;
          const key = `${cx},${cy}`;
          if (!visited.has(key)) {
            visited.add(key);
            queue.push({ x: cx, y: cy });
          }
        }
      }
    }
  }

  return visited.size >= pathCount;
}

// Çözümü slide ile doğrula
function validateSolution(
  grid: number[],
  w: number,
  h: number,
  startX: number,
  startY: number,
  solution: Direction[]
): boolean {
  const painted = new Set<string>();
  let cx = startX;
  let cy = startY;
  painted.add(`${cx},${cy}`);

  for (const dir of solution) {
    const vec = DIR_VECTORS.find((v) => v.dir === dir)!;
    const result = simulateSlide(grid, w, h, cx, cy, vec.dx, vec.dy);
    if (result.dist === 0) return false;

    // Yol boyunca tüm karoları boya
    let px = cx;
    let py = cy;
    for (let i = 0; i < result.dist; i++) {
      px += vec.dx;
      py += vec.dy;
      painted.add(`${px},${py}`);
    }
    cx = result.x;
    cy = result.y;
  }

  const pathCount = grid.filter((c) => c === PATH).length;
  return painted.size >= pathCount;
}

// Ana labirent üretim fonksiyonu (Ters Çözüm Algoritması)
export function generateMaze(
  levelId: number,
  config: DifficultyConfig
): LevelData | null {
  const rng = mulberry32(levelId * 7919 + 1337);
  const { gridSize, minMoves, maxMoves, minCorridorLen, branchChance } = config;
  const w = gridSize;
  const h = gridSize;

  // Birden fazla deneme yap (deterministik seed ile)
  for (let attempt = 0; attempt < 30; attempt++) {
    const grid = new Array(w * h).fill(WALL);

    // Merkeze yakın rastgele başlangıç noktası (hedef nokta)
    const centerX = Math.floor(w / 2) + Math.floor((rng() - 0.5) * 2);
    const centerY = Math.floor(h / 2) + Math.floor((rng() - 0.5) * 2);
    // Sınırlardan en az 1 uzak ol
    const goalX = Math.max(1, Math.min(w - 2, centerX));
    const goalY = Math.max(1, Math.min(h - 2, centerY));
    grid[goalY * w + goalX] = PATH;

    // Ters çözüm: hedefe doğru geri giden bir yol oluştur
    const solutionMoves: Direction[] = [];
    let curX = goalX;
    let curY = goalY;
    const targetMoveCount = minMoves + Math.floor(rng() * (maxMoves - minMoves + 1));
    let success = true;

    for (let move = 0; move < targetMoveCount; move++) {
      const dirs = shuffle(DIR_VECTORS, rng);
      let carved = false;

      for (const { dx, dy, dir } of dirs) {
        const result = carveCorridorFromPoint(
          grid, w, h, curX, curY, dx, dy,
          minCorridorLen, minCorridorLen + 2, rng
        );

        if (result) {
          curX = result.x;
          curY = result.y;
          // Ters yön kaydet (çözüm tersten okunacak)
          solutionMoves.push(OPPOSITE[dir]);
          carved = true;
          break;
        }
      }

      if (!carved) {
        if (solutionMoves.length >= minMoves) break;
        success = false;
        break;
      }
    }

    if (!success || solutionMoves.length < minMoves) continue;

    // Başlangıç pozisyonu = son koridor bitişi
    const startX = curX;
    const startY = curY;

    // Çözüm ters sırada
    const solution = solutionMoves.reverse();

    // Dal ekleme: mevcut PATH karolarından rastgele dallar aç
    const pathTiles: { x: number; y: number }[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (grid[y * w + x] === PATH) {
          pathTiles.push({ x, y });
        }
      }
    }

    const shuffledPaths = shuffle(pathTiles, rng);
    for (const tile of shuffledPaths) {
      if (rng() > branchChance) continue;
      const dirs = shuffle(DIR_VECTORS, rng);
      for (const { dx, dy } of dirs) {
        carveCorridorFromPoint(
          grid, w, h, tile.x, tile.y, dx, dy,
          minCorridorLen, minCorridorLen + 1, rng
        );
        break; // Her tile'dan en fazla 1 dal
      }
    }

    // Doğrulama
    if (!validateConnectivity(grid, w, h, startX, startY)) continue;
    if (!validateSolution(grid, w, h, startX, startY, solution)) continue;

    return {
      id: levelId,
      name: `Seviye ${levelId}`,
      width: w,
      height: h,
      grid,
      startX,
      startY,
      targetMoves: solution.length,
      colorIndex: (levelId - 1) % 10,
      solution,
      difficulty: config.name,
    };
  }

  return null;
}
