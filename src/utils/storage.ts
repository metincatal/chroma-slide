const STORAGE_KEY = 'chromaslide_progress';
const THEME_KEY = 'chromaslide_theme';

interface ProgressData {
  unlockedLevel: number;
  stars: Record<number, number>;
  bestMoves: Record<number, number>;
}

function getDefault(): ProgressData {
  return {
    unlockedLevel: 1,
    stars: {},
    bestMoves: {},
  };
}

function load(): ProgressData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...getDefault(), ...JSON.parse(raw) };
  } catch {}
  return getDefault();
}

function save(data: ProgressData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

export function getUnlockedLevel(): number {
  return load().unlockedLevel;
}

export function getStars(levelId: number): number {
  return load().stars[levelId] || 0;
}

export function getBestMoves(levelId: number): number {
  return load().bestMoves[levelId] || 0;
}

export function saveProgress(levelId: number, stars: number, moves: number) {
  const data = load();

  // En iyi yıldızı kaydet
  if (!data.stars[levelId] || stars > data.stars[levelId]) {
    data.stars[levelId] = stars;
  }

  // En iyi hamleyi kaydet
  if (!data.bestMoves[levelId] || moves < data.bestMoves[levelId]) {
    data.bestMoves[levelId] = moves;
  }

  // Sonraki seviyeyi aç
  if (levelId >= data.unlockedLevel) {
    data.unlockedLevel = levelId + 1;
  }

  save(data);
}

export function getAllStars(): Record<number, number> {
  return load().stars;
}

export function saveTheme(themeId: string) {
  try {
    localStorage.setItem(THEME_KEY, themeId);
  } catch {}
}

export function getSelectedTheme(): string {
  try {
    return localStorage.getItem(THEME_KEY) || 'ice';
  } catch {
    return 'ice';
  }
}
