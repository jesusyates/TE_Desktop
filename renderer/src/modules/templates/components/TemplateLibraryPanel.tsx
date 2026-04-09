import { useEffect, useMemo, useState } from "react";
import type { Template, TemplateUpdatePatch, TemplateVariable } from "../types/template";
import { TEMPLATE_FILTER_UNCATEGORIZED } from "../hooks/useTemplateLibrary";
import { mergeExtractedVariables } from "../lib/templateVariables";
import { TemplateLibraryItem } from "./TemplateLibraryItem";
import { TemplateVariableEditor } from "./TemplateVariableEditor";
import "../template-library.css";

function cloneVariables(vs: TemplateVariable[] | undefined): TemplateVariable[] {
  return (vs ?? []).map((v) => ({
    ...v,
    options: v.options ? [...v.options] : undefined
  }));
}

type Props = {
  open: boolean;
  onClose: () => void;
  templates: Template[];
  getTemplate: (id: string) => Template | undefined;
  removeTemplate: (id: string) => void;
  updateTemplate: (id: string, patch: TemplateUpdatePatch) => void;
  filterTemplates: (category: string | null) => Template[];
  searchTemplates: (query: string) => Template[];
  onUseTemplateNewTask: (template: Template) => void;
};

function formatIso(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function summarizeSteps(steps: unknown[]): { headline: string; previews: string[] } {
  const previews: string[] = [];
  const max = Math.min(steps.length, 8);
  for (let i = 0; i < max; i++) {
    const s = steps[i];
    if (s && typeof s === "object") {
      const o = s as Record<string, unknown>;
      const title = typeof o.title === "string" ? o.title : null;
      const ord = o.order ?? o.stepOrder;
      const prefix = typeof ord === "number" && !Number.isNaN(ord) ? `${ord}. ` : `${i + 1}. `;
      previews.push(title ? `${prefix}${title}` : `${prefix}（无标题）`);
    }
  }
  return { headline: `步骤快照：共 ${steps.length} 条`, previews };
}

function tagsFromDraft(tagsStr: string): string[] {
  return tagsStr
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 模板库：筛选、列表、详情、编辑（D-4-3）；新建任务沿用 D-4-2 注入链路。
 */
export const TemplateLibraryPanel = ({
  open,
  onClose,
  templates,
  getTemplate,
  removeTemplate,
  updateTemplate,
  filterTemplates,
  searchTemplates,
  onUseTemplateNewTask
}: Props) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [nameQuery, setNameQuery] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState({ name: "", description: "", category: "", tagsStr: "" });
  const [variablesDraft, setVariablesDraft] = useState<TemplateVariable[]>([]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    templates.forEach((t) => {
      const c = t.category?.trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [templates]);

  const visibleTemplates = useMemo(() => {
    const byCat = filterTemplates(categoryFilter);
    const q = nameQuery.trim();
    if (!q) return byCat;
    const allowed = new Set(searchTemplates(q).map((t) => t.id));
    return byCat.filter((t) => allowed.has(t.id));
  }, [filterTemplates, searchTemplates, categoryFilter, nameQuery]);

  const selected = selectedId ? getTemplate(selectedId) : undefined;

  useEffect(() => {
    if (!selectedId) return;
    if (!getTemplate(selectedId)) setSelectedId(null);
  }, [selectedId, getTemplate, templates]);

  useEffect(() => {
    setIsEditing(false);
  }, [selectedId]);

  useEffect(() => {
    if (!selected || isEditing) return;
    setDraft({
      name: selected.name,
      description: selected.description,
      category: selected.category ?? "",
      tagsStr: (selected.tags ?? []).join(", ")
    });
  }, [selected, isEditing]);

  useEffect(() => {
    if (!selected) {
      setVariablesDraft([]);
      return;
    }
    if (isEditing) return;
    setVariablesDraft(cloneVariables(selected.variables));
  }, [selected, isEditing]);

  if (!open) return null;

  const stepInfo = selected ? summarizeSteps(selected.stepsSnapshot) : null;

  const onSaveEdit = () => {
    if (!selected) return;
    const normalizedVars = variablesDraft.map((v) => ({
      ...v,
      key: v.key.trim(),
      label: v.label.trim() || v.key.trim()
    }));
    if (normalizedVars.some((v) => !v.key)) {
      window.alert("每个变量的 key 不能为空（与 {{key}} 对应）。");
      return;
    }
    const seen = new Set<string>();
    for (const v of normalizedVars) {
      if (seen.has(v.key)) {
        window.alert(`变量 key「${v.key}」重复，请修改后再保存。`);
        return;
      }
      seen.add(v.key);
    }
    updateTemplate(selected.id, {
      name: draft.name,
      description: draft.description,
      category: draft.category.trim() || null,
      tags: tagsFromDraft(draft.tagsStr),
      variables: normalizedVars.length > 0 ? normalizedVars : null
    });
    setIsEditing(false);
  };

  const onCancelEdit = () => {
    if (!selected) return;
    setDraft({
      name: selected.name,
      description: selected.description,
      category: selected.category ?? "",
      tagsStr: (selected.tags ?? []).join(", ")
    });
    setVariablesDraft(cloneVariables(selected.variables));
    setIsEditing(false);
  };

  return (
    <>
      <button
        type="button"
        className="template-library-backdrop"
        aria-label="关闭模板库"
        onClick={onClose}
      />
      <aside className="template-library-drawer template-library-drawer--wide" aria-label="模板库">
        <header className="template-library-drawer__header">
          <span className="template-library-drawer__title">模板库</span>
          <button type="button" className="template-library-drawer__close" onClick={onClose}>
            关闭
          </button>
        </header>
        <div className="template-library-drawer__body template-library-drawer__body--split">
          <div className="template-library-column template-library-column--list">
            <div className="template-library-filters">
              <label className="template-library-filters__field">
                <span className="template-library-filters__label">分类</span>
                <select
                  className="template-library-filters__select"
                  value={categoryFilter ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCategoryFilter(v === "" ? null : v);
                  }}
                >
                  <option value="">全部分类</option>
                  <option value={TEMPLATE_FILTER_UNCATEGORIZED}>未分类</option>
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="template-library-filters__field">
                <span className="template-library-filters__label">搜索名称</span>
                <input
                  type="search"
                  className="template-library-filters__input"
                  value={nameQuery}
                  onChange={(e) => setNameQuery(e.target.value)}
                  placeholder="包含匹配…"
                  autoComplete="off"
                />
              </label>
            </div>

            {templates.length === 0 ? (
              <p className="template-library-empty">暂无模板。成功任务可「存为模板」沉淀可复用骨架。</p>
            ) : visibleTemplates.length === 0 ? (
              <p className="template-library-empty">当前筛选下无模板，请调整分类或搜索。</p>
            ) : (
              <ul className="template-library-list">
                {visibleTemplates.map((t) => (
                  <TemplateLibraryItem
                    key={t.id}
                    template={t}
                    selected={t.id === selectedId}
                    onSelect={() => setSelectedId(t.id)}
                    onUseForNewTask={onUseTemplateNewTask}
                    onRemove={() => {
                      removeTemplate(t.id);
                      if (selectedId === t.id) setSelectedId(null);
                    }}
                  />
                ))}
              </ul>
            )}
          </div>

          {selected ? (
            <section className="template-library-detail template-library-detail--scroll" aria-live="polite">
              <div className="template-library-detail__head">
                <h3 className="template-library-detail__title">模板详情</h3>
                {!isEditing ? (
                  <button
                    type="button"
                    className="template-library-detail__edit-btn"
                    onClick={() => setIsEditing(true)}
                  >
                    编辑
                  </button>
                ) : (
                  <div className="template-library-detail__edit-actions">
                    <button type="button" className="template-library-detail__btn-secondary" onClick={onCancelEdit}>
                      取消
                    </button>
                    <button type="button" className="template-library-detail__btn-primary" onClick={onSaveEdit}>
                      保存
                    </button>
                  </div>
                )}
              </div>

              {!isEditing ? (
                <>
                  <div className="template-library-detail__section">
                    <h4 className="template-library-detail__section-title">基本信息</h4>
                    <p className="template-library-detail__row">
                      <span className="text-muted">名称</span> {selected.name}
                    </p>
                    <p className="template-library-detail__row">
                      <span className="text-muted">描述</span> {selected.description || "—"}
                    </p>
                    <p className="template-library-detail__row">
                      <span className="text-muted">分类</span> {selected.category?.trim() || "—"}
                    </p>
                    <p className="template-library-detail__row">
                      <span className="text-muted">标签</span>{" "}
                      {selected.tags?.length ? selected.tags.join(" · ") : "—"}
                    </p>
                    <p className="template-library-detail__row">
                      <span className="text-muted">来源任务</span>{" "}
                      <span className="mono-block">{selected.sourceTaskId}</span>
                    </p>
                    <p className="template-library-detail__row">
                      <span className="text-muted">创建时间</span> {formatIso(selected.createdAt)}
                    </p>
                    <p className="template-library-detail__row">
                      <span className="text-muted">最近使用</span> {formatIso(selected.lastUsedAt)}
                    </p>
                  </div>

                  <div className="template-library-detail__section">
                    <h4 className="template-library-detail__section-title">变量（实例化 sourcePrompt）</h4>
                    {selected.variables?.length ? (
                      <ul className="template-library-detail__bullet">
                        {selected.variables.map((v) => (
                          <li key={v.id}>
                            <span className="mono-block">{`{{${v.key}}}`}</span> — {v.label}（{v.type}
                            {v.required ? " · 必填" : ""}）
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted text-sm">
                        未配置变量；使用模板时将直接注入整段 Prompt。可在编辑中添加或从 {"{{key}}"} 扫描占位符。
                      </p>
                    )}
                  </div>

                  <div className="template-library-detail__section">
                    <h4 className="template-library-detail__section-title">Prompt 预览（只读）</h4>
                    <pre className="template-library-detail__prompt mono-block">
                      {selected.sourcePrompt || "—"}
                    </pre>
                  </div>

                  <div className="template-library-detail__section">
                    <h4 className="template-library-detail__section-title">步骤快照摘要</h4>
                    {stepInfo ? (
                      <>
                        <p className="template-library-detail__row">{stepInfo.headline}</p>
                        {stepInfo.previews.length ? (
                          <ul className="template-library-detail__bullet">
                            {stepInfo.previews.map((line, i) => (
                              <li key={i}>{line}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-muted text-sm">无可解析步骤标题</p>
                        )}
                      </>
                    ) : null}
                  </div>

                  <div className="template-library-detail__section">
                    <h4 className="template-library-detail__section-title">结果摘要</h4>
                    <p className="template-library-detail__row">
                      <span className="text-muted">标题</span> {selected.resultSnapshot.title}
                    </p>
                    {selected.resultSnapshot.durationLabel ? (
                      <p className="template-library-detail__row">
                        <span className="text-muted">耗时</span> {selected.resultSnapshot.durationLabel}
                      </p>
                    ) : null}
                    <p className="template-library-detail__row">
                      <span className="text-muted">摘要 stepCount</span> {selected.resultSnapshot.stepCount}
                    </p>
                    {selected.resultSnapshot.bodyPreview ? (
                      <p className="template-library-detail__preview text-sm">
                        {selected.resultSnapshot.bodyPreview}
                      </p>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="template-library-detail__form">
                  <label className="template-library-detail__field">
                    <span className="template-library-detail__label">名称</span>
                    <input
                      className="template-library-detail__input"
                      value={draft.name}
                      onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    />
                  </label>
                  <label className="template-library-detail__field">
                    <span className="template-library-detail__label">描述</span>
                    <textarea
                      className="template-library-detail__textarea"
                      rows={3}
                      value={draft.description}
                      onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                    />
                  </label>
                  <label className="template-library-detail__field">
                    <span className="template-library-detail__label">分类</span>
                    <input
                      className="template-library-detail__input"
                      value={draft.category}
                      onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                      placeholder="单一分类，如：短视频 / 周报"
                    />
                  </label>
                  <label className="template-library-detail__field">
                    <span className="template-library-detail__label">标签</span>
                    <input
                      className="template-library-detail__input"
                      value={draft.tagsStr}
                      onChange={(e) => setDraft((d) => ({ ...d, tagsStr: e.target.value }))}
                      placeholder="逗号分隔，如：口播, 带货"
                    />
                  </label>
                  <div className="template-library-detail__section template-library-detail__section--nested">
                    <h4 className="template-library-detail__section-title">变量定义</h4>
                    <p className="template-library-detail__readonly-hint text-muted text-sm">
                      仅影响从模板生成的新 prompt；不修改来源任务与下方原始 `sourcePrompt` 文本。
                    </p>
                    <button
                      type="button"
                      className="template-library-detail__scan-btn"
                      onClick={() =>
                        setVariablesDraft((d) => mergeExtractedVariables(d, selected.sourcePrompt))
                      }
                    >
                      从 Prompt 扫描 {"{{变量}}"}
                    </button>
                    <TemplateVariableEditor variables={variablesDraft} onChange={setVariablesDraft} />
                  </div>
                  <p className="template-library-detail__readonly-hint text-muted text-sm">
                    来源任务与原始 prompt 为只读引用，编辑不会修改历史任务记录。
                  </p>
                </div>
              )}

              <div className="template-library-detail__actions">
                <button
                  type="button"
                  className="template-library-detail__cta"
                  onClick={() => onUseTemplateNewTask(selected)}
                >
                  用此模板新建任务
                </button>
              </div>
            </section>
          ) : (
            <div className="template-library-placeholder">
              <p className="text-muted text-sm">选择左侧模板查看详情与管理。</p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
