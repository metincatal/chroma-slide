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

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Slide simülasyonu
function simulateSlide(
  grid: number[], w: number, h: number,
  sx: number, sy: number, dx: number, dy: number
): { x: number; y: number; dist: number } {
  let cx = sx, cy = sy, dist = 0;
  while (true) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) break;
    if (grid[ny * w + nx] === WALL) break;
    cx = nx; cy = ny; dist++;
  }
  return { x: cx, y: cy, dist };
}

// Yeni WALL karolarını PATH'e çevir, sonra top mevcut PATH üzerinden kaymaya devam eder
function carveAndSlide(
  grid: number[], w: number, h: number,
  sx: number, sy: number, dx: number, dy: number,
  maxCarve: number
): { endX: number; endY: number; carved: number } | null {
  let newCarved = 0;
  let cx = sx, cy = sy;

  // Faz 1: Yeni karolar aç (WALL → PATH)
  for (let i = 0; i < maxCarve; i++) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 1 || nx >= w - 1 || ny < 1 || ny >= h - 1) break;
    if (grid[ny * w + nx] === PATH) break; // Mevcut PATH'e çarptı
    cx = nx; cy = ny;
    grid[cy * w + cx] = PATH;
    newCarved++;
  }

  if (newCarved === 0) return null;

  // Faz 2: Top mevcut PATH üzerinden kaymaya devam eder
  while (true) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) break;
    if (grid[ny * w + nx] !== PATH) break;
    cx = nx; cy = ny;
  }

  if (cx === sx && cy === sy) return null;
  return { endX: cx, endY: cy, carved: newCarved };
}

// BFS ile tüm PATH karoların erişilebilir olduğunu kontrol et
function validateConnectivity(
  grid: number[], w: number, h: number,
  startX: number, startY: number
): boolean {
  const pathCount = grid.filter(c => c === PATH).length;
  const visited = new Set<string>();
  const queue = [{ x: startX, y: startY }];
  visited.add(`${startX},${startY}`);

  while (queue.length > 0) {
    const { x, y } = queue.shift()!;
    for (const { dx, dy } of DIR_VECTORS) {
      const result = simulateSlide(grid, w, h, x, y, dx, dy);
      if (result.dist > 0) {
        let cx = x, cy = y;
        for (let i = 0; i < result.dist; i++) {
          cx += dx; cy += dy;
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

// Çözümü doğrula
function validateSolution(
  grid: number[], w: number, h: number,
  startX: number, startY: number, solution: Direction[]
): boolean {
  const painted = new Set<string>();
  let cx = startX, cy = startY;
  painted.add(`${cx},${cy}`);

  for (const dir of solution) {
    const vec = DIR_VECTORS.find(v => v.dir === dir)!;
    const result = simulateSlide(grid, w, h, cx, cy, vec.dx, vec.dy);
    if (result.dist === 0) return false;

    let px = cx, py = cy;
    for (let i = 0; i < result.dist; i++) {
      px += vec.dx; py += vec.dy;
      painted.add(`${px},${py}`);
    }
    cx = result.x; cy = result.y;
  }

  return painted.size >= grid.filter(c => c === PATH).length;
}

// Ana labirent üretim fonksiyonu
export function generateMaze(
  levelId: number,
  config: DifficultyConfig
): LevelData | null {
  const rng = mulberry32(levelId * 7919 + 1337);
  const { gridSize, minMoves, maxMoves } = config;
  const w = gridSize, h = gridSize;

  for (let attempt = 0; attempt < 80; attempt++) {
    const grid = new Array(w * h).fill(WALL);

    // Rastgele başlangıç noktası (kenarlardan uzak)
    let cx = 1 + Math.floor(rng() * (w - 2));
    let cy = 1 + Math.floor(rng() * (h - 2));
    grid[cy * w + cx] = PATH;

    const solutionMoves: Direction[] = [];
    let lastDir: Direction | null = null;

    for (let move = 0; move < maxMoves; move++) {
      // Yön seç - son yönden farklısını tercih et
      let dirs = shuffle(DIR_VECTORS, rng);
      if (lastDir) {
        const diff = dirs.filter(d => d.dir !== lastDir);
        const same = dirs.filter(d => d.dir === lastDir);
        dirs = [...diff, ...same];
      }

      let moved = false;
      for (const { dx, dy, dir } of dirs) {
        const maxCarve = 1 + Math.floor(rng() * 4); // 1-4 yeni karo
        const result = carveAndSlide(grid, w, h, cx, cy, dx, dy, maxCarve);
        if (!result) continue;

        cx = result.endX;
        cy = result.endY;
        solutionMoves.push(OPPOSITE[dir]);
        lastDir = dir;
        moved = true;
        break;
      }

      if (!moved) {
        if (solutionMoves.length >= minMoves) break;
        break;
      }
    }

    if (solutionMoves.length < minMoves) continue;

    const startX = cx, startY = cy;
    const solution = [...solutionMoves].reverse();

    // Doğrulama
    if (!validateSolution(grid, w, h, startX, startY, solution)) continue;
    if (!validateConnectivity(grid, w, h, startX, startY)) continue;

    // Kalite kontrolü: yeterli PATH karosu olmalı
    const pathCount = grid.filter(c => c === PATH).length;
    if (pathCount < solution.length * 2) continue;

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
