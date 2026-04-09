import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useUiStrings } from "../i18n/useUiStrings";
import { Button } from "../components/ui/Button";
import {
  deleteTemplateById,
  fetchTemplateById,
  normalizeTemplateCoreContent,
  readTemplateDetailTopFields,
  type TemplateCoreDetailRow
} from "../services/coreTemplateService";
import { bumpTemplateUseCount } from "../services/templateUseStatsStorage";
import { createAutomationFromTemplateDetail } from "../modules/automation/createAutomationFromSource";
import { buildAutomationConsoleUrl } from "../modules/automation/automationNavigation";
import { noteTemplateRecentOpened } from "../services/recentTemplatesStorage";
import "./template-detail-page.css";

function safeJsonPreview(v: unknown, empty: string): string {
  if (v === undefined) return empty;
  try {
    const s = JSON.stringify(v, null, 2);
    return s || empty;
  } catch {
    return empty;
  }
}

/** H-3：模板详情（可读、可删用户模板、与记忆区分说明） */
export const TemplateDetailPage = () => {
  const u = useUiStrings();
  const tp = u.templates;
  const au = u.automation;
  const navigate = useNavigate();
  const { templateId: rawId } = useParams<{ templateId: string }>();
  const templateId = rawId?.trim() ?? "";

  const [detail, setDetail] = useState<TemplateCoreDetailRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    if (!templateId) {
      setError("invalid id");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const d = await fetchTemplateById(templateId);
      setDetail(d);
    } catch (e) {
      setDetail(null);
      setError(e instanceof Error ? e.message : tp.loadError);
    } finally {
      setLoading(false);
    }
  }, [templateId, tp.loadError]);

  useEffect(() => {
    void load();
  }, [load]);

  const normalized = detail
    ? normalizeTemplateCoreContent(
        detail.content,
        typeof detail.workflowType === "string" ? detail.workflowType : undefined
      )
    : null;

  const isSystem = detail?.isSystem === true;
  const meta = detail ? readTemplateDetailTopFields(detail) : null;

  const runDelete = async () => {
    if (!templateId || isSystem) return;
    if (!window.confirm(tp.deleteTemplateConfirm)) return;
    setDeleteBusy(true);
    try {
      await deleteTemplateById(templateId);
      navigate("/templates", { replace: true });
    } catch (e) {
      window.alert(`${tp.deleteTemplateFail}: ${e instanceof Error ? e.message : ""}`);
    } finally {
      setDeleteBusy(false);
    }
  };

  const openInWorkbench = () => {
    if (!templateId) return;
    noteTemplateRecentOpened(templateId);
    bumpTemplateUseCount(templateId);
    navigate(`/workbench?templateId=${encodeURIComponent(templateId)}`);
  };

  const createAutomation = () => {
    if (!detail) return;
    const rec = createAutomationFromTemplateDetail(detail);
    navigate(buildAutomationConsoleUrl(rec.id), { state: { automationToastShowView: true } });
  };

  return (
    <div className="page-stack template-detail-page">
      <header className="page-header template-detail-page__header">
        <p className="mb-2">
          <Link to="/templates" className="template-detail-page__back">
            ← {tp.detailBackList}
          </Link>
        </p>
        <h1 className="page-title">{detail?.title ?? tp.detailPageTitle}</h1>
        {detail ? (
          <div className="template-detail-page__badges">
            <span className={`template-detail-page__badge${isSystem ? " template-detail-page__badge--sys" : ""}`}>
              {isSystem ? tp.badgeSystem : tp.badgeUser}
            </span>
          </div>
        ) : null}
      </header>

      <section className="template-detail-page__compare" aria-labelledby="template-detail-compare-heading">
        <h2 id="template-detail-compare-heading" className="template-detail-page__h2">
          {tp.memoryVsTemplateTitle}
        </h2>
        <p className="text-muted text-sm mb-0">{tp.memoryVsTemplateBody}</p>
        <p className="mt-2 mb-0">
          <Link to="/memory">{tp.detailLinkMemory}</Link>
        </p>
      </section>

      {loading ? (
        <p className="text-muted">{tp.loadingList}</p>
      ) : error ? (
        <p className="text-danger" role="alert">
          {error}
        </p>
      ) : detail && normalized ? (
        <>
          {meta ? (
            <section className="template-detail-page__section" aria-labelledby="tpl-meta-h">
              <h2 id="tpl-meta-h" className="template-detail-page__h2">
                {tp.detailMetaTitle}
              </h2>
              <dl className="template-detail-page__meta-dl">
                <div className="template-detail-page__meta-row">
                  <dt>{tp.detailMetaTemplateId}</dt>
                  <dd className="template-detail-page__meta-mono">{detail.templateId}</dd>
                </div>
                <div className="template-detail-page__meta-row">
                  <dt>{tp.detailMetaProduct}</dt>
                  <dd>{meta.product || "—"}</dd>
                </div>
                <div className="template-detail-page__meta-row">
                  <dt>{tp.detailMetaMarket}</dt>
                  <dd>{meta.market || "—"}</dd>
                </div>
                <div className="template-detail-page__meta-row">
                  <dt>{tp.detailMetaLocale}</dt>
                  <dd>{meta.locale || "—"}</dd>
                </div>
                <div className="template-detail-page__meta-row">
                  <dt>{tp.detailMetaWorkflow}</dt>
                  <dd>{meta.workflowType?.trim() ? meta.workflowType : "—"}</dd>
                </div>
                <div className="template-detail-page__meta-row">
                  <dt>{tp.detailMetaVersion}</dt>
                  <dd>{meta.version || "—"}</dd>
                </div>
                <div className="template-detail-page__meta-row">
                  <dt>{tp.detailMetaAudience}</dt>
                  <dd>{meta.audience || "—"}</dd>
                </div>
              </dl>
            </section>
          ) : null}

          <section className="template-detail-page__section" aria-labelledby="tpl-scenario-h">
            <h2 id="tpl-scenario-h" className="template-detail-page__h2">
              {tp.detailScenarioTitle}
            </h2>
            <p className="template-detail-page__scenario text-muted text-sm mb-2">
              {(detail.description || "").trim() || tp.detailScenarioEmpty}
            </p>
            {meta ? (
              <p className="text-muted text-sm mb-0">
                <strong className="template-detail-page__label">{tp.detailMetaAudience}:</strong> {meta.audience}
                {" · "}
                <strong className="template-detail-page__label">{tp.detailMetaWorkflow}:</strong>{" "}
                {meta.workflowType?.trim() || "—"}
              </p>
            ) : null}
          </section>

          <section className="template-detail-page__section">
            <h2 className="template-detail-page__h2">{tp.detailHowTitle}</h2>
            <p className="text-muted text-sm">{tp.detailHowBody}</p>
            <div className="template-detail-page__actions">
              <Button type="button" onClick={openInWorkbench}>
                {tp.btnUseInWorkbench}
              </Button>
              <Button type="button" variant="secondary" onClick={createAutomation}>
                {au.createFromTemplate}
              </Button>
              {!isSystem ? (
                <Button type="button" variant="secondary" disabled={deleteBusy} onClick={() => void runDelete()}>
                  {deleteBusy ? "…" : tp.btnDeleteTemplate}
                </Button>
              ) : null}
            </div>
          </section>

          <section className="template-detail-page__section">
            <h2 className="template-detail-page__h2">{tp.detailSourcePrompt}</h2>
            <pre className="template-detail-page__pre">{normalized.sourcePrompt || tp.detailEmptyBlock}</pre>
          </section>

          {normalized.variables?.length ? (
            <section className="template-detail-page__section" aria-labelledby="tpl-vars-h">
              <h2 id="tpl-vars-h" className="template-detail-page__h2">
                {tp.detailVariablesTitle}
              </h2>
              <ul className="template-detail-page__var-list text-sm text-muted mb-0">
                {normalized.variables.map((v) => (
                  <li key={v.id}>
                    <strong>{v.label}</strong>
                    {v.required ? ` (${tp.detailVariableRequired})` : ""} · {v.type}
                    {v.placeholder ? ` · ${v.placeholder}` : ""}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="template-detail-page__section">
            <h2 className="template-detail-page__h2">{tp.detailSteps}</h2>
            <pre className="template-detail-page__pre">
              {normalized.stepsSnapshot?.length
                ? safeJsonPreview(normalized.stepsSnapshot, tp.detailEmptyBlock)
                : tp.detailEmptyBlock}
            </pre>
          </section>

          <section className="template-detail-page__section" aria-labelledby="tpl-expect-h">
            <h2 id="tpl-expect-h" className="template-detail-page__h2">
              {tp.detailExpectedTitle}
            </h2>
            <p className="text-muted text-sm mb-2">{tp.detailExpectedLead}</p>
            {normalized.resultSnapshot !== undefined && normalized.resultSnapshot !== null ? (
              typeof normalized.resultSnapshot === "object" &&
              normalized.resultSnapshot !== null &&
              "title" in (normalized.resultSnapshot as object) ? (
                <div className="template-detail-page__expected">
                  <p className="template-detail-page__expected-title font-medium mb-1">
                    {String((normalized.resultSnapshot as { title?: unknown }).title ?? "") || tp.detailEmptyBlock}
                  </p>
                  <p className="text-muted text-sm mb-0 template-detail-page__expected-body">
                    {String(
                      (normalized.resultSnapshot as { bodyPreview?: unknown }).bodyPreview ?? ""
                    ).trim() || tp.detailExpectedNoBody}
                  </p>
                  {typeof (normalized.resultSnapshot as { stepCount?: unknown }).stepCount === "number" ? (
                    <p className="text-muted text-xs mt-2 mb-0">
                      {tp.detailExpectedStepHint(
                        (normalized.resultSnapshot as { stepCount: number }).stepCount
                      )}
                    </p>
                  ) : null}
                </div>
              ) : (
                <pre className="template-detail-page__pre">
                  {safeJsonPreview(normalized.resultSnapshot, tp.detailEmptyBlock)}
                </pre>
              )
                  ) : (
              <p className="text-muted text-sm mb-0">{tp.detailExpectedNoBody}</p>
            )}
            <details className="template-detail-page__raw mt-3">
              <summary className="template-detail-page__raw-summary text-sm text-muted cursor-pointer">
                {tp.detailTechnicalSnapshot}
              </summary>
              <pre className="template-detail-page__pre template-detail-page__pre--nested mt-2">
                {normalized.resultSnapshot !== undefined
                  ? safeJsonPreview(normalized.resultSnapshot, tp.detailEmptyBlock)
                  : tp.detailEmptyBlock}
              </pre>
            </details>
          </section>
        </>
      ) : null}
    </div>
  );
};
