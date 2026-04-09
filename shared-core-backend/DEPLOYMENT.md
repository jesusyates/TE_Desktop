# shared-core-backend — 部署与接库说明（新加坡 / 生产）

面向将统一后端部署到公网（如新加坡 VPS）并联调 Supabase。HTTPS 证书、域名备案、WAF 等由运维单独落实。

## 0. 前置条件（新加坡或任意 Linux 服务器）

- **Node.js**：建议 **22+**（legacy Auth / 计费仍使用本机 **SQLite** 时需 `node:sqlite`）；仅跑 `STORAGE_MODE=memory` 可用较低版本做短时验证。
- **出站网络**：服务器需能访问 `SUPABASE_URL`（若使用 `cloud_primary` / `dual_write`）。
- **进程管理**：PM2 或 systemd 二选一；下文以 PM2 为例。
- **反向代理**：Nginx/Caddy 终止 TLS，反代到本机 `PORT`（默认 4000）。

**正式 API**：新业务、新客户端仅使用 **`/v1/*`**。根路径兼容层仍存在（`/auth/*`、`/api/tasks` 等），带弃用响应头，勿再扩展。

### 0.1 新加坡 VPS 上线执行单（可复制）

以下在你方 **Ubuntu** 服务器上以 **非 root 部署用户**（示例：`aics`）执行；**Cursor 无法在本地替你 SSH 上线**，本清单用于现场运维逐步验收。

**A. 系统与用户**

```bash
sudo apt update && sudo apt upgrade -y
sudo adduser aics   # 若尚未创建
sudo usermod -aG sudo aics
sudo apt install -y git curl nginx
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

**B. 代码目录（示例 `/opt/aics`）**

```bash
sudo mkdir -p /opt/aics && sudo chown -R aics:aics /opt/aics
sudo -u aics bash -lc 'cd /opt/aics && git clone <your-repo-url> repo && cd repo/shared-core-backend && npm install --omit=dev'
```

**C. 生产环境变量**

在 `shared-core-backend` 目录创建 **`.env.production`**（勿提交 git），至少包含指令单中的：`NODE_ENV`、`PORT`、`API_BASE_URL`、`JWT_SECRET`、`ALLOWED_ORIGINS`、`TRUST_PROXY`、`STORAGE_MODE`（推荐上线初期 `dual_write`）、`SUPABASE_*`，以及 `.env.example` 中的 **`AUTH_BOOTSTRAP_*`** 与邮件相关变量（或使用允许的 sink 做短时调试）。

**D. 启动前必须通过校验**

```bash
cd /opt/aics/repo/shared-core-backend
NODE_ENV=production npm run validate:boot
```

失败则**禁止** `pm2 start`，先修正 env。

**E. PM2**

```bash
NODE_ENV=production npx pm2 start ecosystem.config.js
npx pm2 save
npx pm2 startup   # 按屏幕提示执行 sudo 命令
npx pm2 logs shared-core-backend
```

说明：`ecosystem.config.js` 使用 **`env_file: ".env.production"`**（需 PM2 **≥ 5.2**）。若 PM2 较旧，可改为：先 `export $(grep -v '^#' .env.production | xargs)` 再启动，或升级 PM2。

**F. 本机探活（服务器上）**

```bash
curl -sSf http://127.0.0.1:4000/health
curl -sSf http://127.0.0.1:4000/ready
curl -sSf http://127.0.0.1:4000/version
```

**G. Nginx + HTTPS**

- 在 `sites-available` 中为 `api.yourdomain.com` 配置 `proxy_pass http://127.0.0.1:4000`，并设置 `Host`、`X-Forwarded-*`、`X-Forwarded-Proto`（见下文 §7 示例）。
- `sudo apt install -y certbot python3-certbot-nginx` → `sudo certbot --nginx -d api.yourdomain.com`。

**H. 公网验收**

```bash
curl -sSf https://api.yourdomain.com/health
curl -sSf https://api.yourdomain.com/ready
```

再按 **§9** 对 `/v1/tasks`、`/v1/memory/entries`、`/v1/templates` 做最小写入；`/ready` 中 Supabase 须为 **ok**（`dual_write` / `cloud_primary`）。日志中不应长期出现 Supabase 连接失败或 `dual_write_cloud_failed`（见 `pm2 logs`）。

---

## 1. STORAGE_MODE（域存储 + Core SQLite）

| `STORAGE_MODE` | 域存储（task / memory / template） | Core（Auth 等 SQLite） |
|----------------|--------------------------------------|-------------------------|
| `memory` | 进程内 | 不落盘 |
| `local` | `storage/local-stores/*.jsonl` | 本地 SQLite |
| `cloud_primary` | Supabase 表 `v1_*` | 本地 SQLite |
| `dual_write` | **Task**：本地 JSONL + Supabase 双写；Memory/Template 走 Supabase | 本地 SQLite |
| `stub_supabase` | 兼容别名；配置了 Supabase 时等价 `cloud_primary`，否则等价 `memory` | `memory` |

生产 **`cloud_primary` / `dual_write`** 时 **必填**：`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`（启动校验）。

---

## 2. `.env.production` 必填 / 建议

| 变量 | 必填 | 说明 |
|------|------|------|
| `NODE_ENV` | ✅ | `production` |
| `PORT` | ✅ | 监听端口，如 `4000` |
| `API_BASE_URL` | ✅ | 对外 API 基址，如 `https://api.example.com` |
| `ALLOWED_ORIGINS` | ✅ | 逗号分隔，**禁止 `*`** |
| `JWT_SECRET` | ✅ | ≥16，或 `SHARED_CORE_AUTH_SECRET` |
| `TRUST_PROXY` | ✅ 建议 | 经 Nginx 时 `1` |
| `STORAGE_MODE` | ✅ | 见上表 |
| `SUPABASE_URL` | 云模式 ✅ | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 云模式 ✅ | **仅后端**，勿提交前端 |
| `AUTH_BOOTSTRAP_*` / 邮件 | ✅ | 见 `.env.example` |

密钥**禁止**写入日志；代码内使用 `getSupabaseAdminClient()`，不打印 service role。

---

## 3. Supabase 表结构

在 Supabase **SQL Editor** 执行：

`supabase/migrations/001_v1_domain_stores.sql`

表：`v1_tasks`、`v1_memory_entries`、`v1_templates`。未完成迁移时，`GET /ready` 在需要 Supabase 的模式下会返回 **503**（`supabase_unreachable` 等）。

---

## 4. 本地运行

```bash
cd shared-core-backend
cp .env.example .env
npm install
STORAGE_MODE=memory NODE_ENV=development node src/main.js
# 或
npm run dev
```

监听 **`0.0.0.0:PORT`**，可从局域网或其它容器访问（非仅 localhost）。

---

## 5. 生产安装与启动

```bash
cd /opt/shared-core-backend   # 或你的部署目录
git clone <repo> . && cd shared-core-backend   # 按实际目录
cp .env.example .env
# 编辑 .env 与 .env.production
npm install --omit=dev
NODE_ENV=production npm run validate:boot
NODE_ENV=production npm run start
```

---

## 6. PM2

```bash
cd shared-core-backend
npx pm2 start ecosystem.config.js
npx pm2 save
npx pm2 startup   # 按提示配置开机自启
npx pm2 logs shared-core-backend
```

需在服务器环境中导出或使用 PM2 `env` 注入生产变量（**勿**把 `SUPABASE_SERVICE_ROLE_KEY` 提交到 git）。

---

## 7. Nginx 反向代理（示例）

将 `api.yourdomain.com` 换成真实域名；证书路径由运维填写。

```nginx
upstream shared_core_backend {
  server 127.0.0.1:4000;
  keepalive 32;
}

server {
  listen 443 ssl http2;
  server_name api.yourdomain.com;

  # ssl_certificate     /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
  # ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

  location / {
    proxy_pass http://shared_core_backend;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
  }
}

# WebSocket / SSE：当前 API 未启用，无需 `Upgrade` 配置；若未来订阅型接口上线再补。
```

应用内需 **`TRUST_PROXY=1`**，以便 `req.context.ip` 与限流等依赖真实客户端 IP。

**验证**：`curl -sSf https://api.yourdomain.com/health`、`/ready`、`/version`。

---

## 8. 健康检查与就绪

| 路径 | 用途 |
|------|------|
| `GET /health` | 进程存活（不查外部依赖） |
| `GET /ready` | Core SQLite（若启用）+ **按需** Supabase `v1_tasks` 探测 |
| `GET /version` | 构建版本号 |

负载均衡：**liveness** → `/health`；**readiness** → `/ready`（发布/滚动升级时用）。

`GET /ready` 示例（Supabase 跳过时）：

```json
{
  "ready": true,
  "storageMode": "memory",
  "core": { "ok": true, "backend": "memory", "storage": "memory" },
  "supabase": { "status": "skipped", "reason": "mode_does_not_require_supabase" }
}
```

---

## 9. 验证最小读写（官方 `/v1`）

Header（生产必带）：`X-Client-Product`、`X-Client-Platform`（开发可配 `DEFAULT_CLIENT_*`）。

```bash
# 列表任务
curl -sS -H "X-Client-Product: aics" -H "X-Client-Platform: desktop" \
  http://127.0.0.1:4000/v1/tasks

# 创建占位任务
curl -sS -X POST -H "Content-Type: application/json" \
  -H "X-Client-Product: aics" -H "X-Client-Platform: desktop" \
  http://127.0.0.1:4000/v1/tasks

# Memory 追加 + 读取
curl -sS -X POST -H "Content-Type: application/json" \
  -H "X-Client-Product: aics" -H "X-Client-Platform: desktop" \
  -d '{"key":"note","value":{"text":"hello"}}' \
  http://127.0.0.1:4000/v1/memory/entries

curl -sS -H "X-Client-Product: aics" -H "X-Client-Platform: desktop" \
  http://127.0.0.1:4000/v1/memory

# 模板创建 / 查询
curl -sS -X POST -H "Content-Type: application/json" \
  -H "X-Client-Product: aics" -H "X-Client-Platform: desktop" \
  -d '{"title":"T1","body":{"x":1}}' \
  http://127.0.0.1:4000/v1/templates
```

---

## 10. Supabase 不可用时的行为

- **`STORAGE_MODE=cloud_primary`**：`/ready` 返回 **503**；域读写会报错（显式错误，不静默）。
- **`STORAGE_MODE=dual_write`**：**读**优先云，失败回落本地 JSONL；**写**本地成功后再写云，**云失败会抛错**并打 **`dual_write_cloud_failed`** 日志（不静默丢数据）。

---

## 11. 双写（当前实现）

- **域**：**Task** 在 `dual_write` 下为 **LocalJsonlTaskStore + SupabaseTaskStore** 组合（见 `src/stores/implementations/dual-write.task.store.js`）。
- **Memory / Template**：该模式下使用 **Supabase** 单写（未做双写，避免首轮过重）。

---

## 12. 回滚

- **代码**：`git checkout <tag>` → `npm ci` / `npm install --omit=dev` → `pm2 restart shared-core-backend`。
- **配置**：恢复旧 `.env` / `.env.production` 后**必须重启进程**。
- **数据**：备份 `storage/shared-core.sqlite` 与 `storage/local-stores/`（若使用 local/dual_write）。

---

## 13. 已知限制 / 未完成

- **Auth / 计费 / 历史** 仍走 legacy SQLite + 兼容路由，未迁入 Supabase。
- **RLS**：当前表以 **service role** 写入；上线前应在 Supabase 配置 RLS 或独立 schema 策略。
- **TLS 证书**：示例占位，需 Let’s Encrypt/商业证书真实申请。
- **npm audit**：仓库可能有上游高危报告，需按计划升级依赖。
