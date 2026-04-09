/**
 * F-2B：内容内 capability 识别的唯一规则源（禁止在其它模块散落重复规则）。
 * 偏保守：长文创作类任务除非头部明示能力意图，否则不误识别为 capability。
 */
import type { TaskAnalysisResult } from "../analyzer/taskAnalyzerTypes";
import type { ContentCapabilitySpec } from "./capabilityStepTypes";

const HEAD_LEN = 160;

/** 长提示 + 强创作信号 → 容易误判，需头部命中能力意图才放行 */
const CREATIVE_LONG_THRESHOLD = 220;
const CREATIVE_HEAVY =
  /(帮我|请|请帮我)?(写|创作|生成|扩写|润色|起草|撰写)|短视频|剧本|故事|小说|推文|公众号|营销文案|产品介绍|宣传稿|口播|脚本大纲/i;

function likelyCreativeLongFormTask(prompt: string): boolean {
  return prompt.length >= CREATIVE_LONG_THRESHOLD && CREATIVE_HEAVY.test(prompt);
}

function headWindow(prompt: string): string {
  return prompt.slice(0, HEAD_LEN);
}

/** 去重：强动词 +（文本范围/短指令） */
const DEDUPE_VERB = /去重|去除重复|删重|重复行|dedupe|remove\s+duplicates?/i;
const DEDUPE_SCOPE =
  /文本|行|段落|列表|内容|下面|以下|这段|这些行|粘贴|按行|^.{0,48}(去重|删重|去除重复)/i;

function matchDedupe(prompt: string): boolean {
  if (!DEDUPE_VERB.test(prompt)) return false;
  if (likelyCreativeLongFormTask(prompt) && !DEDUPE_VERB.test(headWindow(prompt))) return false;
  if (prompt.length <= 120) return true;
  return DEDUPE_SCOPE.test(prompt);
}

/** 链接提取：需明确「提取/列出/找出」类动作 + 链接语义 */
const URL_ACTION =
  /提取\s*链|提取\s*url|链\s*接\s*提取|网址\s*列表|找出\s*链|列出\s*链|parse\s+urls?|extract\s+urls?/i;
const URL_MENTION = /链\s*接|url|网址|http/i;

function matchExtractUrls(prompt: string): boolean {
  if (!URL_ACTION.test(prompt) || !URL_MENTION.test(prompt)) return false;
  if (likelyCreativeLongFormTask(prompt) && !URL_ACTION.test(headWindow(prompt))) return false;
  return true;
}

/** 多行转编号 */
const NUMBERED_ACTION =
  /编号\s*列表|转成\s*编号|改为\s*编号|numbered\s*list|多行.*编号|行首\s*编号|每行前.*加.*号|编\s*号\s*排版/i;

function matchNumberedList(prompt: string): boolean {
  if (!NUMBERED_ACTION.test(prompt)) return false;
  if (likelyCreativeLongFormTask(prompt) && !NUMBERED_ACTION.test(headWindow(prompt))) return false;
  return true;
}

/**
 * 识别是否应走 content_capability 链；未命中返回 null。
 */
export function recognizeContentCapability(prompt: string): ContentCapabilitySpec | null {
  const p = prompt.trim();
  if (!p) return null;
  if (matchDedupe(p)) {
    return { capabilityType: "text_transform", operation: "text_transform.remove_duplicates" };
  }
  if (matchExtractUrls(p)) {
    return { capabilityType: "data_extract", operation: "data_extract.extract_urls" };
  }
  if (matchNumberedList(p)) {
    return { capabilityType: "format_convert", operation: "format_convert.lines_to_numbered_list" };
  }
  return null;
}

/** capabilityType 中文（与计划/UI 一致） */
export function contentCapabilityTypeLabel(spec: ContentCapabilitySpec): string {
  switch (spec.capabilityType) {
    case "text_transform":
      return "文本变换（text_transform）";
    case "data_extract":
      return "数据提取（data_extract）";
    case "format_convert":
      return "格式转换（format_convert）";
    default:
      return spec.capabilityType;
  }
}

/** operation 中文说明（与计划/UI 一致） */
export function contentCapabilityOperationLabel(spec: ContentCapabilitySpec): string {
  switch (spec.operation) {
    case "text_transform.remove_duplicates":
      return "按行去重整理（text_transform.remove_duplicates）";
    case "data_extract.extract_urls":
      return "提取 URL 列表（data_extract.extract_urls）";
    case "format_convert.lines_to_numbered_list":
      return "多行转编号列表（format_convert.lines_to_numbered_list）";
    default:
      return spec.operation;
  }
}

/** 能力链任务一句话定位（横幅/说明） */
export function contentCapabilityTaskHeadline(spec: ContentCapabilitySpec): string {
  switch (spec.operation) {
    case "text_transform.remove_duplicates":
      return "去重整理文本";
    case "data_extract.extract_urls":
      return "从文本中提取链接";
    case "format_convert.lines_to_numbered_list":
      return "将多行文本整理为编号列表";
    default:
      return "本地能力执行";
  }
}

/** 与 ExecutionPlan 第一步一致的标题与描述（单一事实源） */
export function getContentCapabilityPlanStepCopy(spec: ContentCapabilitySpec): { title: string; description: string } {
  switch (spec.operation) {
    case "text_transform.remove_duplicates":
      return {
        title: "文本去重整理",
        description:
          "按行去重：保留首次出现的非空行，空行原样保留。输出为纯文本，便于继续编辑或粘贴。"
      };
    case "data_extract.extract_urls":
      return {
        title: "从文本提取链接",
        description:
          "在原文中匹配 http(s) 与 www 形式链接，去重后逐条编号列出。不访问网络，不解析页面。"
      };
    case "format_convert.lines_to_numbered_list":
      return {
        title: "多行转为编号列表",
        description: "跳过空行，对其余各行按顺序加「1. 2. …」前缀，便于清单与排版。"
      };
    default:
      return { title: "本地能力步骤", description: "受控内容内处理（F-2）。" };
  }
}

export function getContentCapabilitySummarizeStepCopy(): { title: string; description: string } {
  return {
    title: "能力结果摘要",
    description:
      "对上一能力步的产出做简短摘要与压缩整理，便于整体浏览；不重新扩写正文、不当作新创作任务。"
  };
}

export function getContentCapabilityBannerCopy(spec: ContentCapabilitySpec): {
  badge: string;
  headline: string;
  detail: string;
  typeLine: string;
  operationLine: string;
} {
  return {
    badge: "能力执行模式",
    headline: contentCapabilityTaskHeadline(spec),
    detail: "当前任务将使用本地文本能力处理（不调模型、不联网、不操作系统）。",
    typeLine: contentCapabilityTypeLabel(spec),
    operationLine: contentCapabilityOperationLabel(spec)
  };
}

/** 纠错：去掉 capability 意图，按普通内容流水线重新分析等价结果（供会话重新 arm） */
export function stripContentCapabilityForNormalContent(analysis: TaskAnalysisResult): TaskAnalysisResult {
  const meta = analysis.metadata;
  let newMeta: TaskAnalysisResult["metadata"] = undefined;
  if (meta) {
    const { contentCapability: _removed, ...rest } = meta;
    void _removed;
    newMeta = Object.keys(rest).length ? rest : undefined;
  }
  return {
    ...analysis,
    intent: analysis.intent === "content_capability" ? "unknown" : analysis.intent,
    metadata: newMeta
  };
}
