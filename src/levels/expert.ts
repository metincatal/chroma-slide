import { LevelData } from './types';

const W = 0, P = 1;

export const expertLevels: LevelData[] = [
  {
    // Seviye 25: "Dev Yılan" (10x11, 9 hamle)
    // 5 yatay koridor zigzag
    // Çözüm: SAĞA → AŞAĞI → SOLA → AŞAĞI → SAĞA → AŞAĞI → SOLA → AŞAĞI → SAĞA
    id: 25,
    name: 'Dev Yılan',
    width: 10,
    height: 11,
    grid: [
      W,W,W,W,W,W,W,W,W,W,
      W,P,P,P,P,P,P,P,P,W,
      W,W,W,W,W,W,W,W,P,W,
      W,P,P,P,P,P,P,P,P,W,
      W,P,W,W,W,W,W,W,W,W,
      W,P,P,P,P,P,P,P,P,W,
      W,W,W,W,W,W,W,W,P,W,
      W,P,P,P,P,P,P,P,P,W,
      W,P,W,W,W,W,W,W,W,W,
      W,P,P,P,P,P,P,P,P,W,
      W,W,W,W,W,W,W,W,W,W,
    ],
    startX: 1, startY: 1,
    targetMoves: 9,
    colorIndex: 0,
  },
  {
    // Seviye 26: "Çift Kolon" (10x7, 9 hamle)
    // Sol zigzag + sağ zigzag, alt bağlantı
    // Çözüm: SAĞA → AŞAĞI → SOLA → AŞAĞI → SAĞA → YUKARI → SOLA → YUKARI → SAĞA
    id: 26,
    name: 'Çift Kolon',
    width: 10,
    height: 7,
    grid: [
      W,W,W,W,W,W,W,W,W,W,
      W,P,P,P,P,W,P,P,P,W,
      W,W,W,W,P,W,P,W,W,W,
      W,P,P,P,P,W,P,P,P,W,
      W,P,W,W,W,W,W,W,P,W,
      W,P,P,P,P,P,P,P,P,W,
      W,W,W,W,W,W,W,W,W,W,
    ],
    startX: 1, startY: 1,
    targetMoves: 9,
    colorIndex: 1,
  },
  {
    // Seviye 27: "Dev Çerçeve" (10x10, 4 hamle)
    // Çözüm: SAĞA → AŞAĞI → SOLA → YUKARI
    id: 27,
    name: 'Dev Çerçeve',
    width: 10,
    height: 10,
    grid: [
      W,W,W,W,W,W,W,W,W,W,
      W,P,P,P,P,P,P,P,P,W,
      W,P,W,W,W,W,W,W,P,W,
      W,P,W,W,W,W,W,W,P,W,
      W,P,W,W,W,W,W,W,P,W,
      W,P,W,W,W,W,W,W,P,W,
      W,P,W,W,W,W,W,W,P,W,
      W,P,W,W,W,W,W,W,P,W,
      W,P,P,P,P,P,P,P,P,W,
      W,W,W,W,W,W,W,W,W,W,
    ],
    startX: 1, startY: 1,
    targetMoves: 4,
    colorIndex: 2,
  },
  {
    // Seviye 28: "S Yolu" (10x9, 7 hamle)
    // Çözüm: SAĞA → AŞAĞI → SAĞA → AŞAĞI → SAĞA → AŞAĞI → SOLA
    id: 28,
    name: 'S Yolu',
    width: 10,
    height: 9,
    grid: [
      W,W,W,W,W,W,W,W,W,W,
      W,P,P,P,P,W,W,W,W,W,
      W,W,W,W,P,W,W,W,W,W,
      W,W,W,W,P,P,P,W,W,W,
      W,W,W,W,W,W,P,W,W,W,
      W,W,W,W,W,W,P,P,P,W,
      W,W,W,W,W,W,W,W,P,W,
      W,P,P,P,P,P,P,P,P,W,
      W,W,W,W,W,W,W,W,W,W,
    ],
    startX: 1, startY: 1,
    targetMoves: 7,
    colorIndex: 3,
  },
  {
    // Seviye 29: "Dev Labirent" (11x11, 9 hamle)
    // 5 yatay koridor, 9 genişlik
    // Çözüm: SAĞA → AŞAĞI → SOLA → AŞAĞI → SAĞA → AŞAĞI → SOLA → AŞAĞI → SAĞA
    id: 29,
    name: 'Dev Labirent',
    width: 11,
    height: 11,
    grid: [
      W,W,W,W,W,W,W,W,W,W,W,
      W,P,P,P,P,P,P,P,P,P,W,
      W,W,W,W,W,W,W,W,W,P,W,
      W,P,P,P,P,P,P,P,P,P,W,
      W,P,W,W,W,W,W,W,W,W,W,
      W,P,P,P,P,P,P,P,P,P,W,
      W,W,W,W,W,W,W,W,W,P,W,
      W,P,P,P,P,P,P,P,P,P,W,
      W,P,W,W,W,W,W,W,W,W,W,
      W,P,P,P,P,P,P,P,P,P,W,
      W,W,W,W,W,W,W,W,W,W,W,
    ],
    startX: 1, startY: 1,
    targetMoves: 9,
    colorIndex: 4,
  },
  {
    // Seviye 30: "Son Sınav" (10x13, 11 hamle)
    // 6 yatay koridor zigzag
    // Çözüm: SAĞA → AŞAĞI → SOLA → AŞAĞI → SAĞA → AŞAĞI → SOLA → AŞAĞI → SAĞA → AŞAĞI → SOLA
    id: 30,
    name: 'Son Sınav',
    width: 10,
    height: 13,
    grid: [
      W,W,W,W,W,W,W,W,W,W,
      W,P,P,P,P,P,P,P,P,W,
      W,W,W,W,W,W,W,W,P,W,
      W,P,P,P,P,P,P,P,P,W,
      W,P,W,W,W,W,W,W,W,W,
      W,P,P,P,P,P,P,P,P,W,
      W,W,W,W,W,W,W,W,P,W,
      W,P,P,P,P,P,P,P,P,W,
      W,P,W,W,W,W,W,W,W,W,
      W,P,P,P,P,P,P,P,P,W,
      W,W,W,W,W,W,W,W,P,W,
      W,P,P,P,P,P,P,P,P,W,
      W,W,W,W,W,W,W,W,W,W,
    ],
    startX: 1, startY: 1,
    targetMoves: 11,
    colorIndex: 5,
  },
];
