import type { AppPreferencesV1 } from "../preferences/appPreferences";

/** 与 i18n `workbench.dataPosture` 平行；仅作行文案装配，不含业务分支字符串 */
export type ExecutionDataPostureCopy = {
  title: string;
  planeLocal: string;
  planeCloud: string;
  cloudAuto: string;
  cloudGated: string;
  histWill: string;
  histSkip: string;
  histNoAuth: string;
  memWill: string;
  memSkip: string;
  attachMeta: string;
  attachOmit: string;
};

/**
 * 人读摘要：执行位置、云端授权策略偏好、历史/记忆写入门控、附件元数据是否进入 Core 请求。
 * 与 Controller / 设置 / Memory hints 同一语义场，供工作台执行区与结果区复用。
 */
export function buildExecutionDataPostureRows(
  args: {
    resolvedMode: string;
    loggedIn: boolean;
    prefs: Pick<AppPreferencesV1, "trust" | "dataSafety">;
  },
  copy: ExecutionDataPostureCopy
): string[] {
  const rows: string[] = [];
  const local = args.resolvedMode === "computer";
  rows.push(local ? copy.planeLocal : copy.planeCloud);
  if (!local) {
    rows.push(args.prefs.trust.allowAutoCloudAi ? copy.cloudAuto : copy.cloudGated);
  }
  if (!args.loggedIn) {
    rows.push(copy.histNoAuth);
  } else {
    rows.push(args.prefs.dataSafety.allowServerHistoryWrite ? copy.histWill : copy.histSkip);
  }
  rows.push(args.prefs.dataSafety.allowTaskMemoryWrite ? copy.memWill : copy.memSkip);
  rows.push(
    args.prefs.dataSafety.sendAttachmentMetadataToCore ? copy.attachMeta : copy.attachOmit
  );
  return rows;
}

export function formatClientDataSafetyTrace(prefs: AppPreferencesV1["dataSafety"]): string {
  return `hist=${prefs.allowServerHistoryWrite};mem=${prefs.allowTaskMemoryWrite};attachMeta=${prefs.sendAttachmentMetadataToCore}`;
}
