import { LevelData } from './types';

const W = 0, P = 1;

export const mediumLevels: LevelData[] = [
  {
    // Seviye 9: "Çift Zigzag" (7x7, 5 hamle)
    // Çözüm: SAĞA → AŞAĞI → SOLA → AŞAĞI → SAĞA
    id: 9,
    name: 'Çift Zigzag',
    width: 7,
    height: 7,
    grid: [
      W,W,W,W,W,W,W,
      W,P,P,P,P,P,W,
      W,W,W,W,W,P,W,
      W,P,P,P,P,P,W,
      W,P,W,W,W,W,W,
      W,P,P,P,P,P,W,
      W,W,W,W,W,W,W,
    ],
    startX: 1, startY: 1,
    targetMoves: 5,
    colorIndex: 0,
  },
  {
    // Seviye 10: "Büyük Halka" (7x7, 4 hamle)
    // Çözüm: SAĞA → AŞAĞI → SOLA → YUKARI
    id: 10,
    name: 'Büyük Halka',
    width: 7,
    height: 7,
    grid: [
      W,W,W,W,W,W,W,
      W,P,P,P,P,P,W,
      W,P,W,W,W,P,W,
      W,P,W,W,W,P,W,
      W,P,W,W,W,P,W,
      W,P,P,P,P,P,W,
      W,W,W,W,W,W,W,
    ],
    startX: 1, startY: 1,
    targetMoves: 4,
    colorIndex: 1,
  },
  {
    // Seviye 11: "S Kıvrımı" (7x7, 5 hamle)
    // Çözüm: SAĞA → AŞAĞI → SAĞA → AŞAĞI → SOLA
    id: 11,
    name: 'S Kıvrımı',
    width: 7,
    height: 7,
    grid: [
      W,W,W,W,W,W,W,
      W,P,P,P,W,W,W,
      W,W,W,P,W,W,W,
      W,W,W,P,P,P,W,
      W,W,W,W,W,P,W,
      W,P,P,P,P,P,W,
      W,W,W,W,W,W,W,
    ],
    startX: 1, startY: 1,
    targetMoves: 5,
    colorIndex: 2,
  },
  {
    // Seviye 12: "Yılan" (8x7, 5 hamle)
    // Çözüm: SAĞA → AŞAĞI → SOLA → AŞAĞI → SAĞA
    id: 12,
    name: 'Yılan',
    width: 8,
    height: 7,
    grid: [
      W,W,W,W,W,W,W,W,
      W,P,P,P,P,P,P,W,
      W,W,W,W,W,W,P,W,
      W,P,P,P,P,P,P,W,
      W,P,W,W,W,W,W,W,
      W,P,P,P,P,P,P,W,
      W,W,W,W,W,W,W,W,
    ],
    startX: 1, startY: 1,
    targetMoves: 5,
    colorIndex: 3,
  },
  {
    // Seviye 13: "Geniş Halka" (8x6, 4 hamle)
    // Çözüm: SAĞA → AŞAĞI → SOLA → YUKARI
    id: 13,
    name: 'Geniş Halka',
    width: 8,
    height: 6,
    grid: [
      W,W,W,W,W,W,W,W,
      W,P,P,P,P,P,P,W,
      W,P,W,W,W,W,P,W,
      W,P,W,W,W,W,P,W,
      W,P,P,P,P,P,P,W,
      W,W,W,W,W,W,W,W,
    ],
    startX: 1, startY: 1,
    targetMoves: 4,
    colorIndex: 4,
  },
  {
    // Seviye 14: "Labirent Girişi" (8x7, 6 hamle)
    // Çözüm: SAĞA → AŞAĞI → SOLA → AŞAĞI → SAĞA → YUKARI
    id: 14,
    name: 'Labirent Girişi',
    width: 8,
    height: 7,
    grid: [
      W,W,W,W,W,W,W,W,
      W,P,P,P,P,W,P,W,
      W,W,W,W,P,W,P,W,
      W,P,P,P,P,W,P,W,
      W,P,W,W,W,W,P,W,
      W,P,P,P,P,P,P,W,
      W,W,W,W,W,W,W,W,
    ],
    startX: 1, startY: 1,
    targetMoves: 6,
    colorIndex: 5,
  },
  {
    // Seviye 15: "Uzun Yılan" (8x9, 7 hamle)
    // Çözüm: SAĞA → AŞAĞI → SOLA → AŞAĞI → SAĞA → AŞAĞI → SOLA
    id: 15,
    name: 'Uzun Yılan',
    width: 8,
    height: 9,
    grid: [
      W,W,W,W,W,W,W,W,
      W,P,P,P,P,P,P,W,
      W,W,W,W,W,W,P,W,
      W,P,P,P,P,P,P,W,
      W,P,W,W,W,W,W,W,
      W,P,P,P,P,P,P,W,
      W,W,W,W,W,W,P,W,
      W,P,P,P,P,P,P,W,
      W,W,W,W,W,W,W,W,
    ],
    startX: 1, startY: 1,
    targetMoves: 7,
    colorIndex: 6,
  },
  {
    // Seviye 16: "Dikdörtgen Halka" (8x8, 4 hamle)
    // Çözüm: SAĞA → AŞAĞI → SOLA → YUKARI
    id: 16,
    name: 'Dikdörtgen Halka',
    width: 8,
    height: 8,
    grid: [
      W,W,W,W,W,W,W,W,
      W,P,P,P,P,P,P,W,
      W,P,W,W,W,W,P,W,
      W,P,W,W,W,W,P,W,
      W,P,W,W,W,W,P,W,
      W,P,W,W,W,W,P,W,
      W,P,P,P,P,P,P,W,
      W,W,W,W,W,W,W,W,
    ],
    startX: 1, startY: 1,
    targetMoves: 4,
    colorIndex: 7,
  },
];
