export type ScannedTool = {
  tool_id: string;
  display_name: string;
  capabilities: string[];
  status: "available" | "unknown";
  match: { process_name?: string; install_path?: string };
  source: "system_scan";
};

export type SoftwareScanSnapshot = {
  tools: ScannedTool[];
  scannedAt: string | null;
  platform: string;
};

export type CapabilityCatalogEntry = {
  id: string;
  label: string;
  /** 用于「任务意图」搜索的关键字（与注册表 infer 用词一致，不向用户展示为技术字段） */
  keywords: string[];
  /** 是否可能匹配本机已安装的专用程序（无则为纯内置能力） */
  expectLocalApp: boolean;
};

export type CapabilityResolution = {
  capability: string;
  chosen: ScannedTool | null;
  candidatesTried: string[];
  satisfied: boolean;
};

export type AicsDesktopApi = {
  getSoftwareScan: () => Promise<SoftwareScanSnapshot>;
  rescanSoftware: () => Promise<SoftwareScanSnapshot>;
  getCapabilityCatalog: (locale: string) => Promise<CapabilityCatalogEntry[]>;
  inferCapabilities: (oneLine: string, stepTitles: string[]) => Promise<string[]>;
  resolveCapabilities: (tools: ScannedTool[], required: string[]) => Promise<CapabilityResolution[]>;
  setUiChromeTheme?: (theme: "dark" | "light") => Promise<void>;
  /** 同步主进程原生 UI 文案（如右键菜单） */
  setUiLocale?: (locale: string) => Promise<void>;
  /** D-5-3B：须与 onFileOrganizeEvent 同时使用 */
  runFileOrganize?: (input: {
    targetPath: string;
    strategy: string;
  }) => Promise<{ ok: boolean }>;
  onFileOrganizeEvent?: (handler: (event: unknown) => void) => () => void;
  /** D-7-4X：保存文本文件（Electron 下为系统对话框） */
  saveTextFile?: (input: {
    defaultPath?: string;
    content: string;
  }) => Promise<{ ok: true; filePath: string } | { ok: false; canceled: boolean }>;
};
