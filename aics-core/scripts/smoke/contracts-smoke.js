/**
 * D-7-3O / D-7-3O+：Core 契约 smoke（子进程 + 临时 AICS_DATA_DIR，不污染开发 data）。
 */
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const fixtures = require("../../tests/contracts/fixtures");

const CORE_ROOT = path.join(__dirname, "..", "..");

function getFreePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      const p = typeof addr === "object" && addr ? addr.port : 0;
      s.close(() => resolve(p));
    });
    s.on("error", reject);
  });
}

function headersForUser(userId) {
  return {
    "Content-Type": "application/json",
    "x-aics-user-id": userId,
    "x-aics-client-id": "desktop-dev",
    "x-aics-session-token": "contract-smoke"
  };
}

async function waitForHealth(baseUrl, maxMs = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    try {
      const r = await fetch(`${baseUrl}/health`);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error("server did not become healthy");
}

function waitChildExit(proc, ms = 8000) {
  return new Promise((resolve) => {
    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      resolve();
    }
    const t = setTimeout(finish, ms);
    proc.once("exit", () => {
      clearTimeout(t);
      finish();
    });
  });
}

async function fetchJson(method, url, opts = {}) {
  const res = await fetch(url, {
    method,
    headers: opts.headers,
    body: opts.body != null ? JSON.stringify(opts.body) : undefined
  });
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { _parseError: true, raw: text.slice(0, 200) };
    }
  }
  return { res, data };
}

function assertArrayItemsShape(items, label) {
  if (!Array.isArray(items)) throw new Error(`${label}: items must be array`);
  /* length >= 0 对数组恒成立，仅保证类型为列表 */
}

function assertCreatedAt(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label}: createdAt must be non-empty string`);
  }
}

async function main() {
  const tmpDir = /** @type {string} */ (fs.mkdtempSync(path.join(os.tmpdir(), "aics-contract-")));
  const ts = Date.now();
  const runDev = `contract-smoke-${ts}-1`;
  const runB = `contract-smoke-${ts}-2`;
  const postDev = fixtures.postResultBody(runDev, "dev");
  const postB = fixtures.postResultBody(runB, "b");

  let passCount = 0;
  let failCount = 0;

  async function run(label, fn) {
    try {
      await fn();
      console.log(`✔ ${label}`);
      passCount += 1;
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      console.log(`✖ ${label} (reason: ${reason})`);
      failCount += 1;
    }
  }

  let child = null;
  try {
    const port = await getFreePort();
    const base = `http://127.0.0.1:${port}`;

    child = spawn(process.execPath, [path.join(CORE_ROOT, "server.js")], {
      cwd: CORE_ROOT,
      env: {
        ...process.env,
        PORT: String(port),
        AICS_DATA_DIR: tmpDir,
        /** G-1：契约环境默认允许 stub，避免无 Router 密钥时 smoke 失败；本机若已配置 Router 则可为 ai_result */
        AI_ALLOW_LOCAL_STUB: process.env.AI_ALLOW_LOCAL_STUB || "1"
      },
      stdio: ["ignore", "ignore", "ignore"]
    });

    await waitForHealth(base);

    await run("POST /result", async () => {
      const { res, data } = await fetchJson("POST", `${base}/result`, {
        headers: headersForUser("dev-user"),
        body: postDev
      });
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      if (!data || data.success !== true) throw new Error("expected { success: true }");
    });

    await run("GET /results", async () => {
      const { res, data } = await fetchJson("GET", `${base}/results?limit=20`, {
        headers: headersForUser("dev-user")
      });
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      if (!data || data.success !== true) throw new Error("success");
      assertArrayItemsShape(data.items, "GET /results");
      const hit = data.items.find((it) => it && String(it.runId) === runDev);
      if (!hit) throw new Error("expected runId in list");
      if (typeof hit.prompt !== "string") throw new Error("item.prompt");
      if (hit.result == null) throw new Error("item.result");
      assertCreatedAt(hit.createdAt, "result list item");
      if (hit.result != null && "kind" in hit.result && typeof hit.result.kind !== "string") {
        throw new Error("result.kind must be string when present");
      }
    });

    await run("GET /results/:runId", async () => {
      const { res, data } = await fetchJson("GET", `${base}/results/${encodeURIComponent(runDev)}`, {
        headers: headersForUser("dev-user")
      });
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      if (!data || data.success !== true) throw new Error("success");
      if (!data.item || typeof data.item !== "object") throw new Error("item object");
      if (String(data.item.runId) !== runDev) throw new Error("runId match");
      assertCreatedAt(data.item.createdAt, "result item");
      if ("hash" in data.item && data.item.hash != null) {
        const h = data.item.hash;
        if (typeof h !== "string" || !h.trim()) throw new Error("item.hash must be non-empty when present");
      }
      if (
        data.item.result != null &&
        "kind" in data.item.result &&
        typeof data.item.result.kind !== "string"
      ) {
        throw new Error("result.kind must be string");
      }
    });

    await run("GET /results/:runId wrong user -> 404", async () => {
      const { res, data } = await fetchJson("GET", `${base}/results/${encodeURIComponent(runDev)}`, {
        headers: headersForUser("contract-user-other")
      });
      if (res.status !== 404) throw new Error(`status ${res.status} expected 404`);
      if (!data || data.success !== false) throw new Error("success false");
      if (typeof data.message !== "string") throw new Error("message");
    });

    await run("GET /results/:runId missing -> 404", async () => {
      const fake = `contract-smoke-${ts}-99999`;
      const { res, data } = await fetchJson("GET", `${base}/results/${encodeURIComponent(fake)}`, {
        headers: headersForUser("dev-user")
      });
      if (res.status !== 404) throw new Error(`status ${res.status}`);
      if (data.success !== false || !data.message) throw new Error("404 shape");
    });

    await run("POST /result isolation + GET /results", async () => {
      const { res: w } = await fetchJson("POST", `${base}/result`, {
        headers: headersForUser("contract-user-b"),
        body: postB
      });
      if (w.status !== 200) throw new Error(`write status ${w.status}`);
      const { res, data } = await fetchJson("GET", `${base}/results?limit=50`, {
        headers: headersForUser("dev-user")
      });
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      assertArrayItemsShape(data.items, "isolation list");
      const hasB = data.items.some((it) => it && String(it.runId) === runB);
      if (hasB) throw new Error("dev-user must not see contract-user-b rows");
    });

    await run("POST /memory-record + GET /memory-records", async () => {
      const memBody = fixtures.postMemoryRecordBody(`m${Date.now()}`);
      const { res: p, data: pd } = await fetchJson("POST", `${base}/memory-record`, {
        headers: headersForUser("dev-user"),
        body: memBody
      });
      if (p.status !== 200 || !pd || pd.success !== true) throw new Error("POST memory");
      const { res, data } = await fetchJson("GET", `${base}/memory-records?limit=10`, {
        headers: headersForUser("dev-user")
      });
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      if (data.success !== true || !Array.isArray(data.items)) throw new Error("list shape");
      assertArrayItemsShape(data.items, "memory-records");
      const first = data.items[0];
      if (!first || typeof first.id !== "string" || typeof first.prompt !== "string") {
        throw new Error("memory item keys");
      }
      assertCreatedAt(first.createdAt, "memory item");
    });

    await run("GET /memory/list + GET /memory/:id (D-3)", async () => {
      const memBody = fixtures.postMemoryRecordBody(`d3-${Date.now()}`);
      const { res: p, data: pd } = await fetchJson("POST", `${base}/memory-record`, {
        headers: headersForUser("dev-user"),
        body: memBody
      });
      if (p.status !== 200 || !pd || pd.success !== true) throw new Error("POST memory for D-3");
      const { res: lr, data: ld } = await fetchJson(
        "GET",
        `${base}/memory/list?page=1&pageSize=10&memoryType=successful_task_hint`,
        { headers: headersForUser("dev-user") }
      );
      if (lr.status !== 200) throw new Error(`memory list status ${lr.status}`);
      if (!ld || ld.success !== true || !ld.data || !Array.isArray(ld.data.list)) {
        throw new Error("memory list shape");
      }
      if (typeof ld.data.total !== "number") throw new Error("memory list total");
      const first = ld.data.list[0];
      if (!first || typeof first.memoryId !== "string" || typeof first.valuePreview !== "string") {
        throw new Error("memory list vm fields");
      }
      const mid = encodeURIComponent(first.memoryId);
      const { res: dr, data: dd } = await fetchJson("GET", `${base}/memory/${mid}`, {
        headers: headersForUser("dev-user")
      });
      if (dr.status !== 200) throw new Error(`memory detail status ${dr.status}`);
      if (!dd || dd.success !== true || !dd.data || typeof dd.data.value !== "string") {
        throw new Error("memory detail shape");
      }
      const { res: xr } = await fetchJson("GET", `${base}/memory/${mid}`, {
        headers: headersForUser("contract-user-memory-only")
      });
      if (xr.status !== 404) throw new Error("cross-user memory detail must be 404");

      const { res: drd, data: ddel } = await fetchJson("DELETE", `${base}/memory/${mid}`, {
        headers: headersForUser("dev-user")
      });
      if (drd.status !== 200 || !ddel || ddel.success !== true) {
        throw new Error("DELETE /memory/:id must succeed for owner");
      }
      const { res: dafter } = await fetchJson("GET", `${base}/memory/${mid}`, {
        headers: headersForUser("dev-user")
      });
      if (dafter.status !== 404) throw new Error("memory must be gone after DELETE");
    });

    await run("GET /templates/list (E-1)", async () => {
      const { res, data } = await fetchJson("GET", `${base}/templates/list?page=1&pageSize=20`, {
        headers: headersForUser("dev-user")
      });
      if (res.status !== 200) throw new Error(`templates list status ${res.status}`);
      if (!data || data.success !== true || !data.data || !Array.isArray(data.data.list)) {
        throw new Error("templates list shape");
      }
      if (typeof data.data.total !== "number") throw new Error("templates total");
      const row = data.data.list[0];
      if (
        !row ||
        typeof row.templateId !== "string" ||
        typeof row.title !== "string" ||
        typeof row.isSystem !== "boolean"
      ) {
        throw new Error("template list row fields");
      }
      const { res: rs } = await fetchJson("GET", `${base}/templates/list?page=1&pageSize=10&isSystem=true`, {
        headers: headersForUser("dev-user")
      });
      if (rs.status !== 200) throw new Error("templates filter isSystem");
    });

    await run("GET /templates/sys-short-video-copy (E-3 system detail)", async () => {
      const { res, data } = await fetchJson(
        "GET",
        `${base}/templates/${encodeURIComponent("sys-short-video-copy")}`,
        { headers: headersForUser("dev-user") }
      );
      if (res.status !== 200 || !data || data.success !== true || !data.data) {
        throw new Error("system template detail");
      }
      const c = data.data.content;
      if (!c || typeof c.sourcePrompt !== "string" || !c.sourcePrompt.includes("短视频")) {
        throw new Error("system template content.sourcePrompt");
      }
      if (!Array.isArray(c.stepsSnapshot)) throw new Error("system template stepsSnapshot");
    });

    await run("POST /templates/save + GET /templates/:id (E-2)", async () => {
      const saveBody = {
        templateType: "workflow",
        title: `E2-smoke-${Date.now()}`,
        description: "contract",
        product: "aics",
        market: "global",
        locale: "zh-CN",
        workflowType: "content",
        version: "1",
        audience: "general",
        sourceTaskId: `task-e2-${Date.now()}`,
        sourceResultId: "run-smoke-1",
        content: {
          v: 1,
          sourcePrompt: "e2 smoke prompt",
          requestedMode: "content",
          stepsSnapshot: [],
          resultSnapshot: { title: "T", bodyPreview: "B", stepCount: 1 }
        }
      };
      const { res: pr, data: pd } = await fetchJson("POST", `${base}/templates/save`, {
        headers: headersForUser("dev-user"),
        body: saveBody
      });
      if (pr.status !== 200 || !pd || pd.success !== true || !pd.data || typeof pd.data.templateId !== "string") {
        throw new Error("templates save");
      }
      const tid = encodeURIComponent(pd.data.templateId);
      const { res: gr, data: gd } = await fetchJson("GET", `${base}/templates/${tid}`, {
        headers: headersForUser("dev-user")
      });
      if (
        gr.status !== 200 ||
        !gd ||
        gd.success !== true ||
        !gd.data ||
        typeof gd.data.content !== "object" ||
        gd.data.content.sourcePrompt !== "e2 smoke prompt"
      ) {
        throw new Error("template detail");
      }
      const { res: evil } = await fetchJson("POST", `${base}/templates/save`, {
        headers: headersForUser("dev-user"),
        body: { ...saveBody, userId: "evil" }
      });
      if (evil.status !== 400) throw new Error("must reject body userId");
      const { res: xr } = await fetchJson("GET", `${base}/templates/${tid}`, {
        headers: headersForUser("contract-user-memory-only")
      });
      if (xr.status !== 404) throw new Error("cross-user template must 404");
    });

    await run("GET /memory-records/snapshot", async () => {
      const { res, data } = await fetchJson("GET", `${base}/memory-records/snapshot?limit=5`, {
        headers: headersForUser("dev-user")
      });
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      if (data.success !== true || !Array.isArray(data.items)) throw new Error("snapshot shape");
      assertArrayItemsShape(data.items, "snapshot");
      for (let i = 0; i < data.items.length; i++) {
        assertCreatedAt(data.items[i].createdAt, `snapshot item[${i}].createdAt`);
      }
    });

    await run("GET /memory-records isolation", async () => {
      const { res, data } = await fetchJson("GET", `${base}/memory-records?limit=50`, {
        headers: headersForUser("contract-user-memory-only")
      });
      if (res.status !== 200 || data.success !== true || !Array.isArray(data.items)) {
        throw new Error("shape");
      }
      assertArrayItemsShape(data.items, "memory isolation");
      const leaked = data.items.some(
        (it) => it && typeof it.prompt === "string" && it.prompt.includes("contract-smoke-memory")
      );
      if (leaked) throw new Error("must not see dev-user memory prompts");
    });

    await run("GET /usage", async () => {
      const { res, data } = await fetchJson("GET", `${base}/usage?limit=20`, {
        headers: headersForUser("dev-user")
      });
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      if (data.success !== true || !Array.isArray(data.items)) throw new Error("usage shape");
      assertArrayItemsShape(data.items, "usage");
      for (let i = 0; i < data.items.length; i++) {
        const u = data.items[i];
        if (typeof u.userId !== "string") throw new Error(`usage[${i}].userId`);
        assertCreatedAt(u.createdAt, `usage[${i}]`);
      }
      const matchUsage = data.items.find((it) => it && String(it.runId) === runDev);
      if (!matchUsage) throw new Error("expected usage row for POST /result runId");
    });

    await run("POST /ai/content → 401 without identity (G-1)", async () => {
      const { res, data } = await fetchJson("POST", `${base}/ai/content`, {
        headers: { "Content-Type": "application/json" },
        body: { action: "generate", prompt: "hello" }
      });
      if (res.status !== 401) throw new Error(`status ${res.status} expected 401`);
      if (!data || data.success !== false) throw new Error("expected failure body");
    });

    await run("POST /ai/content generate (G-1 stub or router)", async () => {
      const { res, data } = await fetchJson("POST", `${base}/ai/content`, {
        headers: headersForUser("dev-user"),
        body: { action: "generate", prompt: "contract g1 generate" }
      });
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      if (!data) throw new Error("no body");
      if (data.success !== true) throw new Error(`expected success, got ${JSON.stringify(data).slice(0, 120)}`);
      if (typeof data.body !== "string" || !data.body.trim()) throw new Error("body required");
      if (data.resultSource !== "mock" && data.resultSource !== "ai_result") throw new Error("resultSource");
      if (data.resultSource === "mock") {
        if (data.aiOutcome !== "local_stub") throw new Error("mock must pair aiOutcome local_stub");
        if (!String(data.body).includes("AI_ALLOW_LOCAL_STUB")) throw new Error("mock must carry stub marker");
      } else if (data.aiOutcome !== "router_success" && data.aiOutcome !== "router_fallback_success") {
        throw new Error("ai_result must pair aiOutcome router_success or router_fallback_success");
      }
    });

    await run("POST /ai/content invalid action → 400 (G-1)", async () => {
      const { res, data } = await fetchJson("POST", `${base}/ai/content`, {
        headers: headersForUser("dev-user"),
        body: { action: "nope", prompt: "x" }
      });
      if (res.status !== 400) throw new Error(`status ${res.status}`);
      if (!data || data.success !== false) throw new Error("expected failure");
      if (data.aiOutcome !== "request_invalid") throw new Error("expected aiOutcome request_invalid");
    });
  } finally {
    if (child) {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      await waitChildExit(child);
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  console.log(`\nPASS: ${passCount}`);
  console.log(`FAIL: ${failCount}`);
  await new Promise((r) => setTimeout(r, 100));
  process.exitCode = failCount > 0 ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
