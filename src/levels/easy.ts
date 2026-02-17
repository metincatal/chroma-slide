import { LevelData } from './types';

const W = 0, P = 1;

export const easyLevels: LevelData[] = [
  {
    // Seviye 1: "İlk Adım" (5x3, 1 hamle)
    // Çözüm: SAĞA
    id: 1,
    name: 'İlk Adım',
    width: 5,
    height: 3,
    grid: [
      W,W,W,W,W,
      W,P,P,P,W,
      W,W,W,W,W,
    ],
    startX: 1, startY: 1,
    targetMoves: 1,
    colorIndex: 0,
  },
  {
    // Seviye 2: "L Dönüşü" (5x5, 2 hamle)
    // Çözüm: SAĞA → AŞAĞI
    id: 2,
    name: 'L Dönüşü',
    width: 5,
    height: 5,
    grid: [
      W,W,W,W,W,
      W,P,P,P,W,
      W,W,W,P,W,
      W,W,W,P,W,
      W,W,W,W,W,
    ],
    startX: 1, startY: 1,
    targetMoves: 2,
    colorIndex: 1,
  },
  {
    // Seviye 3: "U Dönüşü" (5x5, 4 hamle)
    // Çözüm: SAĞA → AŞAĞI → SOLA → YUKARI
    id: 3,
    name: 'U Dönüşü',
    width: 5,
    height: 5,
    grid: [
      W,W,W,W,W,
      W,P,P,P,W,
      W,P,W,P,W,
      W,P,P,P,W,
      W,W,W,W,W,
    ],
    startX: 1, startY: 1,
    targetMoves: 4,
    colorIndex: 2,
  },
  {
    // Seviye 4: "Zigzag" (6x7, 5 hamle)
    // Çözüm: SAĞA → AŞAĞI → SOLA → AŞAĞI → SAĞA
    id: 4,
    name: 'Zigzag',
    width: 6,
    height: 7,
    grid: [
      W,W,W,W,W,W,
      W,P,P,P,P,W,
      W,W,W,W,P,W,
      W,P,P,P,P,W,
      W,P,W,W,W,W,
      W,P,P,P,P,W,
      W,W,W,W,W,W,
    ],
    startX: 1, startY: 1,
    targetMoves: 5,
    colorIndex: 3,
  },
  {
    // Seviye 5: "Kare Dönüş" (6x6, 4 hamle)
    // Çözüm: SAĞA → AŞAĞI → SOLA → YUKARI
    id: 5,
    name: 'Kare Dönüş',
    width: 6,
    height: 6,
    grid: [
      W,W,W,W,W,W,
      W,P,P,P,P,W,
      W,P,W,W,P,W,
      W,P,W,W,P,W,
      W,P,P,P,P,W,
      W,W,W,W,W,W,
    ],
    startX: 1, startY: 1,
    targetMoves: 4,
    colorIndex: 4,
  },
  {
    // Seviye 6: "Küçük Spiral" (6x5, 4 hamle)
    // Çözüm: SAĞA → AŞAĞI → SOLA → YUKARI
    id: 6,
    name: 'Küçük Spiral',
    width: 6,
    height: 5,
    grid: [
      W,W,W,W,W,W,
      W,P,P,P,P,W,
      W,P,W,W,P,W,
      W,P,P,P,P,W,
      W,W,W,W,W,W,
    ],
    startX: 1, startY: 1,
    targetMoves: 4,
    colorIndex: 5,
  },
  {
    // Seviye 7: "Çift L" (7x6, 4 hamle)
    // Çözüm: SAĞA → AŞAĞI → SAĞA → AŞAĞI
    id: 7,
    name: 'Çift L',
    width: 7,
    height: 6,
    grid: [
      W,W,W,W,W,W,W,
      W,P,P,P,W,W,W,
      W,W,W,P,W,W,W,
      W,W,W,P,P,P,W,
      W,W,W,W,W,P,W,
      W,W,W,W,W,W,W,
    ],
    startX: 1, startY: 1,
    targetMoves: 4,
    colorIndex: 6,
  },
  {
    // Seviye 8: "Büyük Kare" (6x6, 4 hamle)
    // Çözüm: SAĞA → AŞAĞI → SOLA → YUKARI
    id: 8,
    name: 'Büyük Kare',
    width: 6,
    height: 6,
    grid: [
      W,W,W,W,W,W,
      W,P,P,P,P,W,
      W,P,W,W,P,W,
      W,P,W,W,P,W,
      W,P,P,P,P,W,
      W,W,W,W,W,W,
    ],
    startX: 1, startY: 1,
    targetMoves: 4,
    colorIndex: 7,
  },
];
