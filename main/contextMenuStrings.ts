/**
 * Electron 右键菜单：与 renderer i18n 对齐（zh / en；ja-JP 等与英文 catalog 一致走 en）。
 */
export type ContextMenuStrings = {
  undo: string;
  redo: string;
  cut: string;
  copy: string;
  paste: string;
  selectAll: string;
};

const zh: ContextMenuStrings = {
  undo: "撤销",
  redo: "重做",
  cut: "剪切",
  copy: "复制",
  paste: "粘贴",
  selectAll: "全选"
};

const en: ContextMenuStrings = {
  undo: "Undo",
  redo: "Redo",
  cut: "Cut",
  copy: "Copy",
  paste: "Paste",
  selectAll: "Select All"
};

export function contextMenuStringsForLocale(locale: string): ContextMenuStrings {
  const l = String(locale || "").toLowerCase();
  if (l.startsWith("zh")) return zh;
  return en;
}
