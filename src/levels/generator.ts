import { WALL, PATH, Direction, GameMode } from '../utils/constants';
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
        for (const idx of changedIndices) paintedBits[idx] = 0;
        continue;
      }

      moves.push(dir);
      const result = dfs(slide.x, slide.y, paintedBits, paintedCount + newCount, moves, depth + 1);
      if (result) return result;
      moves.pop();

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

// BFS baglantilik kontrolu
function bfsConnected(grid: number[], w: number, h: number, startX: number, startY: number): Set<number> {
  const visited = new Set<number>();
  const queue = [startY * w + startX];
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
  return visited;
}

// ===== STRATEJI 1: Dallanmali Koridor Agi =====
function generateBranchingMaze(
  rng: () => number, w: number, h: number, config: DifficultyConfig
): { grid: number[]; startX: number; startY: number } | null {
  const grid = new Array(w * h).fill(WALL);
  const branchPoints: { x: number; y: number; fromDir: Direction }[] = [];

  let cx = 1 + Math.floor(rng() * (w - 2));
  let cy = 1 + Math.floor(rng() * (h - 2));
  grid[cy * w + cx] = PATH;

  const startX = cx, startY = cy;
  let lastDir: Direction | null = null;

  const mainSegments = config.minMoves + Math.floor(rng() * (config.maxMoves - config.minMoves));
  for (let seg = 0; seg < mainSegments; seg++) {
    let dirs = shuffle(DIR_VECTORS, rng);
    if (lastDir) {
      const opp = lastDir === 'UP' ? 'DOWN' : lastDir === 'DOWN' ? 'UP' : lastDir === 'LEFT' ? 'RIGHT' : 'LEFT';
      dirs = dirs.filter(d => d.dir !== opp);
      if (dirs.length === 0) dirs = shuffle(DIR_VECTORS, rng);
    }

    let carved = false;
    for (const { dx, dy, dir } of dirs) {
      const len = 2 + Math.floor(rng() * 4);
      let nx = cx, ny = cy;
      let canCarve = true;
      const newTiles: { x: number; y: number }[] = [];

      for (let i = 0; i < len; i++) {
        nx += dx; ny += dy;
        if (nx < 1 || nx >= w - 1 || ny < 1 || ny >= h - 1) { canCarve = false; break; }
        newTiles.push({ x: nx, y: ny });
      }

      if (!canCarve || newTiles.length === 0) continue;

      const newCount = newTiles.filter(t => grid[t.y * w + t.x] === WALL).length;
      if (newCount === 0) continue;

      for (const t of newTiles) grid[t.y * w + t.x] = PATH;

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

  const branchCount = Math.max(2, Math.floor(config.minMoves * 0.5));
  const shuffledBranches = shuffle(branchPoints, rng);

  for (let b = 0; b < Math.min(branchCount, shuffledBranches.length); b++) {
    const bp = shuffledBranches[b];
    const bx = bp.x, by = bp.y;

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
function generateRoomMaze(
  rng: () => number, w: number, h: number, config: DifficultyConfig
): { grid: number[]; startX: number; startY: number } | null {
  const grid = new Array(w * h).fill(WALL);

  const margin = 1;
  for (let y = margin; y < h - margin; y++) {
    for (let x = margin; x < w - margin; x++) {
      grid[y * w + x] = PATH;
    }
  }

  const innerW = w - 2 * margin;
  const innerH = h - 2 * margin;
  const pillarDensity = 0.30 + rng() * 0.15;
  const targetWalls = Math.floor(innerW * innerH * pillarDensity);

  let wallsPlaced = 0;
  for (let attempt = 0; attempt < targetWalls * 3 && wallsPlaced < targetWalls; attempt++) {
    const shapeType = rng();
    const px = margin + Math.floor(rng() * innerW);
    const py = margin + Math.floor(rng() * innerH);

    if (shapeType < 0.30) {
      // Tekil sutun
      if (grid[py * w + px] === PATH) {
        grid[py * w + px] = WALL;
        wallsPlaced++;
      }
    } else if (shapeType < 0.50) {
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
    } else if (shapeType < 0.75) {
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
    } else {
      // Dolu blok: 2x2, 2x3, 3x2
      const blockTypes = [[2,2],[2,3],[3,2]];
      const [bw, bh] = blockTypes[Math.floor(rng() * blockTypes.length)];
      if (px + bw <= w - margin && py + bh <= h - margin) {
        const tiles: { x: number; y: number }[] = [];
        let allPath = true;
        for (let by = 0; by < bh; by++) {
          for (let bx = 0; bx < bw; bx++) {
            if (grid[(py + by) * w + (px + bx)] !== PATH) { allPath = false; break; }
            tiles.push({ x: px + bx, y: py + by });
          }
          if (!allPath) break;
        }
        if (allPath && tiles.length >= 4) {
          for (const t of tiles) {
            grid[t.y * w + t.x] = WALL;
            wallsPlaced++;
          }
        }
      }
    }
  }

  // Baslangic noktasi sec
  const pathTiles: { x: number; y: number }[] = [];
  for (let y = margin; y < h - margin; y++) {
    for (let x = margin; x < w - margin; x++) {
      if (grid[y * w + x] === PATH) pathTiles.push({ x, y });
    }
  }

  if (pathTiles.length < config.minMoves * 2) return null;

  const start = pathTiles[Math.floor(rng() * pathTiles.length)];

  // BFS baglantilik
  const visited = bfsConnected(grid, w, h, start.x, start.y);

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
function generateGridMaze(
  rng: () => number, w: number, h: number, config: DifficultyConfig
): { grid: number[]; startX: number; startY: number } | null {
  const grid = new Array(w * h).fill(WALL);

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

  const removeChance = 0.35 + rng() * 0.15;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (grid[y * w + x] === PATH && rng() < removeChance) {
        grid[y * w + x] = WALL;
      }
    }
  }

  const pathTiles: { x: number; y: number }[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (grid[y * w + x] === PATH) pathTiles.push({ x, y });
    }
  }

  if (pathTiles.length < config.minMoves * 2) return null;

  const start = pathTiles[Math.floor(rng() * pathTiles.length)];

  const visited = bfsConnected(grid, w, h, start.x, start.y);

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

// ===== AKIS MODU: Cikmaz olmayan rahatlatici labirent =====
function generateRelaxingMaze(
  rng: () => number, w: number, h: number, config: DifficultyConfig
): { grid: number[]; startX: number; startY: number } | null {
  const grid = new Array(w * h).fill(WALL);

  const margin = 1;
  // Ic alani tamamen ac
  for (let y = margin; y < h - margin; y++) {
    for (let x = margin; x < w - margin; x++) {
      grid[y * w + x] = PATH;
    }
  }

  // Dolu dikdortgen bloklar yerlestir (minimum 2x2)
  const innerW = w - 2 * margin;
  const innerH = h - 2 * margin;
  const density = 0.25 + rng() * 0.15;
  const targetWalls = Math.floor(innerW * innerH * density);

  let wallsPlaced = 0;
  for (let attempt = 0; attempt < targetWalls * 4 && wallsPlaced < targetWalls; attempt++) {
    // Sadece 2x2, 2x3, 3x2, 3x3 bloklar
    const blockTypes = [[2,2],[2,3],[3,2],[3,3],[2,4],[4,2]];
    const [bw, bh] = blockTypes[Math.floor(rng() * blockTypes.length)];
    const px = margin + Math.floor(rng() * (innerW - bw + 1));
    const py = margin + Math.floor(rng() * (innerH - bh + 1));

    if (px + bw > w - margin || py + bh > h - margin) continue;

    // Tum karolar PATH mi kontrol et
    let allPath = true;
    const tiles: { x: number; y: number }[] = [];
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        if (grid[(py + by) * w + (px + bx)] !== PATH) { allPath = false; break; }
        tiles.push({ x: px + bx, y: py + by });
      }
      if (!allPath) break;
    }
    if (!allPath) continue;

    // Blogu yerlestirdikten sonra baglantilik bozulmasin - gecici yerlestir ve kontrol et
    for (const t of tiles) grid[t.y * w + t.x] = WALL;

    // Hizli baglantilik kontrolu: bir PATH karosu bul ve BFS yap
    let anyPath: { x: number; y: number } | null = null;
    let totalPathCount = 0;
    for (let y = margin; y < h - margin && !anyPath; y++) {
      for (let x = margin; x < w - margin; x++) {
        if (grid[y * w + x] === PATH) {
          if (!anyPath) anyPath = { x, y };
          totalPathCount++;
        }
      }
    }
    // totalPathCount'u tamamla
    if (anyPath) {
      for (let y = (anyPath.y); y < h - margin; y++) {
        const startX2 = y === anyPath.y ? anyPath.x + 1 : margin;
        for (let x = startX2; x < w - margin; x++) {
          if (grid[y * w + x] === PATH) totalPathCount++;
        }
      }
    }

    if (!anyPath || totalPathCount < config.minMoves * 2) {
      // Geri al
      for (const t of tiles) grid[t.y * w + t.x] = PATH;
      continue;
    }

    const visited = bfsConnected(grid, w, h, anyPath.x, anyPath.y);
    if (visited.size < totalPathCount) {
      // Baglantilik bozuldu, geri al
      for (const t of tiles) grid[t.y * w + t.x] = PATH;
      continue;
    }

    wallsPlaced += tiles.length;
  }

  // Her PATH karosu en az 2 yonde hareket edebilmeli (cikmaz yok)
  let fixAttempts = 0;
  while (fixAttempts < 100) {
    let fixed = false;
    for (let y = margin; y < h - margin; y++) {
      for (let x = margin; x < w - margin; x++) {
        if (grid[y * w + x] !== PATH) continue;
        let moveCount = 0;
        for (const { dx, dy } of DIR_VECTORS) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h && grid[ny * w + nx] !== WALL) {
            moveCount++;
          }
        }
        if (moveCount < 2) {
          // Bu karo cikmaz - etrafindaki bir duvari ac
          const wallNeighbors: { x: number; y: number }[] = [];
          for (const { dx, dy } of DIR_VECTORS) {
            const nx = x + dx, ny = y + dy;
            if (nx >= margin && nx < w - margin && ny >= margin && ny < h - margin && grid[ny * w + nx] === WALL) {
              wallNeighbors.push({ x: nx, y: ny });
            }
          }
          if (wallNeighbors.length > 0) {
            const toOpen = wallNeighbors[Math.floor(rng() * wallNeighbors.length)];
            grid[toOpen.y * w + toOpen.x] = PATH;
            fixed = true;
          }
        }
      }
    }
    if (!fixed) break;
    fixAttempts++;
  }

  // Baslangic noktasi sec
  const pathTiles: { x: number; y: number }[] = [];
  for (let y = margin; y < h - margin; y++) {
    for (let x = margin; x < w - margin; x++) {
      if (grid[y * w + x] === PATH) pathTiles.push({ x, y });
    }
  }

  if (pathTiles.length < config.minMoves * 2) return null;

  const start = pathTiles[Math.floor(rng() * pathTiles.length)];

  // Son baglantilik kontrolu
  const finalVisited = bfsConnected(grid, w, h, start.x, start.y);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y * w + x] === PATH && !finalVisited.has(y * w + x)) {
        grid[y * w + x] = WALL;
      }
    }
  }

  return { grid, startX: start.x, startY: start.y };
}

// Ana labirent uretim fonksiyonu
export function generateMaze(
  levelId: number,
  config: DifficultyConfig,
  mode: GameMode = 'thinking'
): LevelData | null {
  const seed = mode === 'thinking'
    ? levelId * 7919 + 1337
    : levelId * 6271 + 9001;
  const rng = mulberry32(seed);
  const { gridSize, minMoves, maxMoves } = config;
  const w = gridSize, h = gridSize;
  const maxSolverDepth = maxMoves + 6;
  const minJunctionMult = mode === 'thinking' ? 0.25 : 0.15;

  for (let attempt = 0; attempt < 150; attempt++) {
    let result: { grid: number[]; startX: number; startY: number } | null = null;

    if (mode === 'relaxing') {
      // Akis modu: cikmaz olmayan labirent
      const strategyRoll = rng();
      if (strategyRoll < 0.5) {
        result = generateRelaxingMaze(rng, w, h, config);
      } else {
        // Room maze de relaxing icin uygun (acik alan)
        result = generateRoomMaze(rng, w, h, config);
        // Cikmaz kontrolu yap, varsa duvarlari ac
        if (result) {
          let hasDead = true;
          let fixIter = 0;
          while (hasDead && fixIter < 50) {
            hasDead = false;
            for (let y = 1; y < h - 1; y++) {
              for (let x = 1; x < w - 1; x++) {
                if (result.grid[y * w + x] !== PATH) continue;
                let moveCount = 0;
                for (const { dx: ddx, dy: ddy } of DIR_VECTORS) {
                  const nx = x + ddx, ny = y + ddy;
                  if (nx >= 0 && nx < w && ny >= 0 && ny < h && result.grid[ny * w + nx] !== WALL) moveCount++;
                }
                if (moveCount < 2) {
                  // Cikmaz - bir duvar ac
                  for (const { dx: ddx, dy: ddy } of shuffle(DIR_VECTORS, rng)) {
                    const nx = x + ddx, ny = y + ddy;
                    if (nx >= 1 && nx < w - 1 && ny >= 1 && ny < h - 1 && result.grid[ny * w + nx] === WALL) {
                      result.grid[ny * w + nx] = PATH;
                      hasDead = true;
                      break;
                    }
                  }
                }
              }
            }
            fixIter++;
          }
        }
      }
    } else {
      // Taktik modu: mevcut algoritma
      const strategyRoll = rng();
      if (strategyRoll < 0.35) {
        result = generateBranchingMaze(rng, w, h, config);
      } else if (strategyRoll < 0.70) {
        result = generateRoomMaze(rng, w, h, config);
      } else {
        result = generateGridMaze(rng, w, h, config);
      }
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
    const minJunctions = Math.max(1, Math.floor(minMoves * minJunctionMult));
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
      mode,
    };
  }

  return null;
}
