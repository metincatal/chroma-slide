import { WALL } from '../utils/constants';

const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

// ===== ALAN ÇEVRELEME =====
// Bir oyuncu kendi karolarıyla bir bölgeyi kapatırsa bölgenin içi onun olur.
//
// Bölge: oyuncunun sahip OLMADIĞI, duvar olmayan, birbirine bitişik karolar kümesi.
//
// Ele geçirme koşulları:
//   1. Bölgenin sınırında oyuncunun en az bir karosu olmalı
//   2. Bölgede hiçbir oyuncunun topu bulunmamalı
//      (topun durduğu alan kapatılamaz; yoksa oyuncular kendi altlarını kaybederdi)
//   3. Bölge, izin verilen en büyük boyutu aşmamalı
//   4. Oyuncunun karoları kaldırılsaydı bölge en az iki katına açılmalıydı
//
// Dördüncü koşul mekanizmanın kalbi. Arena dört yanı duvarla kapalı olduğu için
// "duvarla çevrili olmak" tek başına çevreleme sayılamaz: yoksa tahtanın ortasına
// tek karo koyan oyuncu, kalan her şeyi çevrelemiş sayılırdı. Bu koşul, oyuncunun
// gerçekten bir geçidi tıkayıp tıkamadığını ölçer.
export function findCapturedCells(
  ownerSeat: Uint8Array,
  grid: number[],
  w: number,
  h: number,
  seat: number,
  ballCells: ReadonlySet<number>,
  maxRegionSize: number
): number[] {
  const mine = seat + 1;
  const size = w * h;
  const visited = new Uint8Array(size);
  const captured: number[] = [];
  const queue: number[] = [];

  for (let start = 0; start < size; start++) {
    if (visited[start]) continue;
    if (grid[start] === WALL) continue;
    if (ownerSeat[start] === mine) continue;

    // --- Bölgeyi tara: oyuncunun karoları sınır ---
    const region: number[] = [];
    let touchesMine = false;
    let hasBall = false;

    visited[start] = 1;
    queue.length = 0;
    queue.push(start);

    while (queue.length > 0) {
      const idx = queue.pop()!;
      region.push(idx);
      if (ballCells.has(idx)) hasBall = true;

      const x = idx % w;
      const y = (idx - x) / w;

      for (const [dx, dy] of NEIGHBORS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const ni = ny * w + nx;

        if (grid[ni] === WALL) continue;
        if (ownerSeat[ni] === mine) { touchesMine = true; continue; }
        if (visited[ni]) continue;

        visited[ni] = 1;
        queue.push(ni);
      }
    }

    if (!touchesMine) continue;
    if (hasBall) continue;
    if (region.length > maxRegionSize) continue;
    if (!isTrulyEnclosed(region, ownerSeat, grid, w, h, mine)) continue;

    for (const idx of region) captured.push(idx);
  }

  return captured;
}

// Oyuncunun karoları geçirgen sayılsaydı bölge ne kadar büyürdü?
// En az iki katına çıkıyorsa oyuncu gerçek bir geçit kapatmıştır.
function isTrulyEnclosed(
  region: number[],
  ownerSeat: Uint8Array,
  grid: number[],
  w: number,
  h: number,
  mine: number
): boolean {
  const seen = new Set<number>(region);
  const queue = [...region];
  let reached = region.length;
  const target = region.length * 2;

  while (queue.length > 0) {
    const idx = queue.pop()!;
    const x = idx % w;
    const y = (idx - x) / w;

    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const ni = ny * w + nx;
      if (grid[ni] === WALL) continue;
      if (seen.has(ni)) continue;

      seen.add(ni);
      reached++;
      if (reached >= target) return true;
      // Oyuncunun karosu da dahil her yola yayıl
      queue.push(ni);
    }
    void mine;
  }

  return reached >= target;
}
