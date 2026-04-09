/**
 * F-2A：受控内容内 capability（无网络 / 无系统 API / 无模型）。
 */
export type CapabilityStepCapabilityType = "text_transform" | "data_extract" | "format_convert";

export type CapabilityStepOperation =
  | "text_transform.remove_duplicates"
  | "data_extract.extract_urls"
  | "format_convert.lines_to_numbered_list";

/** 与分析器 / 计划构建共用的 capability 描述 */
export type ContentCapabilitySpec = {
  capabilityType: CapabilityStepCapabilityType;
  operation: CapabilityStepOperation;
};
