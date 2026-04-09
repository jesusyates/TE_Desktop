/**
 * J-1+：GET /history/list 契约（items/page/pageSize、status 过滤、分页越界、删除不出现在列表）。
 * 运行：node shared-core-backend/scripts/history-list-contract-smoke.js
 */
process.env.SHARED_CORE_STORAGE = "memory";
const { initStorage } = require("../storage/db");
initStorage();
const { handleGetHistoryList, handleDeleteHistory, handlePostHistory } = require("../history/history.handlers");

function assert(cond, msg) {
  if (!cond) {
    console.error("[history-contract] FAIL:", msg);
    process.exit(1);
  }
}

function req(uid) {
  return { context: { user_id: uid } };
}

async function main() {
  const uA = "hist-contract-a";
  const uB = "hist-contract-b";

  await (async () => {
    const p = { prompt: "p-success-1", preview: "a", status: "success", mode: "ai", taskId: "task-s-1" };
    const r = handlePostHistory(req(uA), p);
    assert(r.status === 201 && r.body.success, "post success 1");
    const p2 = { prompt: "p-error-1", preview: "b", status: "error", mode: "ai" };
    const r2 = handlePostHistory(req(uA), p2);
    assert(r2.status === 201, "post error 1");
    const p3 = { prompt: "p-success-2", preview: "c", status: "success", mode: "fallback" };
    handlePostHistory(req(uA), p3);
    const p4 = { prompt: "p-other-user", preview: "d", status: "success", mode: "ai" };
    handlePostHistory(req(uB), p4);
  })();

  const sp = (q) => new URLSearchParams(q);

  const listAll = handleGetHistoryList(req(uA), sp("page=1&pageSize=10"));
  assert(listAll.status === 200 && listAll.body.success, "list all ok");
  const d0 = listAll.body.data;
  assert(Array.isArray(d0.items), "items array");
  assert(d0.items.length <= d0.pageSize, "length <= pageSize");
  assert(typeof d0.total === "number" && typeof d0.page === "number" && typeof d0.pageSize === "number", "meta nums");
  assert(d0.page === 1 && d0.pageSize === 10, "echo page");

  const listSuccess = handleGetHistoryList(req(uA), sp("page=1&pageSize=10&status=success"));
  assert(listSuccess.body.data.items.every((it) => it.status === "success"), "status=success filter");

  const listErr = handleGetHistoryList(req(uA), sp("page=1&pageSize=20&status=error"));
  assert(listErr.body.data.items.every((it) => it.status === "error"), "status=error filter");

  const listBadStatus = handleGetHistoryList(req(uA), sp("page=1&pageSize=10&status=not-real"));
  assert(listBadStatus.status === 200 && listBadStatus.body.success, "invalid status no error");
  assert(
    listBadStatus.body.data.items.length === listAll.body.data.items.length,
    "invalid status ignores filter"
  );

  const farPage = handleGetHistoryList(req(uA), sp("page=999&pageSize=10"));
  assert(farPage.status === 200 && Array.isArray(farPage.body.data.items), "far page ok");
  assert(farPage.body.data.items.length === 0, "far page empty items");

  const firstId = d0.items[0]?.historyId;
  assert(firstId, "has first id");
  const del = handleDeleteHistory(req(uA), firstId);
  assert(del.status === 200, "delete ok");

  const listAfter = handleGetHistoryList(req(uA), sp("page=1&pageSize=50"));
  assert(!listAfter.body.data.items.some((it) => it.historyId === firstId), "deleted not in list");

  const uPage = "hist-contract-page";
  for (let i = 0; i < 12; i += 1) {
    handlePostHistory(req(uPage), { prompt: `pg-${i}`, preview: "", status: "success", mode: "ai" });
  }
  const pg1 = handleGetHistoryList(req(uPage), sp("page=1&pageSize=10"));
  const pg2 = handleGetHistoryList(req(uPage), sp("page=2&pageSize=10"));
  assert(pg1.status === 200 && pg1.body.success, "pg1 ok");
  assert(pg2.status === 200 && pg2.body.success, "pg2 ok");
  assert(pg1.body.data.items.length <= pg1.body.data.pageSize, "pg1 length <= pageSize");
  assert(pg2.body.data.items.length <= pg2.body.data.pageSize, "pg2 length <= pageSize");
  assert(pg1.body.data.items.length === 10, "pg1 has 10 items");
  assert(pg2.body.data.items.length === 2, "pg2 has remainder");
  assert(pg2.body.data.page === 2 && pg2.body.data.pageSize === 10, "pg2 echoes query");
  assert(pg1.body.data.items.every((it) => it.status === "success"), "pg1 status filter implicit all success");

  console.log("[history-contract] ALL OK");
}

main().catch((e) => {
  console.error("[history-contract] FAIL:", e);
  process.exit(1);
});
