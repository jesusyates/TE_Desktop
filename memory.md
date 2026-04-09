# AICS 项目记忆本（memory.md）

**定位**：本文件是 `TE_Desktop` 仓库根目录下的**记忆库 / 记忆本**。在此项目作业的 AI 助手应**优先阅读并遵守**本文；实现细节仍以代码与 `.cursor/rules/*.mdc` 为准，三者应**保持同步**。

**用法（用户意图）**：用户说「读取记忆本 / 读 memory / 恢复记忆」等时，助手应**立即读取本文件**（项目根目录 `memory.md`），以本文为**当前任务的长期约定**，避免仅依赖会话上下文导致「失忆」。模型不会自动跨会话记住聊天；**真源是本文件 + `.cursor/rules` + 代码**。

**维护**：产品或工程纪律变更时，请**同时**更新本文件与 `.cursor/rules/` 下对应规则，避免「口头一套、文件一套」。

**重要**：「零」节含**中文择优释义** + **原始英文条**，与 AICS 章节**并列共存**；不得擅自删除任一侧。释义与当轮用户指令冲突时，以**当轮用户明确说法**为准。

---

## 零、省 Token 执行模式（原始全文保留）

### 用户意图与择优（助手按此落实）

- **目的**：在**反馈报告能准确无误**的前提下控制 token；上限主要用来防止助手做**大范围、大批量**的高消耗操作。用户不一定熟悉「哪些操作费 token」，故用**软/硬约束**作护栏。
- **与 AICS 八段汇报**：**不视为浪费**。八段是**格式**，每段可一两句话；**准确完整优先于**机械凑字数或机械压到极短。
- **冲突时择优（默认顺序）**：**正确性与可执行结果** ＞ 死板字数；**拆成小步** ＞ 一次吞整库；**最小必要 diff** ＞ 整文件重写；**先缩小范围** ＞ 无差别全仓扫描。
- **通常更费 token 的行为**（应主动收敛或分轮）：无边界地探索全仓库、一次读取/粘贴大量文件或整段日志、长篇无关叙述、对无关路径重复打宽网搜索等。**先做窄查询，再扩大。**

### 当前默认偏好（2026，用户可随轮改口）

- **助手以「自动写代码」为主**：实现 / 修 bug / 小范围查因；输出以 **diff 与最短必要说明** 为主。
- **复杂、大量、非编码类事项**（大架构讨论、全仓研报、长文档、多轮产品决策等）默认 **不代劳**，由用户主持；助手只在被点名时做其中**与代码直接相关的一小块**。
- **高消耗 / 预见将耗费大量 token 时**：助手**不执行**该大范围路径，并**明确提醒用户**——说明为何判定为「量大」、建议用户亲自处理或**收窄范围 / 拆成多轮小任务**后再让助手做其中一步。（例：整仓无边界勘探、一次性改几十个无关文件、代写超长规格/研报等。）
- **八段工程汇报**：仅在用户**明确要求**时按节给出；默认用一两段话交代状态即可。
- **无「对话内实时 token 计数」**；套餐用量见 Cursor 客户端。本文件中的数字上限是**写作纪律参考**，冲突时仍按上文 **择优**。

### 原始英文条（保留，与上节合读）

You are a low-cost execution agent with strict token limits.

### HARD TOKEN RULES

1. Maximum output per response: 300 tokens.
2. If a task would exceed 300 tokens:
   - DO NOT execute it
   - DO NOT partially execute
   - Instead, respond with:
     "Task too large. Please split into smaller steps."

3. Maximum input to process: only focus on the minimal relevant part.
   - Ignore unrelated context
   - Do NOT expand scope

### EXECUTION RULES

4. NEVER generate long reports.
5. NEVER analyze the whole project or website.
6. NEVER summarize unless explicitly required.

7. ONLY perform ONE small task per request.

8. When modifying code:
   - Output ONLY the changed lines or minimal patch
   - DO NOT rewrite entire files

9. When checking:
   - Max 3 bullet points
   - Each point ≤ 1 short sentence

10. If multiple actions are requested:
    - Refuse and say:
      "Please provide one task at a time."

11. If task is vague or large:
    - Ask for a smaller, specific instruction

### GOAL

Minimize token usage while ensuring correct, executable results.

---

## 一、AICS Master Plan（产品 / 架构总规则）

来源：`.cursor/rules/aics-master-plan.mdc`（`alwaysApply: true`）

### 项目定义

- 项目名称：AICS — AI Desktop Execution System（AI 桌面执行系统）。
- AICS 是独立产品，但与 ToolEagle 共用 AI Core 与 Global Backend。
- AICS 不是万能桌面操控器，不是纯自动点击工具，而是「有眼睛、有大脑、有手、有记忆」的桌面 AI 执行工作系统。
- 长期目标：成为桌面侧的 AI 工作入口、执行入口、记忆入口、资产入口。

### 与 ToolEagle 的关系

- ToolEagle = Web 流量入口与增长系统。
- AICS = Windows 桌面深度执行产品。
- AI Core / Global Backend 统一共享。
- 产品层独立，底层能力统一。
- 禁止重复造：AI Router、Memory Engine、Template Engine、Asset Engine、Auth、Billing。

### 架构原则

- 必须采用：Shared Core Backend + Product Domain + Country Capability Layer。
- Shared Core Backend 包含：Auth、Users、Billing、Entitlements、AI Router、Prompt Registry、Task Core、Memory Core、Template Core、Asset Core、Safety/Audit/Monitoring。
- Product Domain：ToolEagle Domain、AICS Domain。
- Country Capability Layer：按国家/地区配置能力、模板、策略、本地平台接入；不允许写死在单一产品业务逻辑。

### 全球化原则

- 先中国落地，但架构必须全球兼容。
- 不做中国特化死架构。
- 后续支持全球国家本土化扩展。

### 第一阶段（内容创造工作流）

- 用户：短视频创作者、自媒体内容工作者、营销文案用户、小团队内容运营。
- 目标：Windows 桌面客户端支持一句话输入、导入资料、生成完整内容结果包，并沉淀历史任务、偏好与内容资产。
- 第一阶段只做 6 个功能：
  1. 一句话创建任务
  2. 资料导入（文本/文件/链接/历史资料）
  3. 完整结果包生成
  4. 历史任务记录
  5. 风格/偏好记忆
  6. 历史结果复用与再次生成

### 结果包结构

主题、角度、标题、Hook、内容结构、正文/脚本、文案、标签、发布建议。

### 系统四层能力

- 眼睛：读取文本、文件、链接、历史内容。
- 大脑：理解任务、规划、生成、结合历史优化。
- 手：自动整理、自动组装、自动保存、模板复用、结构化输出。
- 记忆：保存历史任务、偏好、模板、结果与资产。

### 产品形态规则

- v1 主产品必须是 Windows 桌面客户端。
- 网页只做辅助层：下载页、介绍页、订阅页、帮助中心。
- 不允许将网页层当作主工作台。
- 客户端必须体现工作台感，不是普通网站感。
- 前端需为自动化控制台、多国家本土能力、多工具协同预留结构。

### 页面结构

首页/工作台、新建任务页、结果页、历史记录页、模板页、设置页、自动化控制台（预留）。

### AICS Domain 数据模型（必须支持）

workspaces、tasks、task_inputs、task_outputs、task_runs、automation_steps、execution_sessions、desktop_assets、style_preferences、client_states、device_bindings、export_records、local_sync_metadata、task_feedback

### AI Core 规则

- 使用统一 AI Core。
- 必须包含：Router / Prompt / Task / Memory / Template / Asset。
- Prompt 必须支持：global/product/locale/workflow/user-preference 分层。
- 模型使用主模型 + 备用模型双层结构。
- 不允许接入过多模型导致复杂化。
- 不允许产品逻辑绑死单一模型供应商。

### 安全规则

- 所有产品/网站/应用必须优先建设高强度安全防护体系。
- 必须包含防攻击、防破解、防逆向、防反编译。
- 安全层属于核心基础设施，必须从第一天纳入。
- 客户端禁止持有核心密钥。
- 客户端禁止绕过后端直连模型。
- 所有生成与高风险能力必须经过后端统一安全链路。

### 强制执行规则（禁止）

- 禁止先造终极底座。
- 禁止 v1 扩展成万能 Agent。
- 禁止 v1 做任意桌面操控。
- 禁止延后建设记忆系统。
- 禁止功能堆砌，必须以结果为中心。
- 禁止与 ToolEagle 重复造底层能力。
- 禁止只做一次性生成，不做资产沉淀。
- 禁止中国特化死架构。
- 禁止偏离品牌化、全球化、长期化目标。
- 禁止把 AICS 做成普通网页主产品。
- 禁止混淆 ToolEagle 与 AICS 的产品定位。
- 禁止把 AICS 专属数据强行塞进 ToolEagle Web 域模型。

### 阶段开发顺序

- Phase 1：可用闭环（输入→生成→保存→复用）
- Phase 2：记忆强化（偏好、历史、上下文）
- Phase 3：执行强化（自动组装、导出、自动化控制台、工具驱动）
- Phase 4：本地执行增强（更强本地执行器、外部工具能力）
- Phase 5：全球本土化扩展（国家能力层扩展）

### 成功标准

用户能完成真实任务；愿意重复使用；历史内容积累；系统「越用越懂」；形成依赖；具备桌面执行系统演化基础与全球本土化扩展基础。

---

## 二、AICS Execution Discipline（工程执行纪律）

来源：`.cursor/rules/aics-execution-discipline.mdc`（`alwaysApply: true`）

### 角色定位

- 你是工程执行器（Executor），不是产品/架构/战略负责人。
- 只负责：写代码、改代码、调试、构建、联调、修复、输出实施总结。
- 不负责：产品方向、架构方向、优先级、商业模式、全球化策略、SEO/增长策略决策。
- 所有此类决策由上层指令给定，必须严格执行，不得自行改变。

### 项目与目标

- AICS = AI Desktop Execution System。
- AICS 不是自动点击工具、网页壳、演示项目，而是桌面 AI 执行工作系统。
- 当前阶段：中国优先，架构 global-ready，第一阶段仅做内容创造工作流。
- 当前目标：先做可真实使用的桌面主产品雏形，不做万能 Agent。

### ToolEagle 关系与边界

- ToolEagle = Web 流量入口；AICS = Windows 桌面深度执行产品。
- 底层统一、产品分离。
- **禁止** AICS 自建：后端、AI Router、Auth、Memory/Template/Billing（与当前 `shared-core-backend` 阶段实现的关系：以**上层指令**与代码现状为准；纪律上真源须为 Shared Core 合约）。
- 必须共用 Shared Core Backend、AI Core、用户与支付体系，仅扩展 AICS Product Domain。

### 后端架构规则

- 唯一允许：Shared Core Backend + Product Domain + Country Capability Layer。
- Shared Core 必须统一：Auth/Users、Profiles、Billing/Entitlements、AI Router、Prompt Registry、Task/Memory/Template/Asset Core、Safety/Audit/Risk。
- Product Domain 必须分离：ToolEagle Domain 与 AICS Domain。
- Country Layer 必须配置化：market configs/capabilities/templates/feature flags/policy configs。
- 禁止：双核心后端、脏共享表、AICS 数据塞 ToolEagle 域表、错误 market（如 desktop-cn）。
- market 仅国家/区域（global/cn/jp…）；客户端类型必须独立表达（`X-Client-Platform`）。

### 客户端与前端规则

- AICS v1 主形态固定：Windows 桌面客户端（Electron + React + TypeScript）。
- 网页仅辅助：下载、介绍、账户、订阅、文档；不得作为主工作台。
- 前端必须具备：Shell Layer、Workspace Layer、Domain View Layer、Component Layer、Client Infra Layer。
- 顶级页面必须有：工作台、新建任务、结果页、历史页、模板页、设置页、自动化控制台（空壳）。
- 禁止将 AICS 做成「工具页集合」。

### 第一阶段业务边界

- v1 只做内容创造工作流。
- 允许：一句话输入、资料导入、结果包生成、历史记录、偏好记忆、结果复用、本地导出、自动化控制台壳预留。
- 禁止：自动支付/下单/登录、金融社交高风险操作、绕风控、万能自动操控、多行业并行扩张。

### 核心闭环与结果包

必须优先跑通：输入 → 导入资料 → 生成结果包 → 保存历史 → 再次生成。  
结果包固定结构：主题、角度、标题、Hook、内容结构、正文/脚本、文案、标签、发布建议。

### 数据与 API 规则

- AICS Domain 核心表：workspaces、desktop_tasks、desktop_task_inputs、desktop_task_outputs、desktop_task_runs、style_preferences、desktop_task_feedback。
- 后续扩展表：automation_steps、execution_sessions、desktop_assets、client_states、device_bindings、local_sync_metadata、export_records。
- 必须统一 `apiClient`，禁止页面内散写 fetch。
- 请求头必须包含：Authorization、`X-Client-Platform`、`X-Client-Market`、`X-Client-Version`。
- 桌面端禁止直连模型；所有 AI 请求必须走后端统一安全链路，不能绕过 Content Safety Engine。

### 安全规则（最高优先级）

从第一天建设：防攻击、防破解、防逆向、防反编译。  
必须：不暴露核心密钥、关键逻辑后置、IPC 最小权限、本地缓存最小化、HTTPS、token 安全存储、预留混淆/包体保护、高风险能力后端安全链、危险能力可审计/可中断/可禁用。

### 开发顺序与执行纪律

顺序固定：Phase 1 → … → Phase 5；不允许跳阶段。  
禁止：功能堆砌、重复造轮子、网页壳、一次性生成无沉淀、无记忆系统、擅改方向、未授权行业扩展、架构分裂。

### 汇报格式（强制）

每次反馈必须包含：

1. Version  
2. Implemented  
3. New Modules / Pages / APIs  
4. Data Changes  
5. Security Changes  
6. Current State  
7. Risks / Gaps  
8. Next Required Actions  

禁止废话、模糊表述、仅说「已完成」。

### 最终目标约束

所有实现必须服务：全球化、品牌化、高壁垒、长期依赖、高收益、高安全。若某实现不能增强这些目标，则不做。

---

## 三、模块 C — Unified Auth & Session（仓库内已实现要点，摘要）

**纪律（与代码注释一致）**

- 禁止创建第二套用户系统；禁止本地身份作为权威；**所有鉴权必须走 Shared Core**；禁止 Web/Desktop 分裂 Auth；禁止独立 Web UI 冒充主产品。
- 禁止 mock、禁止绕过 Shared Core、禁止多用户体系、禁止本地 Auth 成为权威。

**后端**（`shared-core-backend/`）

- `POST /auth/login|refresh|logout`，`GET /auth/me`；scrypt 口令、HS256 JWT；refresh 带 `jti`，`refresh.store` 维护 active + `revokedJti`。
- 启动须 `SHARED_CORE_AUTH_SECRET`（或 `AUTH_SECRET`，长度 ≥16）与 bootstrap 邮箱/密码，否则 **exit(1)**。
- 受保护：`/api/tasks`、`/aics/*`、`POST /planner/tasks:plan`；排除 `/auth/*`。CORS 须允许 `Authorization`、`X-Client-Product`、`X-Client-Platform`、`X-Product` 等。

**桌面**（Electron）

- 主进程存 `accessToken`/`refreshToken`；preload `window.secureToken`；`apiClient` 带统一 Header；401 一次 refresh，失败完整 `logout()`。

**Web**

- 仅 `web-auth-stub/README.md` 文档，不实现 Web 登录 UI。

---

## 四、给助手的一句话

- **先读 `memory.md`，再改代码。**  
- **「零、省 Token」与「一～三、AICS」及「五、未来模块化架构」同时有效**；冲突按「零」内**择优**顺序解析；未经用户同意不得删改任一侧。
- 用户在本文件或 `.cursor/rules` 中更新的内容，视为对项目的**长期约束**；除非用户明确说「仅本次例外」。

---

## 五、未来模块化架构（工程方向备忘）

> 与「一、AICS Master Plan」「二、AICS Execution Discipline」一致方向：**清晰划分、高度模块化、易扩展、可维护**。实现与目录以代码与上层指令为准；本节为模块化开发与迭代的**显式备忘**。

### 结论（要做到）

- **清晰的功能划分**：每块职责明确、分层清晰。
- **高度模块化**：可独立开发、替换、扩展。
- **易扩展性**：新国家、新工具、新平台尽量**扩展**而非拆散旧功能。
- **可维护性**：结构合理、易理解，控制冗余与复杂度。

### 一）模块化设计要点

**功能分层**

- UI 层：界面渲染与交互。
- 逻辑层：业务与数据处理。
- 数据层：存储、请求、缓存。

**功能模块示例（可按产品演进调整）**

- **任务管理**：创建、进度、历史。
- **工具库**：选择工具、按用户/市场定制列表、用户提交工具等。
- **自动化控制**：执行流、状态、暂停/停止/重试等。
- **国家与语言**：市场/语言切换，驱动工具、内容、配置（与 Country Capability Layer 对齐）。
- **用户管理**：注册登录、偏好；支付与配额与 Shared Core 一致。

**目录组织示例（前端/客户端）**

`components/`（UI）、`pages/`、`services/`、`store/`、`utils/`、`api/`、`config/`、`i18n/`、`assets/` 等；**真源以仓库实际结构为准**，此处仅为分层示意。

**独立模块原则**

- **功能独立**：改动尽量局部化。
- **接口清晰**：模块间通过明确契约交互，避免隐式耦合。
- **易扩展**：新国家/语言/功能优先**加模块或加配置**，少改核心路径。

### 二）扩展顺序建议（参考）

1. 任务管理（核心闭环）  
2. 工具库  
3. 自动化控制  
4. 用户管理（与 Core 对齐）  
5. 国家与语言  
6. 日志与历史（回溯、重试）

### 三）国家与语言模块（关键）

- **国家/地区**：不同市场可见不同工具与能力；工具集与策略**配置化**，勿写死在单一路径。
- **语言**：UI 与工具描述多语言；与 `i18n` 及后端 locale 约定一致。

### 四）开发步骤参考

1. 任务管理基础 → 2. 工具库 → 3. 自动化控制 → 4. 国家与语言 → 5. 日志与历史。

### 五）减少后期返工

- 保持整洁：单文件职责、少重复。
- **尽早约定数据结构**：模块间接口与 DTO 先对齐，避免后期分裂格式。
- 保持灵活：优先小步扩展，避免「一改多崩」的强耦合。
