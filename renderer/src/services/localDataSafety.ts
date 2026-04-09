/**
 * D-7-3T：本地数据轻量防护 — Base64(UTF-8 JSON) + JSONL 整行写入；读时跳过坏行并 warn。
 * 不加密、不压缩、不改 hash 与业务接口。
 */

export const LOCAL_DATA_DOC_MARK = "AICS-LD1";

function utf8ToBase64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}

function base64ToUtf8(b64: string): string {
  return decodeURIComponent(escape(atob(b64)));
}

/** 单条记录的 JSONL 物理行（不含换行）：Base64(UTF-8 JSON) */
export function encodeB64JsonlPhysicalLine(record: unknown): string {
  return utf8ToBase64(JSON.stringify(record));
}

/**
 * localStorage 用：首行版本标记 + 一行 Base64 载荷，末尾换行保证「整行」结束。
 */
export function encodeLocalStorageDocument(record: unknown): string {
  return `${LOCAL_DATA_DOC_MARK}\n${encodeB64JsonlPhysicalLine(record)}\n`;
}

/**
 * 解析 localStorage 文档：新格式（AICS-LD1 + base64 行）、或旧版纯 JSON、或单行 base64。
 * 多载荷行时取**最后一条**成功解析的结果（与覆盖写一致）。
 */
export function decodeLocalStorageDocument<T>(raw: string, label: string): T | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      console.warn(`[D-7-3T] ${label} legacy JSON parse failed`);
      return null;
    }
  }

  const lines = raw.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  if (lines[0] === LOCAL_DATA_DOC_MARK) {
    let lastOk: T | null = null;
    for (let i = 1; i < lines.length; i++) {
      try {
        const json = base64ToUtf8(lines[i]);
        lastOk = JSON.parse(json) as T;
      } catch {
        console.warn(`[D-7-3T] ${label} skip bad b64/json line at ${i}`);
      }
    }
    return lastOk;
  }

  try {
    const json = base64ToUtf8(lines[lines.length - 1]);
    return JSON.parse(json) as T;
  } catch {
    console.warn(`[D-7-3T] ${label} single-line base64 parse failed`);
    return null;
  }
}
