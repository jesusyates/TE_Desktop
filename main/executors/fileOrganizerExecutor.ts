/**
 * D-5-3B-mini：本地文件整理（仅 Desktop / Downloads）。由主进程执行 fs，经 IPC 向渲染进程推送 ComputerExecutionEvent。
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

type EmitFn = (event: Record<string, unknown>) => void;

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const DOC_EXT = new Set([".pdf", ".doc", ".docx", ".txt"]);
const SHEET_EXT = new Set([".xls", ".xlsx", ".csv"]);
const ARCHIVE_EXT = new Set([".zip", ".rar"]);

type Category = "Images" | "Docs" | "Sheets" | "Archives" | "Others";

const PREFIX: Record<Category, string> = {
  Images: "IMG_",
  Docs: "DOC_",
  Sheets: "SHEET_",
  Archives: "ARCH_",
  Others: "OTH_"
};

const STEP = {
  scan: "scan",
  classify: "classify",
  mkdir: "mkdir",
  move: "move",
  rename: "rename"
} as const;

function ts(): string {
  return new Date().toISOString();
}

function ev(emit: EmitFn, event: Record<string, unknown>): void {
  emit({ ...event, id: String(event.id ?? randomUUID()), timestamp: String(event.timestamp ?? ts()) });
}

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

/** 不覆盖：同名则追加 _2、_3… */
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

export type FileOrganizerMainInput = {
  targetPath: "Desktop" | "Downloads";
  strategy: "byType";
};

/**
 * @param rootAbs 已通过 app.getPath 解析的绝对路径
 */
export async function runFileOrganizerOnRoot(
  rootAbs: string,
  emitRaw: EmitFn
): Promise<void> {
  const emit = (e: Record<string, unknown>) => ev(emitRaw, e);

  const fail = (stepId: string, message: string) => {
    emit({
      type: "step.error",
      stepId,
      message
    });
    emit({
      type: "execution.error",
      message
    });
  };

  try {
    const osName = process.platform === "win32" ? "windows" : "mac";
    emit({
      type: "environment.detected",
      environment: "desktop",
      os: osName
    });
    emit({
      type: "app.launch",
      appName: "File System",
      windowTitle: path.basename(rootAbs)
    });
    emit({
      type: "app.ready",
      appName: "File System"
    });
    emit({
      type: "log",
      message: `目标目录：${rootAbs}（按类型整理）`
    });

    emit({ type: "step.start", stepId: STEP.scan, title: "扫描文件" });
    const entries = await fs.readdir(rootAbs, { withFileTypes: true });
    const files = entries.filter((d) => d.isFile());
    emit({ type: "step.complete", stepId: STEP.scan });

    emit({ type: "step.start", stepId: STEP.classify, title: "分类文件" });
    type Planned = {
      src: string;
      category: Category;
      destDir: string;
      origName: string;
      finalShortName: string;
    };
    const planned: Planned[] = [];
    for (const f of files) {
      const origName = f.name;
      const ext = path.extname(origName);
      const cat = classifyExt(ext);
      const destDir = path.join(rootAbs, cat);
      const shortName = stripSpacesFileName(origName);
      const prefixed = `${PREFIX[cat]}${shortName}`;
      planned.push({
        src: path.join(rootAbs, origName),
        category: cat,
        destDir,
        origName,
        finalShortName: prefixed
      });
    }
    emit({ type: "step.complete", stepId: STEP.classify });

    emit({ type: "step.start", stepId: STEP.mkdir, title: "创建目录" });
    const dirs = new Set(planned.map((p) => p.destDir));
    for (const d of dirs) {
      await fs.mkdir(d, { recursive: true });
    }
    emit({ type: "step.complete", stepId: STEP.mkdir });

    emit({ type: "step.start", stepId: STEP.move, title: "移动文件" });
    const afterMove: string[] = [];
    const nMove = planned.length;
    for (let i = 0; i < planned.length; i++) {
      const p = planned[i];
      const uniqueOrig = await uniquePath(p.destDir, p.origName);
      await fs.rename(p.src, uniqueOrig);
      afterMove.push(uniqueOrig);
      if (nMove > 0) {
        emit({
          type: "step.progress",
          stepId: STEP.move,
          progress: (i + 1) / nMove
        });
      }
    }
    emit({ type: "step.complete", stepId: STEP.move });

    emit({ type: "step.start", stepId: STEP.rename, title: "重命名" });
    for (let i = 0; i < planned.length; i++) {
      const p = planned[i];
      const current = afterMove[i];
      const dir = path.dirname(current);
      const dest = await uniquePath(dir, p.finalShortName);
      if (current !== dest) {
        await fs.rename(current, dest);
      }
    }
    emit({ type: "step.complete", stepId: STEP.rename });

    const summary = `已整理 ${planned.length} 个文件至 Images / Docs / Sheets / Archives / Others。目录：${path.basename(rootAbs)}。`;
    emit({
      type: "execution.complete",
      summary
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    fail(STEP.move, message);
  }
}
