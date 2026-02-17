import { LevelData } from './types';

const W = 0, P = 1;

export const hardLevels: LevelData[] = [
  {
    // Seviye 17: "Zigzag Plus" (8x7, 6 hamle)
    // Sol zigzag + sağ kolon bağlantı
    // Çözüm: SAĞA → AŞAĞI → SOLA → AŞAĞI → SAĞA → YUKARI
    id: 17,
    name: 'Zigzag Plus',
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
    colorIndex: 8,
  },
  {
    // Seviye 18: "Çift Yılan" (9x7, 5 hamle)
    // Çözüm: SAĞA → AŞAĞI → SOLA → AŞAĞI → SAĞA
    id: 18,
    name: 'Çift Yılan',
    width: 9,
    height: 7,
    grid: [
      W,W,W,W,W,W,W,W,W,
      W,P,P,P,P,P,P,P,W,
      W,W,W,W,W,W,W,P,W,
      W,P,P,P,P,P,P,P,W,
      W,P,W,W,W,W,W,W,W,
      W,P,P,P,P,P,P,P,W,
      W,W,W,W,W,W,W,W,W,
    ],
    startX: 1, startY: 1,
    targetMoves: 5,
    colorIndex: 9,
  },
  {
    // Seviye 19: "Geniş Yılan" (9x9, 7 hamle)
    // Çözüm: SAĞA → AŞAĞI → SOLA → AŞAĞI → SAĞA → AŞAĞI → SOLA
    id: 19,
    name: 'Geniş Yılan',
    width: 9,
    height: 9,
    grid: [
      W,W,W,W,W,W,W,W,W,
      W,P,P,P,P,P,P,P,W,
      W,W,W,W,W,W,W,P,W,
      W,P,P,P,P,P,P,P,W,
      W,P,W,W,W,W,W,W,W,
      W,P,P,P,P,P,P,P,W,
      W,W,W,W,W,W,W,P,W,
      W,P,P,P,P,P,P,P,W,
      W,W,W,W,W,W,W,W,W,
    ],
    startX: 1, startY: 1,
    targetMoves: 7,
    colorIndex: 0,
  },
  {
    // Seviye 20: "Ters Zigzag" (9x9, 7 hamle)
    // Sağdan başlayan zigzag
    // Çözüm: SOLA → AŞAĞI → SAĞA → AŞAĞI → SOLA → AŞAĞI → SAĞA
    id: 20,
    name: 'Ters Zigzag',
    width: 9,
    height: 9,
    grid: [
      W,W,W,W,W,W,W,W,W,
      W,P,P,P,P,P,P,P,W,
      W,P,W,W,W,W,W,W,W,
      W,P,P,P,P,P,P,P,W,
      W,W,W,W,W,W,W,P,W,
      W,P,P,P,P,P,P,P,W,
      W,P,W,W,W,W,W,W,W,
      W,P,P,P,P,P,P,P,W,
      W,W,W,W,W,W,W,W,W,
    ],
    startX: 7, startY: 1,
    targetMoves: 7,
    colorIndex: 1,
  },
  {
    // Seviye 21: "Büyük Çerçeve" (9x9, 4 hamle)
    // Çözüm: SAĞA → AŞAĞI → SOLA → YUKARI
    id: 21,
    name: 'Büyük Çerçeve',
    width: 9,
    height: 9,
    grid: [
      W,W,W,W,W,W,W,W,W,
      W,P,P,P,P,P,P,P,W,
      W,P,W,W,W,W,W,P,W,
      W,P,W,W,W,W,W,P,W,
      W,P,W,W,W,W,W,P,W,
      W,P,W,W,W,W,W,P,W,
      W,P,W,W,W,W,W,P,W,
      W,P,P,P,P,P,P,P,W,
      W,W,W,W,W,W,W,W,W,
    ],
    startX: 1, startY: 1,
    targetMoves: 4,
    colorIndex: 2,
  },
  {
    // Seviye 22: "Çift S" (9x9, 7 hamle)
    // Çözüm: SAĞA → AŞAĞI → SAĞA → AŞAĞI → SAĞA → AŞAĞI → SOLA
    id: 22,
    name: 'Çift S',
    width: 9,
    height: 9,
    grid: [
      W,W,W,W,W,W,W,W,W,
      W,P,P,P,W,W,W,W,W,
      W,W,W,P,W,W,W,W,W,
      W,W,W,P,P,P,W,W,W,
      W,W,W,W,W,P,W,W,W,
      W,W,W,W,W,P,P,P,W,
      W,W,W,W,W,W,W,P,W,
      W,P,P,P,P,P,P,P,W,
      W,W,W,W,W,W,W,W,W,
    ],
    startX: 1, startY: 1,
    targetMoves: 7,
    colorIndex: 3,
  },
  {
    // Seviye 23: "Geniş Labirent" (9x7, 6 hamle)
    // Çözüm: SAĞA → AŞAĞI → SOLA → AŞAĞI → SAĞA → YUKARI
    id: 23,
    name: 'Geniş Labirent',
    width: 9,
    height: 7,
    grid: [
      W,W,W,W,W,W,W,W,W,
      W,P,P,P,P,P,W,P,W,
      W,W,W,W,W,P,W,P,W,
      W,P,P,P,P,P,W,P,W,
      W,P,W,W,W,W,W,P,W,
      W,P,P,P,P,P,P,P,W,
      W,W,W,W,W,W,W,W,W,
    ],
    startX: 1, startY: 1,
    targetMoves: 6,
    colorIndex: 4,
  },
  {
    // Seviye 24: "Dev Halka" (10x8, 4 hamle)
    // Çözüm: SAĞA → AŞAĞI → SOLA → YUKARI
    id: 24,
    name: 'Dev Halka',
    width: 10,
    height: 8,
    grid: [
      W,W,W,W,W,W,W,W,W,W,
      W,P,P,P,P,P,P,P,P,W,
      W,P,W,W,W,W,W,W,P,W,
      W,P,W,W,W,W,W,W,P,W,
      W,P,W,W,W,W,W,W,P,W,
      W,P,W,W,W,W,W,W,P,W,
      W,P,P,P,P,P,P,P,P,W,
      W,W,W,W,W,W,W,W,W,W,
    ],
    startX: 1, startY: 1,
    targetMoves: 4,
    colorIndex: 5,
  },
];
