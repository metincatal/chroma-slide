import { WALL, STOPPER, arrowDelta, canEnter, poolColor, BALL_START_COLOR } from '../utils/constants';

export interface SlideOutcome {
  // Başlangıç karosu hariç, geçilen karolar sırayla
  path: { x: number; y: number }[];
  finalX: number;
  finalY: number;
  // Topun son hareket yönü (çarpma efekti ve renderer için)
  dirX: number;
  dirY: number;
  // Kayma bittiğinde topun rengi (havuz karoları değiştirir)
  finalColor: number;
}

// Tek doğruluk kaynağı: hem oyun (Ball) hem üretici (generator) bunu kullanır.
// İkisi ayrışırsa üretici çözülemeyen seviye üretir.
//
// Kurallar:
//   - Duvara veya tahtanın dışına çıkınca durur
//   - Renk kapısına rengi tutmuyorsa giremez; kapı duvar gibi davranır
//   - Havuz karosuna girince topun rengi değişir, kayma devam eder
//   - Yön karosuna (ok) girince yön okun yönüne döner ve kaymaya devam eder
//   - Durdurucu karoya girince orada durur
//   - Ok döngüsüne girilirse (aynı karo + aynı yön + aynı renk) kayma kesilir
export function computeSlide(
  grid: number[], w: number, h: number,
  startX: number, startY: number,
  dx: number, dy: number,
  ballColor: number = BALL_START_COLOR
): SlideOutcome | null {
  const path: { x: number; y: number }[] = [];
  let cx = startX, cy = startY;
  let vx = dx, vy = dy;
  let color = ballColor;

  // Döngü koruması: (karo, yön, renk) üçlüsü iki kez görülürse dur
  const seen = new Set<number>();
  const maxSteps = w * h * 4;

  for (let step = 0; step < maxSteps; step++) {
    const nx = cx + vx, ny = cy + vy;
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) break;

    const tile = grid[ny * w + nx];
    if (tile === WALL) break;
    if (!canEnter(tile, color)) break;

    cx = nx; cy = ny;
    path.push({ x: cx, y: cy });

    const pool = poolColor(tile);
    if (pool) color = pool;

    if (tile === STOPPER) break;

    const turn = arrowDelta(tile);
    if (turn) {
      vx = turn.dx; vy = turn.dy;
      const key = ((cy * w + cx) * 4 + dirIndex(vx, vy)) * 4 + color;
      if (seen.has(key)) break;
      seen.add(key);
    }
  }

  if (path.length === 0) return null;
  return { path, finalX: cx, finalY: cy, dirX: vx, dirY: vy, finalColor: color };
}

function dirIndex(dx: number, dy: number): number {
  if (dy < 0) return 0;
  if (dy > 0) return 1;
  if (dx < 0) return 2;
  return 3;
}
