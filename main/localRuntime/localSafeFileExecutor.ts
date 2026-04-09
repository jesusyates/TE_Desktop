/**
 * Local Safe v1：仅本机、无网络；路径一律由主进程对话框选择，不信任渲染进程传入路径。
 * — 重命名（去空格规则）、按扩展名分类子目录（移动/复制）；全程写审计日志供回放。
 */
import type { BrowserWindow } from "electron";
import { dialog } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

export type LocalSafeOpKind = "rename_strip_spaces" | "classify_by_extension";

export type LocalSafeTransferMode = "move" | "copy";

const MAX_ENTRIES = 300;

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".svg"]);
const DOC_EXT = new Set([".pdf", ".doc", ".docx", ".txt", ".md", ".rtf"]);
const SHEET_EXT = new Set([".xls", ".xlsx", ".csv", ".tsv"]);
const ARCHIVE_EXT = new Set([".zip", ".rar", ".7z", ".tar", ".gz"]);

type Category = "Images" | "Docs" | "Sheets" | "Archives" | "Others";

function classifyExt(ext: string): Category {
  const e = ext.toLowerCase();
  if (IMAGE_EXT.has(e)) return "Images";
  if (DOC_EXT.has(e)) return "Docs";
  if (SHEET_EXT.has(e)) return "Sheets";
  if (ARCHIVE_EXT.has(e)) return "Archives";
  return "Others";
}

function stripSpacesFileName(fileName: string): string {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  const cleaned = base.replace(/\s+/g, "");
  const safeBase = cleaned.length > 0 ? cleaned : "file";
  return `${safeBase}${ext}`;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function uniquePath(dir: string, filename: string): Promise<string> {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let candidate = path.join(dir, filename);
  let n = 2;
  while (await pathExists(candidate)) {
    candidate = path.join(dir, `${base}_${n}${ext}`);
    n += 1;
  }
  return candidate;
}

async function pickDirectory(
  parent: BrowserWindow | null,
  logs: string[],
  title: string
): Promise<string | null> {
  const pick = parent
    ? await dialog.showOpenDialog(parent, {
        title,
        properties: ["openDirectory"],
        buttonLabel: "选择此文件夹"
      })
    : await dialog.showOpenDialog({
        title,
        properties: ["openDirectory"],
        buttonLabel: "选择此文件夹"
      });
  if (pick.canceled || !pick.filePaths[0]) {
    logs.push("user_canceled_directory_picker");
    return null;
  }
  const root = path.normalize(pick.filePaths[0]);
  logs.push(`safe_root:${root}`);
  try {
    const st = await fs.stat(root);
    if (!st.isDirectory()) {
      logs.push("not_a_directory");
      return null;
    }
  } catch (e) {
    logs.push(`stat_error:${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
  return root;
}

async function listFilesFlat(root: string, logs: string[]): Promise<string[]> {
  const dirents = await fs.readdir(root, { withFileTypes: true });
  const files: string[] = [];
  let n = 0;
  for (const d of dirents) {
    if (n >= MAX_ENTRIES) {
      logs.push(`truncated_at_${MAX_ENTRIES}`);
      break;
    }
    if (!d.isFile()) continue;
    files.push(path.join(root, d.name));
    n += 1;
  }
  return files;
}

async function confirmPlan(
  parent: BrowserWindow | null,
  title: string,
  detail: string
): Promise<boolean> {
  const opts = {
    type: "question" as const,
    title: "确认本地文件操作",
    message: title,
    detail: detail.slice(0, 6000),
    buttons: ["执行", "取消"],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  };
  const res = parent
    ? await dialog.showMessageBox(parent, opts)
    : await dialog.showMessageBox(opts);
  return res.response === 0;
}

export type LocalSafeExecutionResult = {
  directoryPath: string;
  safeOp: LocalSafeOpKind;
  transferMode?: LocalSafeTransferMode;
  affectedFiles: number;
  auditTrail: string[];
};

export async function runLocalSafeFileOperation(
  parent: BrowserWindow | null,
  input: Record<string, unknown>,
  logs: string[]
): Promise<{ ok: boolean; data?: LocalSafeExecutionResult }> {
  const safeOpRaw = typeof input.safeOp === "string" ? input.safeOp.trim() : "";
  const transferRaw =
    typeof input.transferMode === "string" && input.transferMode === "copy" ? "copy" : "move";

  if (safeOpRaw !== "rename_strip_spaces" && safeOpRaw !== "classify_by_extension") {
    logs.push(`invalid_safeOp:${safeOpRaw}`);
    return { ok: false };
  }

  const safeOp = safeOpRaw as LocalSafeOpKind;
  const root = await pickDirectory(
    parent,
    logs,
    safeOp === "rename_strip_spaces" ? "选择要重命名其中文件的文件夹" : "选择要分类文件的文件夹"
  );
  if (!root) return { ok: false };

  let files: string[];
  try {
    files = await listFilesFlat(root, logs);
  } catch (e) {
    logs.push(`readdir_error:${e instanceof Error ? e.message : String(e)}`);
    return { ok: false };
  }

  const auditTrail: string[] = [];
  auditTrail.push(`op:${safeOp}`);
  auditTrail.push(`root:${root}`);
  auditTrail.push(`file_count:${files.length}`);

  if (safeOp === "rename_strip_spaces") {
    type Plan = { from: string; to: string };
    const sourceKeys = new Set(files.map((f) => path.resolve(f).toLowerCase()));
    const reservedDest = new Set<string>();
    const allocUniqueInDir = async (dir: string, filename: string): Promise<string> => {
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      let candidate = path.join(dir, filename);
      let k = 2;
      for (;;) {
        const key = path.resolve(candidate).toLowerCase();
        const taken = reservedDest.has(key) || sourceKeys.has(key);
        if (!taken && !(await pathExists(candidate))) {
          reservedDest.add(key);
          return candidate;
        }
        candidate = path.join(dir, `${base}_${k}${ext}`);
        k += 1;
      }
    };
    const plan: Plan[] = [];
    for (const full of files) {
      const base = path.basename(full);
      const next = stripSpacesFileName(base);
      if (next !== base) {
        const dir = path.dirname(full);
        const to = await allocUniqueInDir(dir, next);
        plan.push({ from: full, to });
      }
    }
    plan.forEach((p) => auditTrail.push(`plan_rename:${p.from} -> ${p.to}`));
    if (plan.length === 0) {
      logs.push("no_rename_needed");
      return {
        ok: true,
        data: {
          directoryPath: root,
          safeOp,
          affectedFiles: 0,
          auditTrail: [...auditTrail, "result:no_changes"]
        }
      };
    }
    const summary = `将对 ${plan.length} 个文件重命名（去除文件名内空格等，不处理子文件夹）。`;
    const detail = plan.map((p) => `${path.basename(p.from)} → ${path.basename(p.to)}`).join("\n");
    const ok = await confirmPlan(parent, summary, detail);
    if (!ok) {
      logs.push("user_canceled_execution_confirm");
      return { ok: false };
    }
    for (const p of plan) {
      await fs.rename(p.from, p.to);
      auditTrail.push(`done_rename:${p.to}`);
    }
    logs.push(`renamed:${plan.length}`);
    return {
      ok: true,
      data: {
        directoryPath: root,
        safeOp,
        affectedFiles: plan.length,
        auditTrail
      }
    };
  }

  /* classify_by_extension */
  const transferMode = transferRaw as LocalSafeTransferMode;
  auditTrail.push(`transferMode:${transferMode}`);
  type CPlan = { src: string; category: Category; destDir: string; destFile: string };
  const rows: CPlan[] = [];
  for (const full of files) {
    const base = path.basename(full);
    const cat = classifyExt(path.extname(base));
    const destDir = path.join(root, cat);
    rows.push({ src: full, category: cat, destDir, destFile: base });
  }
  const byCat = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + 1;
    return acc;
  }, {});
  const catLine = Object.entries(byCat)
    .map(([k, v]) => `${k}:${v}`)
    .join(", ");
  rows.forEach((r) =>
    auditTrail.push(`plan_${transferMode}:${r.src} -> ${path.join(r.category, r.destFile)}`)
  );

  const summary = `将 ${rows.length} 个文件按扩展名归入子文件夹（${catLine}）。模式：${
    transferMode === "copy" ? "复制（保留原文件）" : "移动"
  }。不处理子文件夹。`;
  const detailPreview = rows
    .slice(0, 40)
    .map((r) => `${path.basename(r.src)} → ${r.category}/${r.destFile}`)
    .join("\n");
  const detail =
    rows.length > 40 ? `${detailPreview}\n… 其余 ${rows.length - 40} 条略` : detailPreview;

  const ok = await confirmPlan(parent, summary, detail);
  if (!ok) {
    logs.push("user_canceled_execution_confirm");
    return { ok: false };
  }

  const dirs = new Set(rows.map((r) => r.destDir));
  for (const d of dirs) {
    await fs.mkdir(d, { recursive: true });
  }

  let nDone = 0;
  for (const r of rows) {
    const dest = await uniquePath(r.destDir, r.destFile);
    if (transferMode === "copy") {
      await fs.copyFile(r.src, dest);
      auditTrail.push(`done_copy:${dest}`);
    } else {
      await fs.rename(r.src, dest);
      auditTrail.push(`done_move:${dest}`);
    }
    nDone += 1;
  }
  logs.push(`classify_${transferMode}:${nDone}`);
  return {
    ok: true,
    data: {
      directoryPath: root,
      safeOp,
      transferMode,
      affectedFiles: nDone,
      auditTrail
    }
  };
}
