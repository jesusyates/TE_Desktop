/**
 * H-3：本机「使用次数」统计（可选展示；不跨设备）。
 */
const STORAGE_KEY = "aics.templateUseCounts.v1";

type StoreV1 = { version: 1; counts: Record<string, number> };

function readStore(): StoreV1 {
  if (typeof window === "undefined") return { version: 1, counts: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, counts: {} };
    const o = JSON.parse(raw) as Partial<StoreV1>;
    const counts =
      o.counts && typeof o.counts === "object" && !Array.isArray(o.counts)
        ? { ...(o.counts as Record<string, number>) }
        : {};
    return { version: 1, counts };
  } catch {
    return { version: 1, counts: {} };
  }
}

function writeStore(s: StoreV1): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, counts: s.counts }));
  } catch {
    /* quota */
  }
}

export function getTemplateUseCount(templateId: string): number {
  const id = templateId.trim();
  if (!id) return 0;
  const n = readStore().counts[id];
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function bumpTemplateUseCount(templateId: string): void {
  const id = templateId.trim();
  if (!id) return;
  const s = readStore();
  const prev = s.counts[id] ?? 0;
  s.counts[id] = prev + 1;
  writeStore(s);
}
