#!/usr/bin/env node
/**
 * CORS 预检 + POST 自测（不依赖 curl；Node 18+）。
 *
 * 用法：
 *   node scripts/cors-preflight-smoke.js
 *   node scripts/cors-preflight-smoke.js http://43.160.229.50:4000
 *
 * 验收：OPTIONS 须 204 且 ACAO 含 null；POST 须有明确 HTTP 状态且非 CORS_BLOCKED。
 */
const http = require("http");
const https = require("https");

const baseRaw = process.argv[2] || "http://127.0.0.1:4000";
const base = baseRaw.endsWith("/") ? baseRaw.slice(0, -1) : baseRaw;
const target = new URL("/v1/auth/register", `${base}/`);

function request(method, headers, body) {
  const lib = target.protocol === "https:" ? https : http;
  const opt = {
    hostname: target.hostname,
    port: target.port || (target.protocol === "https:" ? 443 : 80),
    path: target.pathname,
    method,
    headers
  };
  return new Promise((resolve, reject) => {
    const req = lib.request(opt, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          body: buf.toString("utf8").slice(0, 800)
        });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  console.log("Target:", target.href);

  const optRes = await request("OPTIONS", {
    Origin: "null",
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "content-type,x-client-platform"
  });

  const acao = optRes.headers["access-control-allow-origin"];
  const acam = optRes.headers["access-control-allow-methods"] || "";
  const acah = optRes.headers["access-control-allow-headers"] || "";

  console.log("OPTIONS status:", optRes.status);
  console.log("  Access-Control-Allow-Origin:", acao);
  console.log("  Access-Control-Allow-Methods:", acam);
  console.log("  Access-Control-Allow-Headers:", acah);

  if (optRes.status !== 204) {
    console.error("FAIL: OPTIONS 预期 204，实际", optRes.status);
    process.exit(1);
  }
  if (String(acao || "").toLowerCase() !== "null") {
    console.error('FAIL: 预期 Access-Control-Allow-Origin: null，实际', acao);
    process.exit(1);
  }
  if (!/POST/i.test(acam)) {
    console.error("FAIL: Allow-Methods 应包含 POST");
    process.exit(1);
  }
  if (!/content-type/i.test(acah) || !/x-client-platform/i.test(acah)) {
    console.error("FAIL: Allow-Headers 应包含 content-type 与 x-client-platform");
    process.exit(1);
  }

  const postRes = await request(
    "POST",
    {
      Origin: "null",
      "Content-Type": "application/json",
      "X-Client-Platform": "desktop",
      "X-Client-Market": "global",
      "X-Client-Locale": "en-US",
      "X-Client-Version": "0.0.0",
      "X-Client-Product": "aics"
    },
    JSON.stringify({ email: "cors-smoke@example.com", password: "Test123456" })
  );

  console.log("POST status:", postRes.status);
  console.log("POST body (truncated):", postRes.body.slice(0, 400));

  if (postRes.status === 403 && postRes.body.includes("CORS_BLOCKED")) {
    console.error("FAIL: POST 仍被 CORS 拦截");
    process.exit(1);
  }
  if (postRes.status < 100 || postRes.status >= 600) {
    console.error("FAIL: 无效 HTTP 状态");
    process.exit(1);
  }

  console.log("OK: 预检与 POST 均收到明确 HTTP 响应");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
