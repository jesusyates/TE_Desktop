# 本地环境与服务端对齐 — 验收清单

目标：本地联调行为尽量等同服务器（`src/main.js`、`dual_write`、Supabase Auth、CORS），**通过以下步骤后再 push / 部署**。

## 0. 一次性准备

1. 复制环境模板（**勿提交 `.env.local`**）：
   ```bash
   cd shared-core-backend
   cp .env.local.example .env.local
   ```
2. 编辑 `.env.local`：填入与服务器一致的 `SUPABASE_*`、`ALLOWED_ORIGINS` 等。**勿**把 `AUTH_MAIL_SINK=smtp` 作为主联调默认（`AUTH_PROVIDER=supabase` 时邮件由 Supabase 配置；Core 生产校验已跳过 SMTP 必填）。
3. **关键**：`.env` 或 `.env.local` 中如需 `NODE_ENV=production`，须写在文件内且由 **`node src/main.js`** 启动（`bootstrap-env` 会先加载 `.env` 再解析 `NODE_ENV`）。

## 1. 启动 Shared Core（唯一主入口）

```bash
cd shared-core-backend
node src/main.js
```

或使用 monorepo 根目录：

```bash
npm run dev:backend
# 或
npm run start:backend
```

预期日志含：`Shared Core Backend listening on http://0.0.0.0:4000`，且 `STORAGE_MODE` 为 **`dual_write`**（除非显式改小）。

## 2. 健康检查

```bash
curl -sSf http://127.0.0.1:4000/health
curl -sSf http://127.0.0.1:4000/ready
```

## 3. CORS 预检

```bash
npm run cors:smoke
# 或见 scripts/cors-preflight-smoke.js 内 curl 等价命令
```

预期：`OPTIONS /v1/auth/register` → **204**，`Access-Control-Allow-Origin` 与桌面 Origin 策略一致。

## 4. 注册接口（明确 HTTP 体，非 ERR_NETWORK）

```bash
curl -i -X POST "http://127.0.0.1:4000/v1/auth/register" \
  -H "Origin: null" \
  -H "Content-Type: application/json" \
  -H "X-Client-Platform: desktop" \
  -H "X-Client-Market: global" \
  -H "X-Client-Locale: en-US" \
  -H "X-Client-Version: 0.0.0" \
  -H "X-Client-Product: aics" \
  --data "{\"email\":\"align-check@example.com\",\"password\":\"Test123456\"}"
```

预期：任意明确 **2xx/4xx/5xx** JSON，而非浏览器侧纯网络失败。

## 5. 桌面端

1. 根目录 `npm run dev`，打开登录/注册页。
2. 控制台检索 **`[auth-runtime]`**：须显示 **`SHARED_CORE_BASE_URL` = `http://127.0.0.1:4000`**（本地 Vite `import.meta.env.DEV` 默认基线），以及 `resolutionSource`、`viteMode`。
3. 点击注册 / 登录：不应再出现 **ERR_NETWORK**（在 Core 已启动且 CORS 通过的前提下）。

## 6. 日志与排障

- 服务端：`http_request_start` / `http_request`（`src/middlewares/request-logging.middleware.js`）。
- 桌面：`[auth-http]` 与注册错误诊断块（renderer）。

## 7. 通过后再部署

```bash
git push
# 服务器：git pull && pm2 restart shared-core-backend（以服务器手册为准）
```

---

## 附录：`NODE_ENV` 分叉行为速查（不要求本轮改代码，仅供对齐预期）

| 区域 | development | production |
|------|----------------|------------|
| `validate-boot` | JWT 短告警；Supabase 生产强校验放宽 | `AUTH_PROVIDER=supabase` 时强校验 `SUPABASE_*`；`dual_write` 须 URL + service_role；**须配置 `ALLOWED_ORIGINS`** |
| `TRUST_PROXY` 默认 | `0` | `1`（可被 env 覆盖） |
| `logLevel` 默认 | `debug` | `info` |
| `/v1` `v1StrictClientHeadersMiddleware` | 可用 `DEFAULT_CLIENT_*` 兜底 | **强制** `X-Client-Product` + `X-Client-Platform` |
| `auth.handlers` / legacy | bootstrap 规则略宽松 | legacy bootstrap 常需显式开关 |

CORS：`CORS_STRICT` 未开时仍放行 Electron 常见 Origin；与 `NODE_ENV` 正交，详见 `cors-origin.util.js`。

Mailer：`AUTH_PROVIDER=supabase` 时本地 mailer 硬禁用，与 `NODE_ENV` 正交。
