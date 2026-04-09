import { useCallback, useMemo, useState } from "react";
import { saveTemplateFromTask as saveTemplateFromTaskCore } from "../../../services/templateService";
import { loadTemplatesFromStorage, persistTemplatesToStorage } from "../storage/localTemplateStore";
import type {
  SaveTemplateFromTaskInput,
  Template,
  TemplateUpdatePatch,
  TemplateVariable
} from "../types/template";

function sortByCreatedDesc(a: Template, b: Template): number {
  return b.createdAt.localeCompare(a.createdAt);
}

function applyPatch(t: Template, patch: TemplateUpdatePatch): Template {
  const next: Template = { ...t };
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (n) next.name = n;
  }
  if (patch.description !== undefined) next.description = patch.description.trim();
  if (patch.category !== undefined) {
    const c = patch.category?.trim();
    next.category = c || undefined;
  }
  if (patch.tags !== undefined) {
    next.tags = patch.tags.map((x) => String(x).trim()).filter(Boolean);
  }
  if (patch.lastUsedAt !== undefined) next.lastUsedAt = patch.lastUsedAt;
  if (patch.variables !== undefined) {
    if (patch.variables === null || patch.variables.length === 0) {
      delete next.variables;
    } else {
      next.variables = patch.variables.map(
        (v: TemplateVariable): TemplateVariable => ({
          ...v,
          options: v.options?.length ? [...v.options] : undefined
        })
      );
    }
  }
  return next;
}

/** 未分类筛选用 */
export const TEMPLATE_FILTER_UNCATEGORIZED = "__uncategorized__" as const;

/**
 * 模板库：内存 + localStorage；接口形态预留对接 API（save / list / delete / get / patch）。
 */
export function useTemplateLibrary() {
  const [templates, setTemplates] = useState<Template[]>(() => loadTemplatesFromStorage());

  const saveTemplateFromTask = useCallback(async (input: SaveTemplateFromTaskInput): Promise<string> => {
    const id = await saveTemplateFromTaskCore(input);
    setTemplates(loadTemplatesFromStorage());
    return id;
  }, []);

  const removeTemplate = useCallback((id: string) => {
    setTemplates((prev) => {
      const next = prev.filter((t) => t.id !== id);
      persistTemplatesToStorage(next);
      return next;
    });
  }, []);

  const getTemplate = useCallback(
    (id: string): Template | undefined => templates.find((t) => t.id === id),
    [templates]
  );

  const updateTemplate = useCallback((id: string, patch: TemplateUpdatePatch) => {
    setTemplates((prev) => {
      const next = prev.map((t) => (t.id === id ? applyPatch(t, patch) : t));
      persistTemplatesToStorage(next);
      return next;
    });
  }, []);

  const filterTemplates = useCallback(
    (category: string | null): Template[] => {
      if (category == null || category === "") return templates;
      if (category === TEMPLATE_FILTER_UNCATEGORIZED) {
        return templates.filter((t) => !t.category?.trim());
      }
      return templates.filter((t) => (t.category ?? "").trim() === category);
    },
    [templates]
  );

  const searchTemplates = useCallback(
    (query: string): Template[] => {
      const q = query.trim().toLowerCase();
      if (!q) return templates;
      return templates.filter((t) => t.name.toLowerCase().includes(q));
    },
    [templates]
  );

  return useMemo(
    () => ({
      templates,
      saveTemplateFromTask,
      removeTemplate,
      getTemplate,
      updateTemplate,
      filterTemplates,
      searchTemplates
    }),
    [
      templates,
      saveTemplateFromTask,
      removeTemplate,
      getTemplate,
      updateTemplate,
      filterTemplates,
      searchTemplates
    ]
  );
}
