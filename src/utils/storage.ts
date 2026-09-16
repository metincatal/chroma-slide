import { GameMode, MpSettings, MP_DEFAULT_SETTINGS, MP_ARENA_SIZES, MP_DURATIONS } from './constants';

const STORAGE_KEY = 'chromaslide_progress';
const THEME_KEY = 'chromaslide_theme';

interface ModeProgress {
  unlockedLevel: number;
  stars: Record<number, number>;
  bestMoves: Record<number, number>;
}

interface ProgressData {
  thinking: ModeProgress;
  relaxing: ModeProgress;
}

function getDefaultMode(): ModeProgress {
  return {
    unlockedLevel: 1,
    stars: {},
    bestMoves: {},
  };
}

function getDefault(): ProgressData {
  return {
    thinking: getDefaultMode(),
    relaxing: getDefaultMode(),
  };
}

function load(): ProgressData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Eski format migration: thinking/relaxing alanlari yoksa eski veriyi thinking'e tasi
      if (!parsed.thinking && !parsed.relaxing) {
        const oldData = { ...getDefaultMode(), ...parsed };
        return {
          thinking: oldData,
          relaxing: getDefaultMode(),
        };
      }
      return {
        thinking: { ...getDefaultMode(), ...parsed.thinking },
        relaxing: { ...getDefaultMode(), ...parsed.relaxing },
      };
    }
  } catch {}
  return getDefault();
}

function save(data: ProgressData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

export function getUnlockedLevel(mode: GameMode = 'thinking'): number {
  return load()[mode].unlockedLevel;
}

export function getStars(levelId: number, mode: GameMode = 'thinking'): number {
  return load()[mode].stars[levelId] || 0;
}

export function getBestMoves(levelId: number, mode: GameMode = 'thinking'): number {
  return load()[mode].bestMoves[levelId] || 0;
}

export function saveProgress(levelId: number, stars: number, moves: number, mode: GameMode = 'thinking') {
  const data = load();
  const modeData = data[mode];

  // En iyi yildizi kaydet
  if (!modeData.stars[levelId] || stars > modeData.stars[levelId]) {
    modeData.stars[levelId] = stars;
  }

  // En iyi hamleyi kaydet
  if (!modeData.bestMoves[levelId] || moves < modeData.bestMoves[levelId]) {
    modeData.bestMoves[levelId] = moves;
  }

  // Sonraki seviyeyi ac
  if (levelId >= modeData.unlockedLevel) {
    modeData.unlockedLevel = levelId + 1;
  }

  save(data);
}

export function getAllStars(mode: GameMode = 'thinking'): Record<number, number> {
  return load()[mode].stars;
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

// --- Onboarding ---

const ONBOARDING_KEY = 'chromaslide_onboarding_seen';

export function hasSeenOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === '1';
  } catch {
    return false;
  }
}

export function markOnboardingSeen(): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, '1');
  } catch {}
}

// --- Çok oyunculu isim/renk kalıcılığı ---

const MP_NAME_KEY         = 'chroma_mp_name';
const MP_COLOR_INDEX_KEY  = 'chroma_mp_color';

export function getMpName(): string | null {
  try {
    return localStorage.getItem(MP_NAME_KEY);
  } catch {
    return null;
  }
}

export function saveMpName(name: string): void {
  try {
    localStorage.setItem(MP_NAME_KEY, name);
  } catch {}
}

export function getMpColorIndex(): number {
  try {
    const raw = localStorage.getItem(MP_COLOR_INDEX_KEY);
    if (raw !== null) return parseInt(raw, 10);
  } catch {}
  // Yoksa rastgele bir indeks döndür (PAINT_GRADIENTS uzunluğu 8 kabul)
  return Math.floor(Math.random() * 8);
}

export function saveMpColorIndex(index: number): void {
  try {
    localStorage.setItem(MP_COLOR_INDEX_KEY, String(index));
  } catch {}
}

// --- Oyuncu kimliği (multiplayer + presence) ---

const MP_ID_KEY = 'chroma_mp_id';

export function getOrCreatePlayerId(): string {
  // Geliştirme: ?pid=xyz ile aynı tarayıcıda farklı oyuncu kimliği (iki sekme testi)
  try {
    const override = new URLSearchParams(window.location.search).get('pid');
    if (override) return `dev_${override.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  } catch {}
  let id = localStorage.getItem(MP_ID_KEY);
  if (!id) {
    id = `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    localStorage.setItem(MP_ID_KEY, id);
  }
  return id;
}

// Geliştirme: ?dur=15 ile tur süresini saniye cinsinden kısalt (yalnızca host'ta etkili)
export function getDevRoundDurationMs(): number | null {
  try {
    const v = new URLSearchParams(window.location.search).get('dur');
    if (!v) return null;
    const sec = parseInt(v, 10);
    return Number.isFinite(sec) && sec >= 5 ? sec * 1000 : null;
  } catch { return null; }
}

// --- Çok oyunculu oda ayarları (host'un son seçimi) ---

const MP_SETTINGS_KEY = 'chroma_mp_settings';

export function getMpSettings(): MpSettings {
  const d = { ...MP_DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(MP_SETTINGS_KEY);
    if (!raw) return d;
    const p = JSON.parse(raw) as Partial<MpSettings>;
    if ((MP_ARENA_SIZES as readonly number[]).includes(p.arenaSize as number)) d.arenaSize = p.arenaSize as number;
    if ((MP_DURATIONS as readonly number[]).includes(p.durationSec as number)) d.durationSec = p.durationSec as number;
    if (typeof p.powerups === 'boolean') d.powerups = p.powerups;
  } catch {}
  return d;
}

export function saveMpSettings(s: MpSettings): void {
  try {
    localStorage.setItem(MP_SETTINGS_KEY, JSON.stringify(s));
  } catch {}
}

// --- Gosterilmis karo tanitimlari ---

const TILE_HINTS_KEY = 'chromaslide_tile_hints';

export function getSeenTileHints(): string[] {
  try {
    const raw = localStorage.getItem(TILE_HINTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function markTileHintSeen(kind: string): void {
  try {
    const seen = getSeenTileHints();
    if (seen.includes(kind)) return;
    seen.push(kind);
    localStorage.setItem(TILE_HINTS_KEY, JSON.stringify(seen));
  } catch {}
}
