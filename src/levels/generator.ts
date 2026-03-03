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

function getOpposite(dir: Direction): Direction {
  switch (dir) {
    case 'UP': return 'DOWN';
    case 'DOWN': return 'UP';
    case 'LEFT': return 'RIGHT';
    case 'RIGHT': return 'LEFT';
  }
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

// DFS solver: tum PATH karolarini boyayan cozum bul (Taktik modu)
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

// ===== AKIS MODU SOLVER: Greedy + yeniden konumlanma =====
function relaxingGreedySolve(
  grid: number[], w: number, h: number,
  startX: number, startY: number,
  maxSteps: number,
  rng: () => number
): Direction[] | null {
  const totalPath = grid.filter(c => c === PATH).length;

  for (let trial = 0; trial < 30; trial++) {
    const painted = new Uint8Array(w * h);
    painted[startY * w + startX] = 1;
    let paintedCount = 1;
    let x = startX, y = startY;
    const sol: Direction[] = [];
    let repoCount = 0;

    for (let move = 0; move < maxSteps; move++) {
      if (paintedCount >= totalPath) return sol;

      type Candidate = {
        dir: Direction; newCount: number;
        endX: number; endY: number;
        tiles: { x: number; y: number }[];
      };
      const goodMoves: Candidate[] = [];
      const repoMoves: Candidate[] = [];

      for (const { dx, dy, dir } of DIR_VECTORS) {
        const slide = simulateSlide(grid, w, h, x, y, dx, dy);
        if (slide.dist === 0) continue;
        let newCount = 0;
        for (const t of slide.tiles) {
          if (!painted[t.y * w + t.x]) newCount++;
        }
        const entry = { dir, newCount, endX: slide.x, endY: slide.y, tiles: slide.tiles };
        if (newCount > 0) goodMoves.push(entry);
        else repoMoves.push(entry);
      }

      if (goodMoves.length > 0) {
        goodMoves.sort((a, b) => b.newCount - a.newCount);
        const topK = trial === 0 ? 1 : Math.min(3, goodMoves.length);
        const chosen = goodMoves[Math.floor(rng() * topK)];
        for (const t of chosen.tiles) {
          if (!painted[t.y * w + t.x]) { painted[t.y * w + t.x] = 1; paintedCount++; }
        }
        x = chosen.endX; y = chosen.endY;
        sol.push(chosen.dir);
      } else if (repoMoves.length > 0 && repoCount < 15) {
        repoCount++;
        const chosen = repoMoves[Math.floor(rng() * repoMoves.length)];
        x = chosen.endX; y = chosen.endY;
        sol.push(chosen.dir);
      } else {
        break;
      }
    }

    if (paintedCount >= totalPath) return sol;
  }

  return null;
}

// Kavsak noktasi sayisi
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

// Cikmaz duzeltme
function fixDeadEnds(grid: number[], w: number, h: number, rng: () => number) {
  let fixAttempts = 0;
  while (fixAttempts < 100) {
    let fixed = false;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (grid[y * w + x] !== PATH) continue;
        let moveCount = 0;
        for (const { dx, dy } of DIR_VECTORS) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h && grid[ny * w + nx] !== WALL) {
            moveCount++;
          }
        }
        if (moveCount < 2) {
          const wallNeighbors: { x: number; y: number }[] = [];
          for (const { dx, dy } of DIR_VECTORS) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 1 && nx < w - 1 && ny >= 1 && ny < h - 1 && grid[ny * w + nx] === WALL) {
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
}

// Omurga cozumunun hala gecerli olup olmadigini dogrula
function verifyBackbone(
  grid: number[], w: number, h: number,
  sx: number, sy: number,
  solution: Direction[],
  expectedStops: { x: number; y: number }[]
): boolean {
  let vx = sx, vy = sy;
  for (let i = 0; i < solution.length; i++) {
    const d = DIR_VECTORS.find(v => v.dir === solution[i])!;
    const slide = simulateSlide(grid, w, h, vx, vy, d.dx, d.dy);
    if (slide.x !== expectedStops[i + 1].x || slide.y !== expectedStops[i + 1].y) {
      return false;
    }
    vx = slide.x; vy = slide.y;
  }
  return true;
}

// ===== AKIS MODU: Yapici (Constructive) Labirent Uretimi =====
// Cozumden labirent insa eder, dallanma + oda + engel ile zorlugu olcekler
function generateConstructiveMaze(
  rng: () => number, w: number, h: number, config: DifficultyConfig
): { grid: number[]; startX: number; startY: number; solution: Direction[] } | null {
  const grid = new Array(w * h).fill(WALL);
  // Zorluk faktoru: 0 (Kolay) ~ 1 (Efsane)
  const diffFactor = Math.min(1, (config.minMoves - 4) / 10);
  const innerArea = (w - 2) * (h - 2);

  // Baslangic noktasi
  const sx = 2 + Math.floor(rng() * (w - 4));
  const sy = 2 + Math.floor(rng() * (h - 4));
  grid[sy * w + sx] = PATH;

  let bx = sx, by = sy;
  const solution: Direction[] = [];
  const targetMoves = config.minMoves + Math.floor(rng() * (config.maxMoves - config.minMoves + 1));
  const stoppingWalls = new Set<number>();

  let lastDir: Direction | null = null;
  let totalFails = 0;

  // === FAZ 1: Omurga koridorlari ===
  // Zor levellerde omurgaya bonus hamle ekle (daha genis kapsama)
  const bonusMoves = Math.floor(diffFactor * 6);
  for (let move = 0; move < targetMoves + bonusMoves; move++) {
    if (totalFails > 30) break;

    let dirs = shuffle(DIR_VECTORS, rng);
    if (lastDir) {
      const opp = getOpposite(lastDir);
      const nonOpp = dirs.filter(d => d.dir !== opp);
      if (nonOpp.length > 0) dirs = nonOpp;
    }

    let moved = false;

    for (const { dx, dy, dir } of dirs) {
      const minLen = 2;
      const maxLen = Math.max(3, Math.floor((w - 2) / 2));
      const carveLen = minLen + Math.floor(rng() * (maxLen - minLen + 1));

      const newTiles: { x: number; y: number }[] = [];
      let cx = bx, cy = by;
      let steps = 0;

      for (let i = 0; i < carveLen; i++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 1 || nx >= w - 1 || ny < 1 || ny >= h - 1) break;
        if (stoppingWalls.has(ny * w + nx)) break;
        if (grid[ny * w + nx] === WALL) {
          newTiles.push({ x: nx, y: ny });
        }
        cx = nx; cy = ny;
        steps++;
      }

      if (steps === 0 || newTiles.length === 0) continue;

      const beyondX = cx + dx, beyondY = cy + dy;
      if (beyondX >= 0 && beyondX < w && beyondY >= 0 && beyondY < h) {
        if (grid[beyondY * w + beyondX] !== WALL) continue;
      }

      for (const t of newTiles) grid[t.y * w + t.x] = PATH;

      const slide = simulateSlide(grid, w, h, bx, by, dx, dy);
      if (slide.x !== cx || slide.y !== cy) {
        for (const t of newTiles) grid[t.y * w + t.x] = WALL;
        continue;
      }

      if (beyondX >= 0 && beyondX < w && beyondY >= 0 && beyondY < h) {
        stoppingWalls.add(beyondY * w + beyondX);
      }

      bx = cx; by = cy;
      solution.push(dir);
      lastDir = dir;
      moved = true;
      totalFails = 0;
      break;
    }

    if (!moved) totalFails++;
  }

  if (solution.length < config.minMoves) return null;

  // Beklenen duraklama noktalarini topla
  const expectedStops: { x: number; y: number }[] = [{ x: sx, y: sy }];
  {
    let vx = sx, vy = sy;
    for (const dir of solution) {
      const d = DIR_VECTORS.find(v => v.dir === dir)!;
      const slide = simulateSlide(grid, w, h, vx, vy, d.dx, d.dy);
      if (slide.dist === 0) return null;
      vx = slide.x; vy = slide.y;
      expectedStops.push({ x: vx, y: vy });
    }
  }

  // === FAZ 2: Dal koridorlari (zorlukla orantili) ===
  // Omurgadan dallanan ekstra koridorlar: oyuncunun kesfetmesi gereken alanlar
  // Zor levellerde daha fazla dal = daha karmasik ag
  const branchTarget = Math.max(2, Math.floor(config.minMoves * (0.5 + diffFactor * 0.8)));

  let branchesAdded = 0;
  for (let attempt = 0; attempt < branchTarget * 8 && branchesAdded < branchTarget; attempt++) {
    const pathTiles: { x: number; y: number }[] = [];
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++)
        if (grid[y * w + x] === PATH) pathTiles.push({ x, y });

    const startTile = pathTiles[Math.floor(rng() * pathTiles.length)];
    const dirs = shuffle(DIR_VECTORS, rng);

    for (const { dx, dy } of dirs) {
      const branchMinLen = 1;
      const branchMaxLen = Math.max(3, Math.floor((w - 2) / 3) + Math.floor(diffFactor * 4));
      const branchLen = branchMinLen + Math.floor(rng() * (branchMaxLen - branchMinLen + 1));
      const newTiles: { x: number; y: number }[] = [];
      let cx = startTile.x, cy = startTile.y;

      for (let i = 0; i < branchLen; i++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 1 || nx >= w - 1 || ny < 1 || ny >= h - 1) break;
        if (stoppingWalls.has(ny * w + nx)) break;
        if (grid[ny * w + nx] === WALL) {
          newTiles.push({ x: nx, y: ny });
        } else {
          // Mevcut PATH'e carpti - baglanti noktalari iyi
          break;
        }
        cx = nx; cy = ny;
      }

      if (newTiles.length < 1) continue;

      for (const t of newTiles) grid[t.y * w + t.x] = PATH;

      if (!verifyBackbone(grid, w, h, sx, sy, solution, expectedStops)) {
        for (const t of newTiles) grid[t.y * w + t.x] = WALL;
        continue;
      }

      branchesAdded++;
      break;
    }
  }

  // Dallardan dallanma: ikinci nesil dallar (daha yogun ag)
  if (diffFactor > 0.3) {
    const secondBranchTarget = Math.floor(branchesAdded * 0.5);
    for (let attempt = 0; attempt < secondBranchTarget * 6; attempt++) {
      if (attempt >= secondBranchTarget * 6) break;
      const pathTiles2: { x: number; y: number }[] = [];
      for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++)
          if (grid[y * w + x] === PATH) pathTiles2.push({ x, y });
      const tile = pathTiles2[Math.floor(rng() * pathTiles2.length)];
      const dirs2 = shuffle(DIR_VECTORS, rng);
      for (const { dx, dy } of dirs2) {
        const len = 1 + Math.floor(rng() * Math.max(2, Math.floor(w / 4)));
        const nt: { x: number; y: number }[] = [];
        let cx2 = tile.x, cy2 = tile.y;
        for (let i = 0; i < len; i++) {
          const nx = cx2 + dx, ny = cy2 + dy;
          if (nx < 1 || nx >= w - 1 || ny < 1 || ny >= h - 1) break;
          if (stoppingWalls.has(ny * w + nx)) break;
          if (grid[ny * w + nx] === WALL) nt.push({ x: nx, y: ny });
          else break;
          cx2 = nx; cy2 = ny;
        }
        if (nt.length < 1) continue;
        for (const t of nt) grid[t.y * w + t.x] = PATH;
        if (!verifyBackbone(grid, w, h, sx, sy, solution, expectedStops)) {
          for (const t of nt) grid[t.y * w + t.x] = WALL;
          continue;
        }
        break;
      }
    }
  }

  // === FAZ 3: Oda genisletme (zorlukla orantili) ===
  // Duraklama + dal noktalarinda odalar ac
  const allPathForRooms: { x: number; y: number }[] = [];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++)
      if (grid[y * w + x] === PATH) allPathForRooms.push({ x, y });

  // Oda merkezleri: omurga durakları + rastgele PATH karolari
  const roomSampleRate = 0.2 + diffFactor * 0.3; // Zor levellerde daha fazla aday
  const roomCenters = shuffle([...expectedStops, ...allPathForRooms.filter(() => rng() < roomSampleRate)], rng);
  // Zorluga gore oda sayisi ve boyutu (agresif artis)
  const maxRooms = Math.floor(4 + diffFactor * w);
  const baseRoomRadius = diffFactor < 0.3 ? 1 : diffFactor < 0.5 ? 2 : 3;

  for (let ri = 0; ri < Math.min(roomCenters.length, maxRooms); ri++) {
    const center = roomCenters[ri];
    const roomRadius = Math.max(1, baseRoomRadius - Math.floor(rng() * 2));

    const roomTiles: { x: number; y: number }[] = [];
    for (let ry = -roomRadius; ry <= roomRadius; ry++) {
      for (let rx = -roomRadius; rx <= roomRadius; rx++) {
        if (rx === 0 && ry === 0) continue;
        const tx = center.x + rx, ty = center.y + ry;
        if (tx < 1 || tx >= w - 1 || ty < 1 || ty >= h - 1) continue;
        if (grid[ty * w + tx] !== WALL) continue;
        if (stoppingWalls.has(ty * w + tx)) continue;
        roomTiles.push({ x: tx, y: ty });
      }
    }

    if (roomTiles.length === 0) continue;

    for (const t of roomTiles) grid[t.y * w + t.x] = PATH;

    if (!verifyBackbone(grid, w, h, sx, sy, solution, expectedStops)) {
      for (const t of roomTiles) grid[t.y * w + t.x] = WALL;
    }
  }

  // === FAZ 4: Ic engeller (zorlukla orantili) ===
  // Odalar icine kucuk duvar bloklari koyarak kavsak/karar noktasi olustur
  // Engeller topun durma noktalarini artirarak puzzle'i daha stratejik yapar
  const obstacleTarget = Math.floor(diffFactor * 12);

  if (obstacleTarget > 0) {
    const candidates: { x: number; y: number }[] = [];
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        if (grid[y * w + x] !== PATH) continue;
        // Omurga baslangic noktasina cok yakin olmasin
        if (Math.abs(x - sx) + Math.abs(y - sy) < 2) continue;
        // PATH komsu sayisi: en az 3 olmali (oda ici, koridor degil)
        let pathNeighbors = 0;
        for (const { dx, dy } of DIR_VECTORS) {
          if (grid[(y + dy) * w + (x + dx)] === PATH) pathNeighbors++;
        }
        if (pathNeighbors >= 3) candidates.push({ x, y });
      }
    }

    const shuffledCandidates = shuffle(candidates, rng);
    let obstaclesPlaced = 0;

    for (const pos of shuffledCandidates) {
      if (obstaclesPlaced >= obstacleTarget) break;

      // Engel boyutu: 1x1 veya 1x2/2x1
      const obstacleType = rng();
      const tilesToWall: { x: number; y: number }[] = [pos];

      if (obstacleType > 0.4) {
        // 1x2 veya 2x1 blok
        const extDir = rng() > 0.5 ? { dx: 1, dy: 0 } : { dx: 0, dy: 1 };
        const ex = pos.x + extDir.dx, ey = pos.y + extDir.dy;
        if (ex >= 2 && ex < w - 2 && ey >= 2 && ey < h - 2 && grid[ey * w + ex] === PATH) {
          tilesToWall.push({ x: ex, y: ey });
        }
      }

      // Korunan duvarlara dokunma
      if (tilesToWall.some(t => stoppingWalls.has(t.y * w + t.x))) continue;

      // Engeli yerlestir
      for (const t of tilesToWall) grid[t.y * w + t.x] = WALL;

      // Omurgayi dogrula
      if (!verifyBackbone(grid, w, h, sx, sy, solution, expectedStops)) {
        for (const t of tilesToWall) grid[t.y * w + t.x] = PATH;
        continue;
      }

      // Baglantilik kontrolu: tum PATH hala bagli mi?
      const anyPath = (() => {
        for (let y = 1; y < h - 1; y++)
          for (let x = 1; x < w - 1; x++)
            if (grid[y * w + x] === PATH) return { x, y };
        return null;
      })();

      if (anyPath) {
        let totalPathCount = 0;
        for (let y = 1; y < h - 1; y++)
          for (let x = 1; x < w - 1; x++)
            if (grid[y * w + x] === PATH) totalPathCount++;

        const connected = bfsConnected(grid, w, h, anyPath.x, anyPath.y);
        if (connected.size < totalPathCount) {
          // Baglantilik bozuldu - geri al
          for (const t of tilesToWall) grid[t.y * w + t.x] = PATH;
          continue;
        }
      }

      obstaclesPlaced++;
    }
  }

  // === FAZ 5: Cozum dogrulama ve kalite kontrolu ===
  // Greedy solver ile tum PATH karolarini boyayabilen cozum bul
  const pathCount = grid.filter(c => c === PATH).length;
  const minPathCount = Math.max(
    config.minMoves * 3,
    Math.floor(innerArea * (0.20 + diffFactor * 0.20))
  );
  if (pathCount < minPathCount) return null;

  // Greedy solver: fazla adim izni (dallar + odalar icin)
  const maxFinalSteps = Math.max(pathCount, (config.maxMoves + 1) * 3);
  const finalSolution = relaxingGreedySolve(grid, w, h, sx, sy, maxFinalSteps, rng);

  if (!finalSolution) {
    // Cozum bulunamadi - odalarin ekledigi boyanamaz karolari temizle
    // Omurga cozumunun boyadigi karolari bul
    let vx2 = sx, vy2 = sy;
    const painted = new Set<number>();
    painted.add(vy2 * w + vx2);
    for (const dir of solution) {
      const d = DIR_VECTORS.find(v => v.dir === dir)!;
      const slide = simulateSlide(grid, w, h, vx2, vy2, d.dx, d.dy);
      for (const t of slide.tiles) painted.add(t.y * w + t.x);
      vx2 = slide.x; vy2 = slide.y;
    }
    // Boyanamayanlari temizle
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (grid[y * w + x] === PATH && !painted.has(y * w + x))
          grid[y * w + x] = WALL;

    // Tekrar dene
    const retrySteps = Math.max(pathCount, (config.maxMoves + 1) * 3);
    const retrySolution = relaxingGreedySolve(grid, w, h, sx, sy, retrySteps, rng);
    if (!retrySolution) return null;
    return { grid, startX: sx, startY: sy, solution: retrySolution };
  }

  // Kavsak kontrolu: zorlukla orantili minimum kavsak
  const junctions = countJunctions(grid, w, h);
  const minJunctions = Math.max(2, Math.floor(config.minMoves * (0.3 + diffFactor * 0.3)));
  if (junctions < minJunctions) return null;

  return { grid, startX: sx, startY: sy, solution: finalSolution };
}

// ===== STRATEJI: Dallanmali Koridor Agi (Taktik modu) =====
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
      const opp = getOpposite(lastDir);
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
    const bx2 = bp.x, by2 = bp.y;

    const branchDirs = shuffle(DIR_VECTORS, rng);
    for (const { dx, dy } of branchDirs) {
      const branchLen = 2 + Math.floor(rng() * 3);
      let valid = true;
      const newTiles: { x: number; y: number }[] = [];

      for (let i = 0; i < branchLen; i++) {
        const nx = bx2 + dx * (i + 1);
        const ny = by2 + dy * (i + 1);
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

// ===== STRATEJI: Oda + Sutun Tabanli (Taktik modu) =====
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
  const pillarDensity = 0.30 + (config.minMoves - 4) * 0.01 + rng() * 0.15;
  const targetWalls = Math.floor(innerW * innerH * pillarDensity);

  let wallsPlaced = 0;
  for (let attempt = 0; attempt < targetWalls * 3 && wallsPlaced < targetWalls; attempt++) {
    const shapeType = rng();
    const px = margin + Math.floor(rng() * innerW);
    const py = margin + Math.floor(rng() * innerH);

    if (shapeType < 0.30) {
      if (grid[py * w + px] === PATH) {
        grid[py * w + px] = WALL;
        wallsPlaced++;
      }
    } else if (shapeType < 0.50) {
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
        for (const t of tiles) { grid[t.y * w + t.x] = WALL; wallsPlaced++; }
      }
    } else if (shapeType < 0.75) {
      if (px + 1 < w - margin && py + 1 < h - margin) {
        const tiles = [
          { x: px, y: py }, { x: px + 1, y: py }, { x: px, y: py + 1 },
        ];
        if (tiles.every(t => grid[t.y * w + t.x] === PATH)) {
          for (const t of tiles) { grid[t.y * w + t.x] = WALL; wallsPlaced++; }
        }
      }
    } else {
      const blockTypes: number[][] = [[2,2],[2,3],[3,2]];
      if (config.minMoves >= 8) blockTypes.push([3,3],[2,4],[4,2]);
      const [bw, bh] = blockTypes[Math.floor(rng() * blockTypes.length)];
      if (px + bw <= w - margin && py + bh <= h - margin) {
        const tiles: { x: number; y: number }[] = [];
        let allPath = true;
        for (let by2 = 0; by2 < bh; by2++) {
          for (let bx2 = 0; bx2 < bw; bx2++) {
            if (grid[(py + by2) * w + (px + bx2)] !== PATH) { allPath = false; break; }
            tiles.push({ x: px + bx2, y: py + by2 });
          }
          if (!allPath) break;
        }
        if (allPath && tiles.length >= 4) {
          for (const t of tiles) { grid[t.y * w + t.x] = WALL; wallsPlaced++; }
        }
      }
    }
  }

  const pathTiles: { x: number; y: number }[] = [];
  for (let y = margin; y < h - margin; y++) {
    for (let x = margin; x < w - margin; x++) {
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

// ===== STRATEJI: Kafes Tabanli (Taktik modu) =====
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

  if (mode === 'relaxing') {
    // ===== AKIS MODU: Yapici (Constructive) yaklasim =====
    // Cozumden labirent insa et, garanti cozulebilir
    const maxAttempts = 200;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const result = generateConstructiveMaze(rng, w, h, config);
      if (!result) continue;

      const { grid, startX, startY, solution: sol } = result;

      // Kalite kontrolleri: zorlukla orantili esikler
      const diffFactor = Math.min(1, (minMoves - 4) / 10);
      const innerArea = (w - 2) * (h - 2);
      const pathCount = grid.filter(c => c === PATH).length;
      const minPath = Math.max(
        minMoves * 3,
        Math.floor(innerArea * (0.15 + diffFactor * 0.15))
      );
      if (pathCount < minPath) continue;

      const junctions = countJunctions(grid, w, h);
      const minJunc = Math.max(2, Math.floor(minMoves * (0.2 + diffFactor * 0.3)));
      if (junctions < minJunc) continue;

      // Affedicilik kontrolu: farkli pozisyonlardan da cozulebilir olmali
      const pathTileList: { x: number; y: number }[] = [];
      for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++)
          if (grid[y * w + x] === PATH) pathTileList.push({ x, y });

      const maxSolveSteps = sol.length + 40;
      let forgivenessPass = 0;
      const forgivenessChecks = 4;
      for (let fc = 0; fc < forgivenessChecks; fc++) {
        const alt = pathTileList[Math.floor(rng() * pathTileList.length)];
        if (relaxingGreedySolve(grid, w, h, alt.x, alt.y, maxSolveSteps, rng)) {
          forgivenessPass++;
        }
      }
      // En az 3/4 pozisyondan cozulebilmeli
      if (forgivenessPass < 3) continue;

      return {
        id: levelId,
        name: `Seviye ${levelId}`,
        width: w, height: h,
        grid, startX, startY,
        targetMoves: sol.length,
        colorIndex: (levelId - 1) % 10,
        solution: sol,
        difficulty: config.name,
        mode,
      };
    }

    return null;
  }

  // ===== TAKTIK MODU: Mevcut algoritmalar =====
  const maxSolverDepth = maxMoves + 6;
  const maxAttempts = 150;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let result: { grid: number[]; startX: number; startY: number } | null = null;

    const strategyRoll = rng();
    if (strategyRoll < 0.35) {
      result = generateBranchingMaze(rng, w, h, config);
    } else if (strategyRoll < 0.70) {
      result = generateRoomMaze(rng, w, h, config);
    } else {
      result = generateGridMaze(rng, w, h, config);
    }

    if (!result) continue;

    const { grid, startX, startY } = result;

    const solution = solvePuzzle(grid, w, h, startX, startY, maxSolverDepth);
    if (!solution) continue;

    if (solution.length < minMoves || solution.length > maxMoves + 4) continue;

    const junctions = countJunctions(grid, w, h);
    const minJunctions = Math.max(1, Math.floor(minMoves * 0.25));
    if (junctions < minJunctions) continue;

    const pathCount = grid.filter(c => c === PATH).length;
    if (pathCount < solution.length * 1.5) continue;

    return {
      id: levelId,
      name: `Seviye ${levelId}`,
      width: w, height: h,
      grid, startX, startY,
      targetMoves: solution.length,
      colorIndex: (levelId - 1) % 10,
      solution, difficulty: config.name, mode,
    };
  }

  return null;
}
