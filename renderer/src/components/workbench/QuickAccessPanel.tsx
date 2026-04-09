import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { useUiStrings } from "../../i18n/useUiStrings";
import { fetchHistoryListPage } from "../../services/history.api";
import type { Template } from "../../modules/templates/types/template";
import {
  getCapabilityLibraryV1,
  resolveCapabilityPromptForFill
} from "../../modules/workbench/capabilityLibrary";
import "./quick-access-panel.css";

const RECENT_LIMIT = 5;

type Props = {
  templates: Template[];
  onFillPrompt: (text: string) => void;
  /** E-3：跳转工作台并带 ?templateId=，与模板页「在工作台使用」一致 */
  onOpenTemplateInWorkbench?: (templateId: string) => void;
};

/**
 * 首页右侧快捷入口：模板 / 指令库 / 最近任务（不完整历史、无错误日志堆叠）。
 */
export const QuickAccessPanel = ({ templates, onFillPrompt, onOpenTemplateInWorkbench }: Props) => {
  const u = useUiStrings();
  const q = u.quickAccess;
  const locale = useAuthStore((s) => s.locale);
  const navigate = useNavigate();
  const [recentRows, setRecentRows] = useState<{ id: string; line: string; prompt: string }[]>([]);
  const capabilityLibrary = useMemo(() => getCapabilityLibraryV1(locale), [locale]);

  useEffect(() => {
    void fetchHistoryListPage(1, RECENT_LIMIT)
      .then((d) => {
        setRecentRows(
          d.items.map((row) => {
            const pv = (row.preview || "").trim();
            const pr = (row.prompt || "").trim();
            const raw = pv || pr || u.common.dash;
            return {
              id: row.historyId,
              prompt: pr,
              line: raw.length > 64 ? `${raw.slice(0, 64)}…` : raw
            };
          })
        );
      })
      .catch(() => setRecentRows([]));
  }, [u.common.dash]);

  const prompts = q.promptLibrary;

  const openRecent = (fullPrompt: string, historyId: string) => {
    const p = fullPrompt.trim();
    const rid = historyId.trim();
    if (!p || !rid) return;
    navigate(`/workbench?q=${encodeURIComponent(p)}&runId=${encodeURIComponent(rid)}`);
  };

  return (
    <div className="quick-access-panel" role="complementary" aria-label={q.panelAria}>
      <h2 className="quick-access-panel__title">{q.panelTitle}</h2>

      <section className="quick-access-panel__section" aria-labelledby="qa-capability">
        <h3 id="qa-capability" className="quick-access-panel__h">
          {q.sectionCapabilityLibrary}
        </h3>
        <div className="quick-access-panel__capability">
          {capabilityLibrary.map((cat) => (
            <div key={cat.id} className="quick-access-panel__capability-cat">
              <div className="quick-access-panel__capability-cat-title">{cat.title}</div>
              <ul className="quick-access-panel__capability-list">
                {cat.items.map((item) => (
                  <li key={item.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      className="quick-access-panel__capability-item"
                      title={resolveCapabilityPromptForFill(item.promptTemplate)}
                      onClick={() =>
                        onFillPrompt(resolveCapabilityPromptForFill(item.promptTemplate))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onFillPrompt(resolveCapabilityPromptForFill(item.promptTemplate));
                        }
                      }}
                    >
                      <div className="quick-access-panel__capability-item-title">{item.title}</div>
                      <div className="quick-access-panel__capability-item-desc text-muted">
                        {item.description}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="quick-access-panel__section" aria-labelledby="qa-templates">
        <h3 id="qa-templates" className="quick-access-panel__h">
          {q.sectionTemplates}
        </h3>
        {templates.length === 0 ? (
          <p className="quick-access-panel__empty text-muted text-sm">{q.emptyTemplates}</p>
        ) : (
          <ul className="quick-access-panel__list">
            {templates.map((t) => (
              <li key={t.id} className="quick-access-panel__tpl-item">
                <div className="quick-access-panel__tpl-name">{t.name.trim() || t.id}</div>
                <div className="quick-access-panel__tpl-actions">
                  {onOpenTemplateInWorkbench ? (
                    <button
                      type="button"
                      className="quick-access-panel__btn quick-access-panel__btn--sm"
                      title={q.useTemplateFormal}
                      onClick={() => onOpenTemplateInWorkbench(t.id)}
                    >
                      {q.useTemplateFormal}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="quick-access-panel__btn quick-access-panel__btn--sm quick-access-panel__btn--ghost"
                    title={(t.sourcePrompt || "").trim()}
                    onClick={() => onFillPrompt((t.sourcePrompt || "").trim())}
                  >
                    {q.fillPromptOnly}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="quick-access-panel__template-links">
          <Link to="/templates?tab=library" className="quick-access-panel__link text-sm">
            {q.openSystemTemplates}
          </Link>
          <span className="quick-access-panel__link-sep text-muted" aria-hidden>
            ·
          </span>
          <Link to="/templates?tab=mine" className="quick-access-panel__link text-sm">
            {q.openMyTemplates}
          </Link>
          <span className="quick-access-panel__link-sep text-muted" aria-hidden>
            ·
          </span>
          <Link to="/templates?tab=recent" className="quick-access-panel__link text-sm">
            {q.openRecentTemplates}
          </Link>
        </div>
        <Link to="/templates" className="quick-access-panel__link text-sm">
          {q.openTemplates}
        </Link>
      </section>

      <section className="quick-access-panel__section" aria-labelledby="qa-prompts">
        <h3 id="qa-prompts" className="quick-access-panel__h">
          {q.sectionPrompts}
        </h3>
        <ul className="quick-access-panel__chips">
          {prompts.map((ex) => (
            <li key={ex.chip}>
              <button
                type="button"
                className="quick-access-panel__chip"
                title={ex.prompt}
                onClick={() => onFillPrompt(ex.prompt)}
              >
                {ex.chip}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="quick-access-panel__section" aria-labelledby="qa-recent">
        <h3 id="qa-recent" className="quick-access-panel__h">
          {q.sectionRecent}
        </h3>
        <p className="quick-access-panel__note text-muted text-xs">{q.recentNote}</p>
        {recentRows.length === 0 ? (
          <p className="quick-access-panel__empty text-muted text-sm">{q.emptyRecent}</p>
        ) : (
          <ul className="quick-access-panel__list">
            {recentRows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="quick-access-panel__btn quick-access-panel__btn--multiline"
                  onClick={() => openRecent(row.prompt || row.line, row.id)}
                >
                  {row.line}
                </button>
              </li>
            ))}
          </ul>
        )}
        <Link to="/history" className="quick-access-panel__link text-sm">
          {q.linkFullHistory}
        </Link>
      </section>
    </div>
  );
};
