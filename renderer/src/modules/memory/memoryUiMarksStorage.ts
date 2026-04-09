/**
 * H-2：本机「重要 / 忽略」标记（不跨设备；可选能力）。
 */
const STORAGE_KEY = "aics.memoryUiMarks.v1";

type Entry = { pinned?: boolean; hidden?: boolean };

type StoreV1 = {
  version: 1;
  entries: Record<string, Entry>;
};

function readStore(): StoreV1 {
  if (typeof window === "undefined") return { version: 1, entries: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, entries: {} };
    const o = JSON.parse(raw) as Partial<StoreV1>;
    const entries = o.entries && typeof o.entries === "object" && !Array.isArray(o.entries) ? o.entries : {};
    return { version: 1, entries: { ...entries } };
  } catch {
    return { version: 1, entries: {} };
  }
}

function writeStore(s: StoreV1): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, entries: s.entries }));
  } catch {
    /* quota */
  }
}

export function getMemoryUiMark(memoryId: string): Entry {
  const id = memoryId.trim();
  if (!id) return {};
  return { ...(readStore().entries[id] ?? {}) };
}

export function setMemoryUiPinned(memoryId: string, pinned: boolean): void {
  const id = memoryId.trim();
  if (!id) return;
  const s = readStore();
  const next: Entry = { ...(s.entries[id] ?? {}) };
  if (pinned) next.pinned = true;
  else delete next.pinned;
  if (Object.keys(next).length === 0) delete s.entries[id];
  else s.entries[id] = next;
  writeStore(s);
}

export function setMemoryUiHidden(memoryId: string, hidden: boolean): void {
  const id = memoryId.trim();
  if (!id) return;
  const s = readStore();
  const next: Entry = { ...(s.entries[id] ?? {}) };
  if (hidden) next.hidden = true;
  else delete next.hidden;
  if (Object.keys(next).length === 0) delete s.entries[id];
  else s.entries[id] = next;
  writeStore(s);
}
