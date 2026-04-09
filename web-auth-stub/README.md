# Web 端接入预留（Stub）

本目录**仅作说明**：不得在此实现独立 Web UI、登录页或第二套认证产品层。

## 接口说明（与桌面共用 Shared Core）

基址示例：`http://localhost:4000`（与 Core 部署一致）。

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/auth/login` | body：`{ "email", "password" }`。成功返回 `access_token`、`refresh_token`、`user`。 |
| `POST` | `/auth/refresh` | body：`{ "refresh_token" }`。校验并轮转 refresh（新 `jti`），返回新的双 token + `user`。 |
| `GET` | `/auth/me` | Header：`Authorization: Bearer <access_token>`。返回 `{ user: { user_id, email, market, locale } }`。 |
| `POST` | `/auth/logout` | body：`{ "refresh_token" }`（**必填**，用于吊销对应 `jti`）。 |

**C-2**：`POST /auth/login`、`/auth/refresh`、`/auth/logout` 与 `GET /auth/me` 均须携带 **`X-Client-Product`: `aics` \| `tooleagle`**、**`X-Client-Platform`: `desktop` \| `web`**（可与 `X-Product` 兼容 product）；缺省或非法值 → **400**。受保护业务路由同上 + 合法 **Bearer access_token**。

受保护业务路由（示例）：`POST /api/tasks`、`/aics/*`、`POST /planner/tasks:plan` 等须在 Bearer 合法时访问；`/auth/*` 不设会话门槛。

## Header 约定

所有业务请求建议统一携带：

- `Authorization: Bearer <access_token>`（受保护 API 必需）
- `X-Client-Product: aics`（或与产品一致的值；兼容 `X-Product`）
- `X-Client-Platform: web`（或 `desktop` 等）
- `X-Client-Market`、`X-Client-Version`：与业务及客户端版本一致

CORS 预检须允许：`Authorization`、`X-Client-Product`、`X-Client-Platform`、`X-Product`、`Content-Type` 等。

## 禁止项（须逐条满足）

- **禁止创建第二套用户系统**
- **禁止本地身份作为权威**
- **所有鉴权必须走 Shared Core**
- **禁止 Web / Desktop 分裂 Auth**
- **禁止独立 Web UI**（本目录仅文档 Stub；不得实现完整 Web 登录工作台作为主产品）

**最终强约束**：禁止 mock；禁止绕过 Shared Core；禁止多用户体系；禁止本地 Auth 成为权威。

补充：不得将浏览器存储自建用户目录作为真源；refresh 轮转、吊销须与 Core 一致。
