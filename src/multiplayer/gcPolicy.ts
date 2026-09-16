import {
  GC_TURN_FINISHED_MS, GC_TURN_WAITING_MS, GC_TURN_PLAYING_MS,
  GC_ARENA_IDLE_MS, GC_ARENA_HARD_MS,
} from '../utils/constants';
import { normalizeGame, nextSeatOf } from './turnData';

// ===== ESKİ OYUN TEMİZLİĞİ: KARAR MANTIĞI =====
// Firebase'e bağımlı değildir. Veritabanı işlemleri GcStore arayüzü üzerinden gelir;
// böylece silme kararları gerçek veriye dokunmadan test edilebilir.
//
// Dizin: rooms/_gc/{tür}_{kod} = son etkinlik zamanı (ms).
// Canlı kurallar rooms altını listelemeye izin vermediği için temizlik, oyunları
// bu küçük dizinden bulur. Dizin yalnızca aday seçer; silme kararı her zaman
// oyunun kendi verisi işlem içinde yeniden okunarak verilir.

export type GcKind = 'turn' | 'arena';

const CODE_PATTERN: Record<GcKind, RegExp> = {
  turn: /^[A-Z0-9]{5}$/,
  arena: /^[A-Z0-9]{4}$/,
};

// Kod doğrulaması güvenlik sınırıdır: geçersiz kod "rooms/_turn" gibi bir
// kapsayıcı düğümün yolunu üretip onu silebilirdi.
export function isValidCode(kind: GcKind, code: string): boolean {
  return typeof code === 'string' && CODE_PATTERN[kind].test(code);
}

export function gcKey(kind: GcKind, code: string): string {
  if (!isValidCode(kind, code)) throw new Error(`Geçersiz ${kind} kodu: ${code}`);
  return `${kind}_${code}`;
}

export function parseGcKey(key: string): { kind: GcKind; code: string } | null {
  const i = key.indexOf('_');
  if (i <= 0) return null;
  const kind = key.slice(0, i) as GcKind;
  const code = key.slice(i + 1);
  if (kind !== 'turn' && kind !== 'arena') return null;
  return isValidCode(kind, code) ? { kind, code } : null;
}

export interface GcDecision {
  expired: boolean;
  activity: number;  // son etkinlik zamanı, dizini güncellemek için
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

// Sıralı oyun: bitmiş ve bekleyen 7 gün, kimsenin dokunmadığı devam eden 30 gün
export function turnGameDecision(raw: unknown, now: number): GcDecision | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const activity = Math.max(num(r.lastMoveAt), num(r.createdAt));

  const game = normalizeGame('XXXXX', raw);
  if (!game) {
    // Bozuk kayıt: en kısa süreyi uygula
    return { expired: now - activity > GC_TURN_WAITING_MS, activity };
  }

  const age = now - activity;
  if (game.state === 'finished' || (game.state === 'playing' && nextSeatOf(game) === -1)) {
    return { expired: age > GC_TURN_FINISHED_MS, activity };
  }
  if (game.state === 'waiting') {
    return { expired: age > GC_TURN_WAITING_MS, activity };
  }
  return { expired: age > GC_TURN_PLAYING_MS, activity };
}

// Arena odası: kimse bağlı değilse 6 saat, her durumda en fazla 3 gün
export function arenaRoomDecision(raw: unknown, now: number): GcDecision | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const activity = Math.max(num(r.createdAt), num(r.gameStartAt), num(r.gameEndAt));

  const players = (r.players && typeof r.players === 'object') ? Object.values(r.players as object) : [];
  const anyConnected = players.some((p) => !!p && (p as { connected?: unknown }).connected === true);

  const age = now - activity;
  const expired = (!anyConnected && age > GC_ARENA_IDLE_MS) || age > GC_ARENA_HARD_MS;
  return { expired, activity };
}

// Dizinden aday seçerken kullanılan en kısa yaş: bunun altındaki kayıt hiç okunmaz
export function minAgeFor(kind: GcKind): number {
  return kind === 'turn'
    ? Math.min(GC_TURN_FINISHED_MS, GC_TURN_WAITING_MS, GC_TURN_PLAYING_MS)
    : Math.min(GC_ARENA_IDLE_MS, GC_ARENA_HARD_MS);
}

export type DeleteOutcome = 'deleted' | 'kept' | 'missing';

export interface GcStore {
  readIndex(): Promise<Record<string, unknown>>;
  setIndex(key: string, at: number): Promise<void>;
  removeIndex(key: string): Promise<void>;
  listCodes(kind: GcKind): Promise<string[]>;   // turn: rooms/_turn, arena: rooms/_live
  read(kind: GcKind, code: string): Promise<unknown>;
  // Veriyi işlem içinde yeniden okuyup karar fonksiyonu true derse siler
  deleteIf(kind: GcKind, code: string, decide: (raw: unknown) => boolean): Promise<DeleteOutcome>;
  // Arena odası silinince yanındaki yan kayıtlar (rooms/_live, rooms/_index)
  removeArenaSide(code: string): Promise<void>;
}

export interface GcOptions {
  now: number;
  dryRun: boolean;
  onlyCodes?: ReadonlySet<string>;
  maxChecks: number;
  backfill: boolean;
  maxBackfill: number;
}

export interface GcReport {
  deleted: string[];
  wouldDelete: string[];
  kept: string[];
  missing: string[];
  backfilled: string[];
  orphans: string[];
  invalidKeys: string[];
}

function decide(kind: GcKind, raw: unknown, now: number): GcDecision | null {
  return kind === 'turn' ? turnGameDecision(raw, now) : arenaRoomDecision(raw, now);
}

export async function runGc(store: GcStore, opts: GcOptions): Promise<GcReport> {
  const report: GcReport = {
    deleted: [], wouldDelete: [], kept: [], missing: [], backfilled: [], orphans: [], invalidKeys: [],
  };
  const allowed = (code: string) => !opts.onlyCodes || opts.onlyCodes.has(code);

  const index = await store.readIndex();

  // --- 1) Dizinde olmayan kayıtları bul (bu özellikten önce oluşmuş oyunlar dahil) ---
  if (opts.backfill) {
    let budget = opts.maxBackfill;
    for (const kind of ['turn', 'arena'] as GcKind[]) {
      const codes = await store.listCodes(kind);
      for (const code of codes) {
        if (budget <= 0) break;
        if (!isValidCode(kind, code) || !allowed(code)) continue;
        const key = gcKey(kind, code);
        if (key in index) continue;
        budget--;

        const raw = await store.read(kind, code);
        const d = decide(kind, raw, opts.now);
        if (!d) {
          // Arena: rooms/_live kaydı var ama odanın kendisi yok → yetim yan kayıt
          if (kind === 'arena') {
            report.orphans.push(key);
            if (!opts.dryRun) await store.removeArenaSide(code);
          }
          continue;
        }
        index[key] = d.activity;
        report.backfilled.push(key);
        if (!opts.dryRun) await store.setIndex(key, d.activity);
      }
    }
  }

  // --- 2) Adayları seç: en eski önce, tür başına en kısa yaşı geçmiş olanlar ---
  const candidates: { key: string; kind: GcKind; code: string; at: number }[] = [];
  for (const [key, value] of Object.entries(index)) {
    const parsed = parseGcKey(key);
    if (!parsed) {
      report.invalidKeys.push(key);
      if (!opts.dryRun) await store.removeIndex(key);
      continue;
    }
    if (!allowed(parsed.code)) continue;
    const at = num(value);
    if (opts.now - at < minAgeFor(parsed.kind)) continue;
    candidates.push({ key, ...parsed, at });
  }
  candidates.sort((a, b) => a.at - b.at);

  // --- 3) Her adayı işlem içinde yeniden doğrulayıp sil ---
  for (const c of candidates.slice(0, opts.maxChecks)) {
    if (opts.dryRun) {
      const raw = await store.read(c.kind, c.code);
      const d = decide(c.kind, raw, opts.now);
      if (!d) report.missing.push(c.key);
      else if (d.expired) report.wouldDelete.push(c.key);
      else report.kept.push(c.key);
      continue;
    }

    let last: GcDecision | null = null;
    const outcome = await store.deleteIf(c.kind, c.code, (raw) => {
      last = decide(c.kind, raw, opts.now);
      return !!last && last.expired;
    });

    if (outcome === 'deleted' || outcome === 'missing') {
      if (c.kind === 'arena') await store.removeArenaSide(c.code);
      await store.removeIndex(c.key);
      (outcome === 'deleted' ? report.deleted : report.missing).push(c.key);
    } else {
      // Süresi dolmamış: dizini gerçek etkinlik zamanıyla tazele, bir dahaki turda boşuna okunmasın
      report.kept.push(c.key);
      const activity = (last as GcDecision | null)?.activity;
      if (typeof activity === 'number') await store.setIndex(c.key, activity);
    }
  }

  return report;
}
