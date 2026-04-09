import type { BrowserWindow, ContextMenuParams, MenuItemConstructorOptions } from "electron";
import type { ContextMenuStrings } from "./contextMenuStrings.js";

/**
 * 覆盖系统默认英文 context-menu；文案由 contextMenuStringsForLocale 提供，便于后续扩展项。
 */
export function buildLocalizedContextMenuTemplate(
  win: BrowserWindow,
  params: ContextMenuParams,
  L: ContextMenuStrings
): MenuItemConstructorOptions[] {
  const wc = win.webContents;
  const template: MenuItemConstructorOptions[] = [];

  if (params.isEditable) {
    template.push(
      { label: L.undo, enabled: params.editFlags.canUndo, click: () => wc.undo() },
      { label: L.redo, enabled: params.editFlags.canRedo, click: () => wc.redo() },
      { type: "separator" },
      { label: L.cut, enabled: params.editFlags.canCut, click: () => wc.cut() },
      { label: L.copy, enabled: params.editFlags.canCopy, click: () => wc.copy() },
      { label: L.paste, enabled: params.editFlags.canPaste, click: () => wc.paste() },
      { type: "separator" },
      { label: L.selectAll, enabled: params.editFlags.canSelectAll, click: () => wc.selectAll() }
    );
  } else {
    const hasSel = Boolean(params.selectionText && params.selectionText.trim().length > 0);
    if (hasSel && params.editFlags.canCopy) {
      template.push({ label: L.copy, click: () => wc.copy() });
    }
    if (template.length > 0) {
      template.push({ type: "separator" });
    }
    template.push({
      label: L.selectAll,
      enabled: params.editFlags.canSelectAll,
      click: () => wc.selectAll()
    });
  }

  return template.filter((item, i, arr) => {
    if (item.type !== "separator") return true;
    const prev = arr[i - 1];
    const next = arr[i + 1];
    return Boolean(prev && next && prev.type !== "separator" && next.type !== "separator");
  });
}
