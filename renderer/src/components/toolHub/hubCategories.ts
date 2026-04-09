export type HubCategoryId = "copy" | "video" | "sheet" | "image" | "auto" | "my_tools";

/** 分类 → 能力 id（与 runtime 注册表 id 一致） */
export const HUB_CATEGORY_CAPS: Record<Exclude<HubCategoryId, "my_tools">, string[]> = {
  copy: ["document_editing", "presentation"],
  video: ["video_editing"],
  sheet: ["spreadsheet"],
  image: ["image_editing"],
  auto: ["file_conversion", "screen_capture", "archive_management"]
};

/** 推荐区展示顺序（能力 id） */
export const HUB_RECOMMENDED_ORDER = ["document_editing", "spreadsheet", "video_editing", "presentation"];
