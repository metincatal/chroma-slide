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

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Slide simulasyonu - top durana kadar kaydirir
function simulateSlide(
  grid: number[], w: number, h: number,
  sx: number, sy: number, dx: number, dy: number
): { x: number; y: number; dist: number; tiles: { x: number; y: number }[] } {
  let cx = sx, cy = sy;
  const tiles: { x: number; y: number }[] = [];
  while (true) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) break;
    if (grid[ny * w + nx] === WALL) break;
    cx = nx; cy = ny;
    tiles.push({ x: cx, y: cy });
  }
  return { x: cx, y: cy, dist: tiles.length, tiles };
}

// DFS solver: tum PATH karolarini boyayan cozum bul
function solvePuzzle(
  grid: number[], w: number, h: number,
  startX: number, startY: number,
  maxDepth: number
): Direction[] | null {
  const totalPath = grid.filter(c => c === PATH).length;

  // Bitset ile hizli painted takibi
  function dfs(
    x: number, y: number,
    paintedBits: Uint8Array,
    paintedCount: number,
    moves: Direction[],
    depth: number
  ): Direction[] | null {
    if (paintedCount >= totalPath) return [...moves];
    if (depth >= maxDepth) return null;

    for (const { dx, dy, dir } of DIR_VECTORS) {
      const slide = simulateSlide(grid, w, h, x, y, dx, dy);
      if (slide.dist === 0) continue;

      // Yeni boyanan karo sayisini hesapla
      let newCount = 0;
      const changedIndices: number[] = [];
      for (const t of slide.tiles) {
        const idx = t.y * w + t.x;
        if (!paintedBits[idx]) {
          paintedBits[idx] = 1;
          changedIndices.push(idx);
          newCount++;
        }
      }

      if (newCount === 0) {
        // Geri al
        for (const idx of changedIndices) paintedBits[idx] = 0;
        continue;
      }

      moves.push(dir);
      const result = dfs(slide.x, slide.y, paintedBits, paintedCount + newCount, moves, depth + 1);
      if (result) return result;
      moves.pop();

      // Geri al
      for (const idx of changedIndices) paintedBits[idx] = 0;
    }

    return null;
  }

  const paintedBits = new Uint8Array(w * h);
  paintedBits[startY * w + startX] = 1;
  return dfs(startX, startY, paintedBits, 1, [], 0);
}

// Kavsak noktasi sayisi (topun 2+ yonde gidebildigi yerler)
function countJunctions(grid: number[], w: number, h: number): number {
  let junctions = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y * w + x] !== PATH) continue;
      let directions = 0;
      for (const { dx, dy } of DIR_VECTORS) {
        const slide = simulateSlide(grid, w, h, x, y, dx, dy);
        if (slide.dist > 0) directions++;
      }
      if (directions >= 3) junctions++;
    }
  }
  return junctions;
}

// ===== STRATEJI 1: Dallanmali Koridor Agi =====
// Ana yol + dallar olusturur, kavsaklar yaratir
function generateBranchingMaze(
  rng: () => number, w: number, h: number, config: DifficultyConfig
): { grid: number[]; startX: number; startY: number } | null {
  const grid = new Array(w * h).fill(WALL);
  const branchPoints: { x: number; y: number; fromDir: Direction }[] = [];

  // Ana omurga: Ortadan gecen kivrilan yol
  let cx = 1 + Math.floor(rng() * (w - 2));
  let cy = 1 + Math.floor(rng() * (h - 2));
  grid[cy * w + cx] = PATH;

  const startX = cx, startY = cy;
  let lastDir: Direction | null = null;

  // Ana yol olustur (6-14 segment)
  const mainSegments = config.minMoves + Math.floor(rng() * (config.maxMoves - config.minMoves));
  for (let seg = 0; seg < mainSegments; seg++) {
    let dirs = shuffle(DIR_VECTORS, rng);
    // Son yonun tersini oncelikle disla (geri gitmesin)
    if (lastDir) {
      const opp = lastDir === 'UP' ? 'DOWN' : lastDir === 'DOWN' ? 'UP' : lastDir === 'LEFT' ? 'RIGHT' : 'LEFT';
      dirs = dirs.filter(d => d.dir !== opp);
      if (dirs.length === 0) dirs = shuffle(DIR_VECTORS, rng);
    }

    let carved = false;
    for (const { dx, dy, dir } of dirs) {
      const len = 2 + Math.floor(rng() * 4); // 2-5 karo uzunlugunda segment
      let nx = cx, ny = cy;
      let canCarve = true;
      const newTiles: { x: number; y: number }[] = [];

      for (let i = 0; i < len; i++) {
        nx += dx; ny += dy;
        if (nx < 1 || nx >= w - 1 || ny < 1 || ny >= h - 1) { canCarve = false; break; }
        newTiles.push({ x: nx, y: ny });
      }

      if (!canCarve || newTiles.length === 0) continue;

      // En az 1 yeni karo acilmali
      const newCount = newTiles.filter(t => grid[t.y * w + t.x] === WALL).length;
      if (newCount === 0) continue;

      for (const t of newTiles) grid[t.y * w + t.x] = PATH;

      // Dal noktasi olarak kaydet
      if (seg > 1 && rng() > 0.3) {
        branchPoints.push({ x: cx, y: cy, fromDir: dir });
      }

      cx = newTiles[newTiles.length - 1].x;
      cy = newTiles[newTiles.length - 1].y;
      lastDir = dir;
      carved = true;
      break;
    }

    if (!carved) break;
  }

  // Dallar ekle - ana yoldan ayrilip dead-end veya loop olusturur
  const branchCount = Math.max(2, Math.floor(config.minMoves * 0.5));
  const shuffledBranches = shuffle(branchPoints, rng);

  for (let b = 0; b < Math.min(branchCount, shuffledBranches.length); b++) {
    const bp = shuffledBranches[b];
    let bx = bp.x, by = bp.y;

    // Dal icin farkli yon sec
    const branchDirs = shuffle(DIR_VECTORS, rng);
    for (const { dx, dy } of branchDirs) {
      const branchLen = 2 + Math.floor(rng() * 3);
      let valid = true;
      const newTiles: { x: number; y: number }[] = [];

      for (let i = 0; i < branchLen; i++) {
        const nx = bx + dx * (i + 1);
        const ny = by + dy * (i + 1);
        if (nx < 1 || nx >= w - 1 || ny < 1 || ny >= h - 1) { valid = false; break; }
        newTiles.push({ x: nx, y: ny });
      }

      if (!valid || newTiles.length < 2) continue;

      const wallCount = newTiles.filter(t => grid[t.y * w + t.x] === WALL).length;
      if (wallCount < 1) continue;

      for (const t of newTiles) grid[t.y * w + t.x] = PATH;
      break;
    }
  }

  const pathCount = grid.filter(c => c === PATH).length;
  if (pathCount < config.minMoves * 2) return null;

  return { grid, startX, startY };
}

// ===== STRATEJI 2: Oda + Sutun Tabanlı =====
// Acik alanlar icinde duvar sutunlari ile durma noktalari olusturur
function generateRoomMaze(
  rng: () => number, w: number, h: number, config: DifficultyConfig
): { grid: number[]; startX: number; startY: number } | null {
  const grid = new Array(w * h).fill(WALL);

  // Ic alani ac (kenar duvarlari birak)
  const margin = 1;
  for (let y = margin; y < h - margin; y++) {
    for (let x = margin; x < w - margin; x++) {
      grid[y * w + x] = PATH;
    }
  }

  // Duvar sutunlari ve bloklari yerlestir
  // Sutun yogunlugu zorluga gore artar
  const innerW = w - 2 * margin;
  const innerH = h - 2 * margin;
  const pillarDensity = 0.30 + rng() * 0.15; // %30-45 duvara cevir
  const targetWalls = Math.floor(innerW * innerH * pillarDensity);

  // Farkli sekillerde duvarlar ekle: tekil sutunlar, L sekli, cizgiler
  let wallsPlaced = 0;
  for (let attempt = 0; attempt < targetWalls * 3 && wallsPlaced < targetWalls; attempt++) {
    const shapeType = rng();
    const px = margin + Math.floor(rng() * innerW);
    const py = margin + Math.floor(rng() * innerH);

    if (shapeType < 0.4) {
      // Tekil sutun
      if (grid[py * w + px] === PATH) {
        grid[py * w + px] = WALL;
        wallsPlaced++;
      }
    } else if (shapeType < 0.7) {
      // Yatay veya dikey cizgi (2-3 karo)
      const len = 2 + Math.floor(rng() * 2);
      const horizontal = rng() > 0.5;
      const tiles: { x: number; y: number }[] = [];
      for (let i = 0; i < len; i++) {
        const nx = horizontal ? px + i : px;
        const ny = horizontal ? py : py + i;
        if (nx >= margin && nx < w - margin && ny >= margin && ny < h - margin && grid[ny * w + nx] === PATH) {
          tiles.push({ x: nx, y: ny });
        }
      }
      if (tiles.length >= 2) {
        for (const t of tiles) {
          grid[t.y * w + t.x] = WALL;
          wallsPlaced++;
        }
      }
    } else {
      // L sekli
      if (px + 1 < w - margin && py + 1 < h - margin) {
        const tiles = [
          { x: px, y: py },
          { x: px + 1, y: py },
          { x: px, y: py + 1 },
        ];
        const allPath = tiles.every(t => grid[t.y * w + t.x] === PATH);
        if (allPath) {
          for (const t of tiles) {
            grid[t.y * w + t.x] = WALL;
            wallsPlaced++;
          }
        }
      }
    }
  }

  // Baslangic noktasi sec (PATH olan bir karo)
  const pathTiles: { x: number; y: number }[] = [];
  for (let y = margin; y < h - margin; y++) {
    for (let x = margin; x < w - margin; x++) {
      if (grid[y * w + x] === PATH) pathTiles.push({ x, y });
    }
  }

  if (pathTiles.length < config.minMoves * 2) return null;

  const start = pathTiles[Math.floor(rng() * pathTiles.length)];

  // Baglantilik kontrolu - BFS ile tum PATH'ler erisilebilir mi
  const visited = new Set<number>();
  const queue = [start.y * w + start.x];
  visited.add(queue[0]);
  while (queue.length > 0) {
    const idx = queue.shift()!;
    const x = idx % w, y = Math.floor(idx / w);
    for (const { dx, dy } of DIR_VECTORS) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        const nIdx = ny * w + nx;
        if (grid[nIdx] === PATH && !visited.has(nIdx)) {
          visited.add(nIdx);
          queue.push(nIdx);
        }
      }
    }
  }

  // Erisilemez PATH'leri duvar yap
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y * w + x] === PATH && !visited.has(y * w + x)) {
        grid[y * w + x] = WALL;
      }
    }
  }

  const finalPathCount = grid.filter(c => c === PATH).length;
  if (finalPathCount < config.minMoves * 2) return null;

  return { grid, startX: start.x, startY: start.y };
}

// ===== STRATEJI 3: Kafes Tabanlı (Grid Pattern) =====
// Duzgun aralikli koridorlar + rastgele duvar acma/kapama
function generateGridMaze(
  rng: () => number, w: number, h: number, config: DifficultyConfig
): { grid: number[]; startX: number; startY: number } | null {
  const grid = new Array(w * h).fill(WALL);

  // Her 2 karoda bir koridor olustur (kafes deseni)
  const spacing = 2;
  for (let y = 1; y < h - 1; y += spacing) {
    for (let x = 1; x < w - 1; x++) {
      grid[y * w + x] = PATH;
    }
  }
  for (let x = 1; x < w - 1; x += spacing) {
    for (let y = 1; y < h - 1; y++) {
      grid[y * w + x] = PATH;
    }
  }

  // Rastgele bazi koridorlari kapat (labirent olustur)
  const removeChance = 0.35 + rng() * 0.15;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (grid[y * w + x] === PATH && rng() < removeChance) {
        // Kapatmak guvenli mi? (cok fazla yol kesmemeli)
        grid[y * w + x] = WALL;
      }
    }
  }

  // Baglantilik kontrolu
  const pathTiles: { x: number; y: number }[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (grid[y * w + x] === PATH) pathTiles.push({ x, y });
    }
  }

  if (pathTiles.length < config.minMoves * 2) return null;

  const start = pathTiles[Math.floor(rng() * pathTiles.length)];

  // BFS baglantilik
  const visited = new Set<number>();
  const queue = [start.y * w + start.x];
  visited.add(queue[0]);
  while (queue.length > 0) {
    const idx = queue.shift()!;
    const x = idx % w, y = Math.floor(idx / w);
    for (const { dx, dy } of DIR_VECTORS) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        const nIdx = ny * w + nx;
        if (grid[nIdx] === PATH && !visited.has(nIdx)) {
          visited.add(nIdx);
          queue.push(nIdx);
        }
      }
    }
  }

  // Erisilemez alanlari kapat
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y * w + x] === PATH && !visited.has(y * w + x)) {
        grid[y * w + x] = WALL;
      }
    }
  }

  const finalPathCount = grid.filter(c => c === PATH).length;
  if (finalPathCount < config.minMoves * 2) return null;

  return { grid, startX: start.x, startY: start.y };
}

// Ana labirent uretim fonksiyonu
export function generateMaze(
  levelId: number,
  config: DifficultyConfig
): LevelData | null {
  const rng = mulberry32(levelId * 7919 + 1337);
  const { gridSize, minMoves, maxMoves } = config;
  const w = gridSize, h = gridSize;
  const maxSolverDepth = maxMoves + 6;

  for (let attempt = 0; attempt < 150; attempt++) {
    // Farkli stratejiler dongusel dene
    const strategyRoll = rng();
    let result: { grid: number[]; startX: number; startY: number } | null = null;

    if (strategyRoll < 0.35) {
      result = generateBranchingMaze(rng, w, h, config);
    } else if (strategyRoll < 0.70) {
      result = generateRoomMaze(rng, w, h, config);
    } else {
      result = generateGridMaze(rng, w, h, config);
    }

    if (!result) continue;

    const { grid, startX, startY } = result;

    // Puzzle'i coz
    const solution = solvePuzzle(grid, w, h, startX, startY, maxSolverDepth);
    if (!solution) continue;

    // Cozum uzunlugu kontrolu
    if (solution.length < minMoves || solution.length > maxMoves + 4) continue;

    // Kalite kontrolu: yeterli kavsak noktasi olsun
    const junctions = countJunctions(grid, w, h);
    const minJunctions = Math.max(1, Math.floor(minMoves * 0.15));
    if (junctions < minJunctions) continue;

    // PATH sayisi kontrolu
    const pathCount = grid.filter(c => c === PATH).length;
    if (pathCount < solution.length * 1.5) continue;

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
