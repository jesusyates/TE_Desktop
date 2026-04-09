/**
 * 从 prompt 解析整理目标根目录（Desktop / Downloads）。
 * 「是否应整理」由 Task Analyzer（intent / candidateCapabilities）统一判断。
 */

export function resolveOrganizeTargetPath(prompt: string): "Desktop" | "Downloads" {
  const p = prompt.toLowerCase();
  if (/下载|downloads/i.test(p)) return "Downloads";
  if (/桌面|desktop/i.test(p)) return "Desktop";
  return "Downloads";
}
