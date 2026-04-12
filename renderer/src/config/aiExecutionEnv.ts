/**
 * G-1A：AI 执行相关环境说明集中管理（策略由 **Core 进程** 的 env 生效；此处为桌面侧文档与一致表述）。
 *
 * **Core（aics-core）**
 * - `AI_ROUTER_BASE_URL` + `AI_ROUTER_API_KEY`：生产必须配置，真实推理经此后端。
 * - **G-2**：`AI_ROUTER_MODEL_PRIMARY`（或沿用 `AI_ROUTER_MODEL`）+ `AI_ROUTER_MODEL_FALLBACK`（逗号/分号分隔，可多档）；桌面不感知模型链。
 * - `AI_ALLOW_LOCAL_STUB=1`：仅当 **非生产**（`NODE_ENV`/`AICS_ENV` 均不为 `production`）时允许；生产下设定也会被忽略并打日志。
 * - `AICS_DISABLE_LOCAL_AI_STUB=1`：任意环境显式禁止 stub（优先级高于 `AI_ALLOW_LOCAL_STUB`）。
 *
 * **桌面（renderer）**
 * - 不读取模型密钥；远端生成以 Shared Core `POST /v1/ai/execute` 为准，经 `parseSharedCoreAiExecuteResponse` 归一为 `aiOutcome` + `resultSource`。
 */
export const AI_EXECUTION_ENV_POLICY = {
  stubIgnoredInProduction: "生产运行时 Core 强制忽略 AI_ALLOW_LOCAL_STUB；未配置 Router 则返回 router_not_configured，不返回开发 Stub。",
  trustSourceOfTruth:
    "可信度与 Stub 提示以 TaskResult.metadata.aiOutcome、resultSource、resultSourcePolicy.resolveContentTrustPresentation 为准。"
} as const;
