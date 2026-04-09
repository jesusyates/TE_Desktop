/**
 * Capability / Command Library v1：内置能力项（点击仅填词，不自动执行）。
 * {{topic}} v1 置空，由用户在输入框内补全。
 */

export type CapabilityItemV1 = {
  id: string;
  title: string;
  description: string;
  /** 可含 {{topic}}，见 resolveCapabilityPromptForFill */
  promptTemplate: string;
};

export type CapabilityCategoryV1 = {
  id: string;
  title: string;
  items: CapabilityItemV1[];
};

const LIBRARY_ZH: CapabilityCategoryV1[] = [
  {
    id: "content",
    title: "内容创作",
    items: [
      {
        id: "write-article",
        title: "写一篇文章",
        description: "按主题生成结构化文章，可在输入框补全主题",
        promptTemplate: "写一篇关于{{topic}}的文章"
      },
      {
        id: "write-report",
        title: "生成一份报告",
        description: "生成分析报告类内容，可在输入框补全主题",
        promptTemplate: "生成一份关于{{topic}}的分析报告"
      }
    ]
  },
  {
    id: "local",
    title: "本地文件处理",
    items: [
      {
        id: "organize-folder",
        title: "整理文件夹",
        description: "整理目录中的文件（本地能力）",
        promptTemplate: "整理这个文件夹里的文件"
      },
      {
        id: "sort-by-ext",
        title: "按类型分类文件",
        description: "按扩展名归类文件（本地能力）",
        promptTemplate: "按扩展名把文件分类"
      }
    ]
  },
  {
    id: "common",
    title: "常用任务",
    items: [
      {
        id: "summarize",
        title: "总结内容",
        description: "压缩要点，适合粘贴或附资料后执行",
        promptTemplate: "总结以下内容"
      },
      {
        id: "polish",
        title: "优化文本",
        description: "改进措辞与可读性",
        promptTemplate: "优化这段文本的表达"
      }
    ]
  }
];

const LIBRARY_EN: CapabilityCategoryV1[] = [
  {
    id: "content",
    title: "Content",
    items: [
      {
        id: "write-article",
        title: "Write an article",
        description: "Structured article; add your topic in the box",
        promptTemplate: "Write an article about {{topic}}"
      },
      {
        id: "write-report",
        title: "Create a report",
        description: "Analytical report; add your topic in the box",
        promptTemplate: "Create an analytical report about {{topic}}"
      }
    ]
  },
  {
    id: "local",
    title: "Local files",
    items: [
      {
        id: "organize-folder",
        title: "Organize a folder",
        description: "Tidy files in a folder (local)",
        promptTemplate: "Organize the files in this folder"
      },
      {
        id: "sort-by-ext",
        title: "Sort files by type",
        description: "Group files by extension (local)",
        promptTemplate: "Sort files by extension"
      }
    ]
  },
  {
    id: "common",
    title: "Common",
    items: [
      {
        id: "summarize",
        title: "Summarize",
        description: "Summarize the following content",
        promptTemplate: "Summarize the following content"
      },
      {
        id: "polish",
        title: "Polish text",
        description: "Improve wording and clarity",
        promptTemplate: "Polish the wording of this text"
      }
    ]
  }
];

/** v1：去掉 {{topic}}，不插入占位词；合并多余空白 */
export function resolveCapabilityPromptForFill(template: string): string {
  return template
    .replace(/\{\{\s*topic\s*\}\}/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function getCapabilityLibraryV1(locale: string): CapabilityCategoryV1[] {
  const l = (locale || "").toLowerCase();
  if (l.startsWith("en")) return LIBRARY_EN;
  return LIBRARY_ZH;
}
