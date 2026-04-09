# AICS Desktop — 运行说明（v0.1 基线 / v0.2 收口）

## 1. 启动 backend

在项目根目录执行：

```powershell
node shared-core-backend/server.js
```

服务默认监听 `http://localhost:4000`。

---

## 2. 配置真实 AI Router（模块 C 必验）

**规则（不要改）**：未同时配置 `AI_ROUTER_BASE_URL`（合法 http/https）与 `AI_ROUTER_API_KEY` 时，执行任务会返回 **503**，`message` 为 `ai_router_required`，**不会**用占位正文冒充成功。

### 2.1 需要的环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `AI_ROUTER_BASE_URL` | 是 | 兼容 OpenAI 的 API 根地址，**不要**带路径末尾的 `/v1`。示例：`https://api.openai.com`、`https://api.deepseek.com` |
| `AI_ROUTER_API_KEY` | 是 | 对应服务商的 API Key |
| `AI_ROUTER_MODEL` | 否 | 默认 `gpt-4o-mini`；DeepSeek 可设为 `deepseek-chat` 等 |
| `AI_ROUTER_TIMEOUT_MS` | 否 | Router **读取响应体**阶段超时（毫秒），默认 `60000`。首 token / 整段生成慢时可改为 `90000` |
| `AI_ROUTER_CONNECT_TIMEOUT_MS` | 否 | 建立连接直至收到响应头阶段超时，默认 `30000` |
| `AI_ROUTER_RESPONSE_TIMEOUT_MS` | 否 | 若设置则**优先**作为体读取超时；未设置时回退到 `AI_ROUTER_TIMEOUT_MS` |

端点格式：后端会请求  

`{AI_ROUTER_BASE_URL.trimEnd('/')}/v1/chat/completions`  

方法 POST，Bearer 认证，JSON body 仅含 `model` 与 `messages`（最小 OpenAI Chat Completions 形状，兼容 DeepSeek 等）。

**注意**：`AI_ROUTER_BASE_URL` 只能是根地址（如 `https://api.deepseek.com`），**不要**写成 `https://api.deepseek.com/v1`，否则会变成错误的 `/v1/v1/chat/completions`。

### 2.1.1 桌面 HTTP 超时（与 Router 分开）

多步任务会长时间占用 `POST /api/tasks`。渲染进程 Axios 默认已提高到 **300000ms**（5 分钟），仍可在启动前端前设置：

```powershell
$env:AICS_API_TIMEOUT_MS="300000"
npm run dev
```

### 2.2 PowerShell：一步一步（请整段复制到「启动 backend 的窗口」）

在项目根目录 `TE_Desktop`（或你的仓库根）打开 **PowerShell**，执行：

```powershell
# 1）认证（与 bootstrap 用户，按需改值）
$env:SHARED_CORE_AUTH_SECRET="至少16字符的密钥"
$env:AUTH_BOOTSTRAP_EMAIL="you@example.com"
$env:AUTH_BOOTSTRAP_PASSWORD="你的强密码"

# 2）AI Router（按需改 URL / Key / 模型）
$env:AI_ROUTER_BASE_URL="https://api.deepseek.com"
$env:AI_ROUTER_API_KEY="你的_API_Key"
$env:AI_ROUTER_MODEL="deepseek-chat"
# 验收或慢模型时可放宽（与后端同窗口）
$env:AI_ROUTER_TIMEOUT_MS="60000"
# 更慢可：$env:AI_ROUTER_TIMEOUT_MS="90000"

# 3）本终端启动后端（必须与此窗口环境变量一致）
node shared-core-backend/server.js
```

**OpenAI 示例**（将 Key 换成你的）：

```powershell
$env:SHARED_CORE_AUTH_SECRET="至少16字符的密钥"
$env:AUTH_BOOTSTRAP_EMAIL="you@example.com"
$env:AUTH_BOOTSTRAP_PASSWORD="你的强密码"
$env:AI_ROUTER_BASE_URL="https://api.openai.com"
$env:AI_ROUTER_API_KEY="sk-..."
$env:AI_ROUTER_MODEL="gpt-4o-mini"
node shared-core-backend/server.js
```

换终端后必须 **重新设置** 上述 `$env:...`，否则新进程没有密钥。

### 2.3 如何验证「不是 stub」

1. **不要**设置 `AI_ALLOW_LOCAL_STUB=1`（仅本地开发占位，验收时应关闭）。
2. 后端终端启动后，观察控制台首次跑任务前会有 JSON 日志 `ai_router_config`，其中 `"router_enabled": true`。
3. 桌面端登录 → **新建任务** → 执行成功时，结果正文应：
   - **不**以 `[AI_ALLOW_LOCAL_STUB` 开头；
   - 同一提示多跑几次，内容应可变化（与模型随机性一致）；
   - 与单纯拼接的模板话明显不同。

若仍报 `ai_router_required`，说明当前启动后端的进程里仍未读到两个 Router 变量，请确认在同一窗口启动且变量名无误。

### 2.4 本机直连验证 Router（PowerShell）

在同一窗口已设置 `AI_ROUTER_BASE_URL`、`AI_ROUTER_API_KEY`、`AI_ROUTER_MODEL` 的前提下，可用下面任一方式验证**本机到供应商**是否通畅（若此处也超时，多为网络或服务商问题，而非桌面前端）。

**Invoke-RestMethod：**

```powershell
$h = @{
  "Authorization" = "Bearer $env:AI_ROUTER_API_KEY"
  "Content-Type"  = "application/json"
}
$u = "$($env:AI_ROUTER_BASE_URL.TrimEnd('/'))/v1/chat/completions"
$b = '{"model":"' + $env:AI_ROUTER_MODEL + '","messages":[{"role":"user","content":"Reply with one word: hi"}]}'
Invoke-RestMethod -Uri $u -Method Post -Headers $h -Body $b -TimeoutSec 120
```

**curl.exe：**

```powershell
curl.exe -sS --max-time 120 -X POST "$($env:AI_ROUTER_BASE_URL.TrimEnd('/'))/v1/chat/completions" -H "Content-Type: application/json" -H "Authorization: Bearer $env:AI_ROUTER_API_KEY" -d "{\"model\":\"$env:AI_ROUTER_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}"
```

---

## 3. 启动前端

在**另一个**终端、项目根目录执行：

```powershell
npm run dev
```

（Vite + Electron 开发链，需已安装依赖。）

---

## 4. 402 配额验收（PowerShell）

目标：将测试用户的 `used` 调到 `quota - 1`，再执行 1 次多步任务即可稳定出现 **402**，正文含 `quota_exceeded`。

在**已存在 SQLite 库**、且bootstrap 用户已登录过的情况下，于仓库根目录执行：

```powershell
# 可选：指定数据库路径（默认见脚本内）
# $env:SHARED_CORE_DB_PATH="C:\路径\shared-core.sqlite"

# 使用环境变量中的引导邮箱，或显式传邮箱
npm run dev:near-quota
```

或：

```powershell
node shared-core-backend/scripts/dev-near-quota.js you@example.com
```

然后在桌面端 **新建任务** 跑一次；页面应出现 **配额不足** 类提示（含 `402` 或 `quota_exceeded`），不得静默失败。

---

## 5. 注意事项

- **backend 与环境变量必须在同一终端**：换终端需重新 `$env:...`。
- **避免端口 4000 被占用**。
- **不要多开 backend 进程**。

---

## v0.2 说明（收口）

- **执行模型**：step-based execution；每步调用 AI Router，最后一步输出进入结果包。
- **Replay**：结果页 / 历史页的 replay 会重新拉取详情与日志。
