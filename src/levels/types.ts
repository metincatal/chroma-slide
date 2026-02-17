export interface LevelData {
  id: number;
  name: string;
  width: number;
  height: number;
  // 0 = duvar, 1 = yol (düz dizi, satır satır)
  grid: number[];
  // Başlangıç pozisyonu
  startX: number;
  startY: number;
  // Hedef hamle sayısı (3 yıldız için)
  targetMoves: number;
  // Seviye renk indeksi (LEVEL_COLORS'dan)
  colorIndex: number;
}
