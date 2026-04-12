const express = require("express");
const { asyncRoute } = require("../async-route");
const { sendV1Success, sendV1Failure } = require("../../utils/v1-http");
const { v1StrictClientHeadersMiddleware } = require("../../middlewares/v1-strict-client.middleware");
const { rateLimitV1Stub } = require("../../middlewares/rate-limit-v1.stub");
const { rateLimitTaskRun } = require("../../middlewares/rateLimit.middleware");
const authRoutes = require("./auth.routes");
const accountRoutes = require("../../modules/account/routes/accountRoutes");

const authService = require("../../services/v1/auth.service");
const tasksService = require("../../services/v1/tasks.service");
const taskExecutionService = require("../../modules/taskExecution/taskExecution.service");
const historyService = require("../../services/v1/history.service");
const canonicalHistoryService = require("../../modules/history/history.service");
const resultService = require("../../modules/result/result.service");
const templatesService = require("../../services/v1/templates.service");
const memoryService = require("../../services/v1/memory.service");
const memoryCanonicalService = require("../../modules/memory/memory.service");
const templateCanonicalService = require("../../modules/template/template.service");
const usageService = require("../../modules/usage/usage.service");
const quotaService = require("../../modules/quota/quota.service");
const aiRoutes = require("./ai.routes");
const settingsService = require("../../modules/settings/settings.service");
const featureFlagService = require("../../modules/featureFlag/featureFlag.service");
const auditService = require("../../services/v1/audit.service");

const router = express.Router();
router.use(rateLimitV1Stub);
router.use(v1StrictClientHeadersMiddleware);
router.use("/auth", authRoutes);
router.use("/account", accountRoutes);

router.get(
  "/status",
  asyncRoute(async (req, res) => {
    const data = await authService.getPublicAuthInfo(req.context);
    return sendV1Success(res, req, data, 200, null);
  })
);

router.get(
  "/settings",
  asyncRoute(async (req, res) => {
    const data = await settingsService.getSettings(req.context);
    return sendV1Success(res, req, data, 200, null);
  })
);

router.patch(
  "/settings",
  asyncRoute(async (req, res) => {
    const data = await settingsService.patchSettings(req.context, req.body || {});
    return sendV1Success(res, req, data, 200, null);
  })
);

router.get(
  "/feature-flags",
  asyncRoute(async (req, res) => {
    const flags = await featureFlagService.resolveFlags(req.context);
    return sendV1Success(res, req, { flags }, 200, null);
  })
);

router.get(
  "/tasks",
  asyncRoute(async (req, res) => {
    const data = await tasksService.listTasks(req.context);
    const total = data.length;
    return sendV1Success(res, req, { items: data }, 200, {
      page: 1,
      pageSize: 50,
      total,
      totalPages: total === 0 ? 0 : 1
    });
  })
);

router.post(
  "/tasks",
  asyncRoute(async (req, res) => {
    const row = await tasksService.createTaskFromPrompt(req.context, req.body || {});
    return sendV1Success(res, req, { taskId: row.id }, 201, null);
  })
);

router.post(
  "/tasks/:id/run",
  rateLimitTaskRun,
  asyncRoute(async (req, res) => {
    const data = await taskExecutionService.executeTaskService(req.context, req.params.id);
    return sendV1Success(res, req, data, 200, null);
  })
);

router.get(
  "/task-runs/:runId",
  asyncRoute(async (req, res) => {
    const data = await taskExecutionService.getTaskRunByIdService(req.context, req.params.runId);
    return sendV1Success(res, req, data, 200, null);
  })
);

router.patch(
  "/tasks/:id",
  asyncRoute(async (req, res) => {
    const row = await tasksService.patchTask(req.context, req.params.id, req.body || {});
    if (!row) return sendV1Failure(res, req, 404, "NOT_FOUND", "task not found");
    return sendV1Success(res, req, { item: row }, 200, null);
  })
);

router.post(
  "/tasks/:id/rerun",
  asyncRoute(async (req, res) => {
    const row = await tasksService.rerunTask(req.context, req.params.id);
    if (!row) return sendV1Failure(res, req, 404, "NOT_FOUND", "task not found");
    return sendV1Success(res, req, { item: row }, 201, null);
  })
);

router.delete(
  "/tasks/:id",
  asyncRoute(async (req, res) => {
    const ok = await tasksService.deleteTask(req.context, req.params.id);
    if (!ok) return sendV1Failure(res, req, 404, "NOT_FOUND", "task not found");
    return sendV1Success(res, req, { deleted: true }, 200, null);
  })
);

router.get(
  "/tasks/:id",
  asyncRoute(async (req, res) => {
    const row = await tasksService.getTaskById(req.context, req.params.id);
    if (!row) return sendV1Failure(res, req, 404, "NOT_FOUND", "task not found");
    return sendV1Success(res, req, { item: row }, 200, null);
  })
);

router.get(
  "/results/:runId",
  asyncRoute(async (req, res) => {
    const data = await resultService.getResultByRunId(req.context, req.params.runId);
    return sendV1Success(res, req, data, 200, null);
  })
);

router.get(
  "/history",
  asyncRoute(async (req, res) => {
    const data = await canonicalHistoryService.listHistory(req.context, req.query || {});
    return sendV1Success(
      res,
      req,
      { items: data.items, page: data.page, pageSize: data.limit },
      200,
      {
        page: data.page,
        pageSize: data.limit,
        total: data.total,
        totalPages: data.totalPages
      }
    );
  })
);

router.get(
  "/history/:id",
  asyncRoute(async (req, res) => {
    const data = await canonicalHistoryService.getHistoryById(req.context, req.params.id);
    return sendV1Success(res, req, data, 200, null);
  })
);

router.delete(
  "/history/:id",
  asyncRoute(async (req, res) => {
    const data = await canonicalHistoryService.deleteHistoryEntry(req.context, req.params.id);
    return sendV1Success(res, req, data, 200, null);
  })
);

router.post(
  "/history",
  asyncRoute(async (req, res) => {
    const row = await historyService.createHistoryEntry(req.context, req.body || {});
    return sendV1Success(res, req, { item: row }, 201, null);
  })
);

router.get(
  "/templates",
  asyncRoute(async (req, res) => {
    const templates = await templateCanonicalService.listTemplatesForApi(req.context);
    return sendV1Success(res, req, { templates }, 200, {
      page: 1,
      pageSize: 50,
      total: templates.length,
      totalPages: templates.length === 0 ? 0 : 1
    });
  })
);

router.get(
  "/templates/:id",
  asyncRoute(async (req, res) => {
    const row = await templatesService.getTemplateById(req.context, req.params.id);
    if (!row) return sendV1Failure(res, req, 404, "NOT_FOUND", "template not found");
    return sendV1Success(res, req, { item: row }, 200, null);
  })
);

router.post(
  "/templates",
  asyncRoute(async (req, res) => {
    const row = await templatesService.createTemplate(req.context, req.body || {});
    return sendV1Success(res, req, { item: row }, 201, null);
  })
);

router.get(
  "/memory",
  asyncRoute(async (req, res) => {
    const items = await memoryCanonicalService.listMemoryItems(req.context);
    return sendV1Success(res, req, { items }, 200, null);
  })
);

router.post(
  "/memory/entries",
  asyncRoute(async (req, res) => {
    const row = await memoryService.appendMemoryEntry(req.context, req.body || {});
    return sendV1Success(res, req, { item: row }, 201, null);
  })
);

router.post(
  "/audit-events",
  asyncRoute(async (req, res) => {
    const item = await auditService.appendAuditEvent(req.context, req.body || {});
    return sendV1Success(res, req, { item }, 201, null);
  })
);

router.get(
  "/audit-events",
  asyncRoute(async (req, res) => {
    const items = await auditService.listAuditEventsForApi(req.context, req.query || {});
    const limitRaw = req.query && req.query.limit != null ? Number(req.query.limit) : 50;
    const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50));
    return sendV1Success(res, req, { items }, 200, {
      page: 1,
      pageSize: limit,
      total: items.length,
      totalPages: items.length === 0 ? 0 : 1
    });
  })
);

router.use("/ai", aiRoutes);

router.get(
  "/usage",
  asyncRoute(async (req, res) => {
    const usage = await usageService.listUsageForApi(req.context);
    return sendV1Success(res, req, { usage }, 200, null);
  })
);

router.get(
  "/quota",
  asyncRoute(async (req, res) => {
    const data = await quotaService.getQuotaForApi(req.context);
    return sendV1Success(res, req, data, 200, null);
  })
);

router.use((req, res) => {
  sendV1Failure(res, req, 404, "NOT_FOUND", `No route: ${req.method} ${req.originalUrl}`);
});

module.exports = router;
