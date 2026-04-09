const express = require("express");
const { asyncRoute } = require("../async-route");
const { sendV1Success, sendV1Failure } = require("../../utils/v1-http");
const { v1StrictClientHeadersMiddleware } = require("../../middlewares/v1-strict-client.middleware");
const { rateLimitV1Stub } = require("../../middlewares/rate-limit-v1.stub");
const authRoutes = require("./auth.routes");

const authService = require("../../services/v1/auth.service");
const tasksService = require("../../services/v1/tasks.service");
const historyService = require("../../services/v1/history.service");
const templatesService = require("../../services/v1/templates.service");
const memoryService = require("../../services/v1/memory.service");
const aiService = require("../../services/v1/ai.service");

const router = express.Router();
router.use(rateLimitV1Stub);
router.use(v1StrictClientHeadersMiddleware);
router.use("/auth", authRoutes);

router.get(
  "/status",
  asyncRoute(async (req, res) => {
    const data = await authService.getPublicAuthInfo(req.context);
    return sendV1Success(res, req, data, 200, null);
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
    const data = await tasksService.createTaskPlaceholder(req.context);
    return sendV1Success(res, req, { item: data }, 201, null);
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
  "/history",
  asyncRoute(async (req, res) => {
    const data = await historyService.listHistoryPlaceholder(req.context);
    return sendV1Success(res, req, { items: data.items, page: data.page }, 200, {
      page: data.page || 1,
      pageSize: 20,
      total: 0,
      totalPages: 0
    });
  })
);

router.get(
  "/templates",
  asyncRoute(async (req, res) => {
    const rows = await templatesService.listTemplates(req.context);
    return sendV1Success(res, req, { items: rows }, 200, {
      page: 1,
      pageSize: 50,
      total: rows.length,
      totalPages: rows.length === 0 ? 0 : 1
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
    const data = await memoryService.getMemory(req.context);
    return sendV1Success(res, req, data, 200, null);
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
  "/ai",
  asyncRoute(async (req, res) => {
    const data = await aiService.routerPlaceholder(req.context);
    return sendV1Success(res, req, data, 200, null);
  })
);

router.use((req, res) => {
  sendV1Failure(res, req, 404, "NOT_FOUND", `No route: ${req.method} ${req.originalUrl}`);
});

module.exports = router;
