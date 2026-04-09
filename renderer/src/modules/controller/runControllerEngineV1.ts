import type { TaskMode } from "../../types/taskMode";
import type {
  ComplexityTier,
  ControllerAgentId,
  ControllerPlanV1,
  ControllerStepV1,
  ControllerTemplateFormalMetaV1,
  ControllerTemplateProvenanceV1,
  ExecutionStrategy,
  TaskClassification,
  ControllerRiskLevel
} from "./controllerTypes";

const LOCAL_HINT =
  /路径|文件夹|桌面|本机|本地|解压|整理文件|重命名|批量|扫描|磁盘|截图|录屏/i;
const RESEARCH_HINT = /调研|查阅|来源|引用|数据|报告|对比|综述|文献|查证|seo|关键词排名|竞品/i;
const AUTO_HINT = /自动化|编排|定时|流水线|控制台|scheduler|cron/i;

function classifyTask(prompt: string, attachmentsCount: number, requestedMode: TaskMode): TaskClassification {
  const p = prompt.trim();
  if (AUTO_HINT.test(p)) return "automation_reserved";
  if (requestedMode === "computer" || LOCAL_HINT.test(p)) return "local";
  if (attachmentsCount > 0 && RESEARCH_HINT.test(p)) return "mixed";
  if (attachmentsCount > 0) return "mixed";
  if (RESEARCH_HINT.test(p)) return "research";
  return "content";
}

function estimateComplexity(prompt: string, attachmentsCount: number, classification: TaskClassification): ComplexityTier {
  const len = prompt.trim().length;
  if (classification === "research" && len > 400) return "complex";
  if (attachmentsCount >= 3 || len > 1200) return "complex";
  if (len < 140 && attachmentsCount === 0 && classification === "content") return "simple";
  if (len < 520 && attachmentsCount <= 1) return "medium";
  return "complex";
}

function evaluateRisk(
  prompt: string,
  classification: TaskClassification,
  complexity: ComplexityTier,
  willUseCloud: boolean
): { riskLevel: ControllerRiskLevel; requiresUserConfirmation: boolean; riskRationale: string[] } {
  const r: string[] = [];
  let riskLevel: ControllerRiskLevel = "L0";

  const sensitive = /密码|护照|银行卡|转账|投资喊单|博彩|违法|木马|绕过风控/i.test(prompt);
  if (sensitive) {
    r.push("命中高敏/合规关键词，升格风险");
    return { riskLevel: "L4", requiresUserConfirmation: true, riskRationale: r };
  }

  if (classification === "local" || classification === "automation_reserved") {
    r.push("涉及本机或自动化预留能力");
    riskLevel = "L2";
  }
  if (classification === "mixed") {
    r.push("混合资料与生成");
    riskLevel = "L2";
  }
  if (willUseCloud) {
    r.push("计划走云端模型/编排");
    riskLevel = riskLevel === "L0" ? "L2" : riskLevel;
  }
  if (complexity === "complex") {
    r.push("任务复杂度为高，建议可解释分步与审阅");
    riskLevel = riskLevel < "L3" ? "L3" : riskLevel;
  }
  if (classification === "research" && complexity !== "simple") {
    r.push("研究/素材类任务，注意出处与事实核验");
    riskLevel = riskLevel < "L2" ? "L2" : riskLevel;
  }

  const requiresUserConfirmation = riskLevel >= "L3" || (riskLevel === "L2" && complexity === "complex");
  if (requiresUserConfirmation && !r.includes("需要显式确认")) r.push("Controller 建议显式确认后继续");
  return { riskLevel, requiresUserConfirmation, riskRationale: r.length ? r : ["基线风险：常规内容生成"] };
}

function selectStrategy(
  complexity: ComplexityTier,
  classification: TaskClassification,
  opts: {
    sessionMarket: string;
    sessionLocale: string;
    templateWorkflowType: string;
  }
): { strategy: ExecutionStrategy; graphReserved: boolean } {
  const wf = opts.templateWorkflowType.toLowerCase();
  /** 模板 workflowType：研究/混合类抬高分类与复杂度；多步内容包倾向流水线 */
  const templateSuggestsResearch =
    /research|调研|综述|报告|混合|mixed/.test(wf) || wf.includes("deep");
  const templateSuggestsPipeline =
    templateSuggestsResearch || /content_pack|pipeline|multistep|pack/i.test(wf);

  let effComplexity: ComplexityTier = complexity;
  let effClassification: TaskClassification = classification;
  if (templateSuggestsResearch && (classification === "content" || classification === "research")) {
    effClassification = /mixed|混合/i.test(wf) ? "mixed" : classification === "content" ? "research" : classification;
    if (complexity === "simple") effComplexity = "medium";
  }
  if (templateSuggestsPipeline && effComplexity === "simple" && effClassification !== "local") {
    effComplexity = "medium";
  }

  if (effComplexity === "complex" && (effClassification === "research" || effClassification === "mixed")) {
    return { strategy: "multi_agent_graph", graphReserved: true };
  }
  if (effComplexity === "simple" && effClassification === "content") {
    return { strategy: "direct", graphReserved: false };
  }
  return { strategy: "pipeline", graphReserved: false };
}

function bumpComplexityForSessionRegional(
  complexity: ComplexityTier,
  market: string | undefined,
  locale: string | undefined
): ComplexityTier {
  const loc = (locale ?? "").toLowerCase();
  const mar = (market ?? "").toLowerCase();
  const nonDefaultLocale = Boolean(loc) && !["zh-cn", "zh", "und", "global", "en"].includes(loc);
  const nonDefaultMarket = Boolean(mar) && mar !== "cn" && mar !== "global";
  if (!nonDefaultLocale && !nonDefaultMarket) return complexity;
  if (complexity === "simple") return "medium";
  if (complexity === "medium") return "complex";
  return complexity;
}

function step(
  id: string,
  agent: ControllerAgentId,
  purpose: string,
  inputSource: string
): ControllerStepV1 {
  return { id, agent, purpose, status: "pending", inputSource };
}

function buildSteps(strategy: ExecutionStrategy, classification: TaskClassification): ControllerStepV1[] {
  const safety = step("c_safety", "safety", "策略与输入校验闸（对齐统一安全链，非绕过硬闸）", "user_prompt+draft_meta");
  if (strategy === "direct") {
    return [
      safety,
      step("c_writer", "writer", "生成正文与结构化输出（经 Core / AI Router）", "task_payload+template_optional")
    ];
  }
  const libPurpose =
    classification === "research" || classification === "mixed"
      ? "聚合历史资产/模板引用位，标注可复用段落与缺口"
      : "扫描任务资产与历史摘要，标注可能重复主题";
  const pipe: ControllerStepV1[] = [
    safety,
    step("c_lib", "librarian", libPurpose, "history_api+template_ref"),
    step("c_strat", "strategist", "确定叙事角度、读者与差异化（相对库内近邻）", "librarian_brief+classification"),
    step("c_plan", "planner", "生成可执行步骤计划并与 Core analyze/plan 对齐", "strategist_brief+policy caps"),
    step("c_write", "writer", "按批准计划产出正文/结果包", "approved_plan+memory_hints"),
    step("c_crit", "critic", "一致性、重复度与事实风险快检（启发式+路由）", "writer_draft+history_digest")
  ];
  return pipe;
}

export type RunControllerEngineInput = {
  prompt: string;
  attachmentsCount: number;
  requestedMode: TaskMode;
  /** 是否预期走云端模型链路（由模式与分类推断，实际仍以 Trust/Safety 为准） */
  intendsCloudAi: boolean;
  /** 与 X-Client-Market 对齐的会话市场（策略与 decisionTrace） */
  sessionMarket?: string;
  /** 与 X-Client-Locale 对齐 */
  sessionLocale?: string;
  /** 本轮若自模板启动则写入计划溯源并参与策略 */
  templateProvenance?: ControllerTemplateProvenanceV1;
};

/**
 * 入口：任意任务先过 Controller；**不**替代 TrustGate / SafetyCheck / session.start。
 */
export function runControllerEngineV1(input: RunControllerEngineInput): ControllerPlanV1 {
  let classification = classifyTask(input.prompt, input.attachmentsCount, input.requestedMode);
  const wfHint = input.templateProvenance?.formalMeta.workflowType?.trim().toLowerCase() ?? "";
  if (wfHint) {
    if (/(computer|automation|本地|local)/i.test(wfHint) || input.requestedMode === "computer") {
      classification = "local";
    } else if (
      /research|调研|综述|报告|mixed|混合/i.test(wfHint) &&
      (classification === "content" || classification === "research")
    ) {
      classification = /mixed|混合/i.test(wfHint) ? "mixed" : "research";
    }
  }

  let complexity = estimateComplexity(input.prompt, input.attachmentsCount, classification);
  const sessionMarket = input.sessionMarket?.trim() || "global";
  const sessionLocale = input.sessionLocale?.trim() || "und";
  complexity = bumpComplexityForSessionRegional(complexity, sessionMarket, sessionLocale);

  const { riskLevel, requiresUserConfirmation, riskRationale } = evaluateRisk(
    input.prompt,
    classification,
    complexity,
    input.intendsCloudAi
  );
  const { strategy: rawStrategy, graphReserved } = selectStrategy(complexity, classification, {
    sessionMarket,
    sessionLocale,
    templateWorkflowType: wfHint
  });
  /** 图编排保留时，本轮仍落地为 pipeline 步骤以便 Timeline 可渲染；graphReserved 标记预留 */
  const strategy: ExecutionStrategy = graphReserved ? "multi_agent_graph" : rawStrategy;
  const steps = buildSteps(graphReserved ? "pipeline" : strategy, classification);

  const tp = input.templateProvenance;
  const templateLine = tp
    ? `模板：${tp.displayName}（${tp.templateId}）；workflowType=${tp.formalMeta.workflowType ?? "—"}；market=${tp.formalMeta.market ?? "—"}；locale=${tp.formalMeta.locale ?? "—"}。`
    : "";

  const explanation = [
    templateLine,
    `分类：${classification}；复杂度：${complexity}；策略：${strategy}${graphReserved ? "（图结构预留，执行仍为受控流水线）" : ""}。`,
    `风险：${riskLevel}${requiresUserConfirmation ? " — 建议显式确认。" : ""}`,
    `会话上下文：market=${sessionMarket}；locale=${sessionLocale}。`
  ]
    .filter(Boolean)
    .join(" ");

  const formal = tp?.formalMeta ?? {};
  const formalSummary = [
    formal.product ? `product=${formal.product}` : "",
    formal.market ? `market=${formal.market}` : "",
    formal.locale ? `locale=${formal.locale}` : "",
    formal.workflowType ? `workflow=${formal.workflowType}` : "",
    formal.version ? `ver=${formal.version}` : "",
    formal.audience ? `audience=${formal.audience}` : ""
  ]
    .filter(Boolean)
    .join("; ");

  const decisionTrace: Record<string, string> = {
    classification_reason: `${classification}; mode=${input.requestedMode}; attach=${input.attachmentsCount}${wfHint ? `; tpl_wf=${wfHint}` : ""}`,
    complexity_rule: `${complexity}; len=${input.prompt.trim().length}; regional_bump=session`,
    session_context: `market=${sessionMarket}; locale=${sessionLocale}`,
    strategy_rule: `${strategy}; graphReserved=${graphReserved}; wfHint=${wfHint || "none"}`,
    graph_binding: graphReserved ? "reserved_executes_as_linear_pipeline" : "none",
    risk_level: riskLevel,
    ...(tp
      ? {
          template_source: `${tp.templateId}`,
          template_title: tp.displayName,
          template_formal: formalSummary || "(empty)"
        }
      : {})
  };

  const plan: ControllerPlanV1 = {
    version: 1,
    classification,
    complexity,
    riskLevel,
    requiresUserConfirmation,
    riskRationale,
    strategy,
    graphReserved,
    graphBinding: graphReserved ? "reserved_executes_as_linear_pipeline" : "none",
    steps,
    explanation,
    decisionTrace
  };
  if (tp) {
    plan.templateProvenance = {
      source: "template",
      templateId: tp.templateId,
      displayName: tp.displayName,
      formalMeta: sanitizeFormalMetaForPlan(tp.formalMeta)
    };
  }
  return plan;
}

function sanitizeFormalMetaForPlan(m: ControllerTemplateFormalMetaV1): ControllerTemplateFormalMetaV1 {
  const pick = (v: string | undefined) => {
    const t = v?.trim();
    return t ? t : undefined;
  };
  return {
    product: pick(m.product),
    market: pick(m.market),
    locale: pick(m.locale),
    workflowType: pick(m.workflowType),
    version: pick(m.version),
    audience: pick(m.audience)
  };
}
