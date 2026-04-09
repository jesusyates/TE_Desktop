# AICS Architecture Rules

## 核心目标

构建可扩展的 **Computer Automation** 客户端架构：能力可插拔、可组合，执行过程可观测、可回放（以事件为准）。

---

## 一、能力系统（Capability System）

1. 所有 **computer** 能力必须在 **Capability Registry** 注册。
2. 每个能力统一接口：`(input, emitEvent) => Promise<void>`。
3. 能力与具体 UI 解耦；能力模块禁止依赖页面组件。
4. 新能力**不得**修改已有能力实现（只增注册与独立模块）。

---

## 二、能力解析（Capability Resolver）

1. **禁止**在 session（或其它编排层）用 **if/else 树** 判断「选哪个能力」。
2. Resolver **只消费 Task Analyzer** 输出的 `candidateCapabilities`（通过 `resolveCapabilityFromCandidates` 等在注册表中解析 `id`），**不得**再用独立关键词规则选能力。
3. Resolver 的替换不得迫使业务代码散落各处的硬编码分支。

---

## 三、执行与事件流（Execution / Event Stream）

1. **Computer** 执行过程的对外输出**只能是** `ComputerExecutionEvent` **流**（及由其推导的状态）。
2. UI **禁止**直读执行器内部状态；**只能**消费 **reducer** 得到的 ViewModel。
3. **Reducer** 为该类展示状态的**唯一**归约来源。

---

## 四、Session 约束

1. Session 只做 **orchestration**（生命周期、订阅、把事件交给面板）。
2. **禁止**在 session 中实现具体业务步骤或可复用领域逻辑。
3. Session **只应**调用已通过 Resolver 得到的 `capability.run(...)`（及与模式无关的通用流水线钩子）。

---

## 五、扩展（必须兼容）

系统演进需兼容（不必一次做完，但架构不得堵死）：

- 多能力组合（Planner）
- `priority` 与冲突消解
- `fallback`（失败切换能力）
- 人工接管（Human-in-the-loop）

---

## 六、禁止事项

1. 硬编码「能力路由」分支（须走 Registry + Resolver）。
2. UI 直接调用 executor。
3. 跳过事件流直接改 Computer 面板展示状态。
4. 能力之间的实现层相互依赖（可共享纯工具库，不共享业务流程闭环）。

---

## 七、演进方向

**Task Analyzer → Capability Planner → Multi-step Execution**；当前实现须保持与该方向 API/边界一致，避免临时捷径破坏替换路径。

---

## 八、任务分析（Task Analyzer）

1. **所有**用户输入必须先进入 **Task Analyzer** 做统一解析（`analyzeTask`）。
2. **禁止**在多个模块分别解析 `mode` / `intent` / `capability`（词表与推导只维护在 Analyzer 侧）。
3. Task Analyzer 负责输出：
   - `requestedMode`
   - `resolvedMode`
   - `intent`
   - `candidateCapabilities`
   - `metadata`
4. **Session** 与 **Resolver** 只能消费 Analyzer 的上述结果，**不得**重复做关键词判断来替代或旁路 Analyzer。

---

## 九、执行规划（Planner / Orchestrator）

1. 单能力执行只是多步骤执行的特例。
2. 所有任务在执行前，必须可被表达为一个 **Task Plan**。
3. Task Plan 由多个步骤组成，每步必须绑定一种执行类型：
   - **capability**（computer 能力）
   - **content action**（内容生成或处理）
   - **human confirmation**（人工确认节点）
4. Session 只负责编排计划执行，不负责定义业务步骤。
5. **Planner** 负责：
   - 将 Task Analyzer 的结果转为 Task Plan
   - 决定是否需要多步骤执行
   - 决定是否需要用户确认
6. 执行系统必须支持：
   - 串行执行（step1 → step2 → step3）
   - 中断 / 停止
   - 失败处理（进入 error 或 fallback）
7. 后续多能力组合、失败回退、人工接管，必须建立在 Task Plan 之上。

---

## 十、失败与人工接管（Fallback / Human-in-the-loop）

1. **Planner** 必须可扩展支持失败回退（**fallback**）。
2. **高风险**或**不确定**步骤必须可扩展为 **human confirmation** 节点。
3. **人工确认**节点未完成前，执行**不得**自动进入后续步骤。
4. 后续的**停止**、**接管**、**重试**，必须建立在 **Task Plan** 与 **Step** 状态之上。

---

## 十一、内容执行（Content Execution）

1. **content action** 必须通过统一的 **Content Executor** 执行。
2. **Session** 不得直接在步骤执行中生成内容结果。
3. **content step** 与 **capability step** 一样，必须作为 **Task Plan** 的正式步骤执行。
4. **content** 执行结果必须进入**统一结果链路**，供 **Timeline**、**History**、**Template** 复用。

---

## 十二、结果系统（Result System）

1. 所有任务输出必须统一为 **Result** 结构（而非分散在组件或局部状态中）。
2. **Result** 必须来源于 **Task Plan** 的执行过程（**content** 或 **capability** step）。
3. **UI** 不得自行拼接或生成最终结果内容。
4. **Result** 必须可被以下模块复用：
   - **Timeline** 展示
   - **History** 回放
   - **Template** 保存
5. 不同类型的结果（**content** / **computer**）可以有不同结构，但必须在**统一 Result 抽象**下管理。

---

## 十三、最优方案选择（Optimal Execution Selection）

1. 在存在多个可行能力（capabilities）或执行路径时，系统必须选择**最优方案**执行，而不是简单按注册顺序或静态优先级。

2. “最优方案”可基于以下因素综合决策：

   * 成功率（稳定性）
   * 执行成本（时间 / 资源）
   * 用户体验（是否需要额外确认 / 是否可见）
   * 上下文适配（用户意图、附件、环境）

3. **Planner / Resolver / 后续模型决策层**必须支持该选择逻辑，但具体策略可演进（规则 → 模型）。

4. 禁止在多个能力中：

   * 固定写死使用某一个能力
   * 或仅按注册顺序选择能力

5. 当前阶段（规则驱动）可使用：

   * priority
   * intent 匹配
   * 简单评分

   但必须保证未来可以平滑替换为模型决策（Model-based routing）。

6. 所有“选择行为”必须集中在：

   * Analyzer / Planner / Resolver 层
     不得散落在 Session / UI / Executor 中。

---

## 十四、全球统一架构（Global Unified Architecture）

1. AICS 必须采用三层架构：

   * **Shared Core Backend**
   * **Client Capability Layer**
   * **Country Capability Layer**

2. **Shared Core Backend** 必须统一承担：

   * 账号与身份
   * 支付与订阅
   * 用量计费
   * 任务中心
   * 结果系统
   * 模板系统
   * 记忆系统
   * 安全策略中心
   * 能力注册与审核
   * 全球化配置
   * 审计与风控

3. **Desktop / Web / Mobile** 允许前端形态不同，但不得各自实现独立核心业务系统。

4. **Desktop** 专属本地能力必须通过 **Local Execution Runtime** 实现，不得强行塞入纯 Web/Server 逻辑。

5. **安全系统**必须采用双层机制：

   * 后端统一策略中心
   * 端侧执行前拦截

6. **国家与地区差异**必须通过 **Country Capability Layer** 管理，不得散落在前端与业务代码中。

7. **Shared Core Backend** 是唯一核心后端；**Desktop 本地执行服务**不是第二套核心后端，而是**端侧执行运行时**。

---
