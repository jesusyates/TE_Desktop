/** Result Assetization v1：轻量「重要」标记（localStorage，无后端） */
export const RESULT_ASSET_STARS_LS_KEY = "aics.resultStars.v1";

function parseIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

export function readStarredResultIds(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(RESULT_ASSET_STARS_LS_KEY);
    if (!raw?.trim()) return [];
    return parseIds(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

export function isResultStarred(storageId: string): boolean {
  const id = storageId.trim();
  if (!id) return false;
  return readStarredResultIds().includes(id);
}

/** @returns 切换后的「是否已标记」 */
export function toggleStarredResultId(storageId: string): boolean {
  const id = storageId.trim();
  if (!id) return false;
  if (typeof localStorage === "undefined") return false;
  const cur = readStarredResultIds();
  const has = cur.includes(id);
  const next = has ? cur.filter((x) => x !== id) : [...cur, id];
  try {
    localStorage.setItem(RESULT_ASSET_STARS_LS_KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
  return !has;
}
