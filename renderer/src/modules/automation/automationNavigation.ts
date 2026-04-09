/** 创建成功后跳转控制台：选中 + 可选 toast */
export function buildAutomationConsoleUrl(id: string, options?: { toast?: boolean }): string {
  const q = new URLSearchParams();
  q.set("focus", id);
  if (options?.toast !== false) q.set("toast", "created");
  return `/automation?${q.toString()}`;
}
