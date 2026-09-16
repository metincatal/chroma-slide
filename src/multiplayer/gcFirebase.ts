import { Database, ref, get, set, update, runTransaction } from 'firebase/database';
import {
  GC_RUN_INTERVAL_MS, GC_BACKFILL_INTERVAL_MS, GC_MAX_CHECKS_PER_RUN, GC_MAX_BACKFILL_PER_RUN,
} from '../utils/constants';
import { GcKind, GcStore, GcReport, DeleteOutcome, gcKey, isValidCode, runGc } from './gcPolicy';

// ===== ESKİ OYUN TEMİZLİĞİ: FIREBASE BAĞLANTISI VE ZAMANLAMA =====

const GC_ROOT = 'rooms/_gc';
const LAST_RUN_KEY = 'chromaslide_gc_last_run';
const LAST_BACKFILL_KEY = 'chromaslide_gc_last_backfill';

function pathOf(kind: GcKind, code: string): string {
  // Son savunma hattı: doğrulanmamış kod asla yol üretmesin
  if (!isValidCode(kind, code)) throw new Error(`Geçersiz ${kind} kodu: ${code}`);
  return kind === 'turn' ? `rooms/_turn/${code}` : `rooms/${code}`;
}

// --- Etkinlik dizini: oyun kodu yazıldığında çağrılır (hata olursa sessizce yutulur) ---

export function touchGc(db: Database, kind: GcKind, code: string): void {
  try {
    set(ref(db, `${GC_ROOT}/${gcKey(kind, code)}`), Date.now()).catch(() => {});
  } catch { /* geçersiz kod: dizine yazılmaz */ }
}

export function dropGc(db: Database, kind: GcKind, code: string): void {
  try {
    set(ref(db, `${GC_ROOT}/${gcKey(kind, code)}`), null).catch(() => {});
  } catch { /* yoksay */ }
}

// --- GcStore uygulaması ---

class FirebaseGcStore implements GcStore {
  constructor(private db: Database, private databaseURL: string) {}

  async readIndex(): Promise<Record<string, unknown>> {
    const snap = await get(ref(this.db, GC_ROOT));
    const v = snap.val();
    return v && typeof v === 'object' ? { ...v } : {};
  }

  async setIndex(key: string, at: number): Promise<void> {
    await set(ref(this.db, `${GC_ROOT}/${key}`), at);
  }

  async removeIndex(key: string): Promise<void> {
    await set(ref(this.db, `${GC_ROOT}/${key}`), null);
  }

  // Yalnızca anahtarları çeker (shallow): içerik indirilmez
  async listCodes(kind: GcKind): Promise<string[]> {
    const node = kind === 'turn' ? 'rooms/_turn' : 'rooms/_live';
    try {
      const base = this.databaseURL.replace(/\/+$/, '');
      const res = await fetch(`${base}/${node}.json?shallow=true`);
      if (!res.ok) return [];
      const data = await res.json();
      return data && typeof data === 'object' && !('error' in data) ? Object.keys(data) : [];
    } catch {
      return [];
    }
  }

  async read(kind: GcKind, code: string): Promise<unknown> {
    const snap = await get(ref(this.db, pathOf(kind, code)));
    return snap.val();
  }

  async deleteIf(kind: GcKind, code: string, decide: (raw: unknown) => boolean): Promise<DeleteOutcome> {
    let sawData = false;
    const result = await runTransaction(ref(this.db, pathOf(kind, code)), (raw) => {
      // Yerel önbellek boşsa ilk çağrı null gelir; null döndürünce sunucu gerçek değerle tekrar dener
      if (raw === null) { sawData = false; return raw; }
      sawData = true;
      return decide(raw) ? null : undefined;
    }, { applyLocally: false });

    if (!result.committed) return 'kept';
    return sawData ? 'deleted' : 'missing';
  }

  async removeArenaSide(code: string): Promise<void> {
    if (!isValidCode('arena', code)) return;
    await update(ref(this.db, 'rooms'), {
      [`_live/${code}`]: null,
      [`_index/${code}`]: null,
    });
  }
}

// --- Zamanlama ---

type GcMode = 'off' | 'dry' | 'run';

function readTs(key: string): number {
  try { return parseInt(localStorage.getItem(key) ?? '0', 10) || 0; } catch { return 0; }
}
function writeTs(key: string, v: number): void {
  try { localStorage.setItem(key, String(v)); } catch { /* yoksay */ }
}

// Uygulama açılışında çağrılır. Cihaz başına en fazla 6 saatte bir çalışır.
//
// Geliştirme sunucusunda varsayılan olarak KAPALI: yerel ortam da canlı veritabanını
// kullandığı için test sırasında başkalarının oyunlarını silmesin.
//   ?gc=dry           → hiçbir şey yazmadan silinecekleri konsola yazar
//   ?gc=run           → gerçekten çalıştırır (sıklık sınırı olmadan)
//   ?gcOnly=KOD1,KOD2 → yalnızca bu kodlara dokunur
export function scheduleCleanup(db: Database, databaseURL: string): void {
  const params = new URLSearchParams(window.location.search);
  const param = params.get('gc');
  const onlyRaw = params.get('gcOnly');

  let mode: GcMode = import.meta.env.DEV ? 'off' : 'run';
  if (param === 'off' || param === 'dry' || param === 'run') mode = param;
  else if (onlyRaw) mode = 'run';
  if (mode === 'off' || !databaseURL) return;

  const forced = param !== null || onlyRaw !== null;
  const now = Date.now();
  if (!forced && now - readTs(LAST_RUN_KEY) < GC_RUN_INTERVAL_MS) return;

  const onlyCodes = onlyRaw
    ? new Set(onlyRaw.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean))
    : undefined;

  // Açılışı yavaşlatmasın; ayrıca aynı anda açılan cihazlar çakışmasın diye küçük rastgele gecikme
  const delay = forced ? 1500 : 8000 + Math.floor(Math.random() * 7000);
  window.setTimeout(async () => {
    const startedAt = Date.now();
    const backfill = !onlyCodes && (forced || startedAt - readTs(LAST_BACKFILL_KEY) >= GC_BACKFILL_INTERVAL_MS);
    if (mode === 'run' && !forced) writeTs(LAST_RUN_KEY, startedAt);
    if (mode === 'run' && backfill && !forced) writeTs(LAST_BACKFILL_KEY, startedAt);

    try {
      const report: GcReport = await runGc(new FirebaseGcStore(db, databaseURL), {
        now: startedAt,
        dryRun: mode === 'dry',
        onlyCodes,
        maxChecks: GC_MAX_CHECKS_PER_RUN,
        backfill,
        maxBackfill: GC_MAX_BACKFILL_PER_RUN,
      });
      (window as unknown as { __chromaGc?: GcReport }).__chromaGc = report;
      if (forced) console.info(`[temizlik:${mode}]`, report);
    } catch (e) {
      if (forced) console.warn('[temizlik] hata', e);
    }
  }, delay);
}
