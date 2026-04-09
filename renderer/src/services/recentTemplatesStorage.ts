/**
 * E-1：最近使用模板 ID（本地结构预留；E-3 可从工作台写入）。
 */

const STORAGE_KEY = "aics.templateRecent.v1";
const MAX_IDS = 30;

function loadRawIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const o = JSON.parse(raw) as unknown;
    if (!Array.isArray(o)) return [];
    return o.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
  } catch {
    return [];
  }
}

/** 最近使用的 templateId，新在前 */
export function readRecentTemplateIds(): string[] {
  return loadRawIds();
}

/** 记录一次从模板入口打开（去重、截断） */
export function noteTemplateRecentOpened(templateId: string): void {
  const id = templateId.trim();
  if (!id || typeof window === "undefined") return;
  const prev = loadRawIds().filter((x) => x !== id);
  const next = [id, ...prev].slice(0, MAX_IDS);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
}
