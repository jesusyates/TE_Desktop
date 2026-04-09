# Desktop Local Execution Runtime（桌面本地执行运行时）

> 定位：运行在**用户设备**上的执行与桥接层；**承接本地能力**，**服从** Shared Core 的策略、注册与审计约束。**不是**与核心后端平级的「第二套核心业务后端」。

---

## 组件边界

| 组件 | 作用 |
|------|------|
| **File Executor** | 本地文件扫描、组织、复制、命名等在策略允许范围内的文件操作 |
| **App Control Executor** | 与应用进程/窗口协作的自动化步骤（非替代 OS 安全模型） |
| **Browser Automation Executor** | 受控的浏览器侧自动化通道（范围由策略与权限限定） |
| **Local Permission Guard** | 端侧权限事实与 OS 级授权状态的衔接；与核心 Capability 声明对齐 |
| **Local Safety Gate** | 执行前拦截（规则/名单/与核心策略快照对齐）；**不替代** Safety Policy Service |
| **Local Event Bridge** | 将本地执行事件汇入统一事件模型，供 UI 与上报 |
| **Local Cache / Queue** | 离线或弱网时的暂存与重试；**权威状态仍在核心** |
| **Screenshot / Window State Collector** | 可选取证与状态采集；受隐私与合规配置约束 |

---

## 与核心的关系

| 陈述 | 说明 |
|------|------|
| **运行位置** | 用户设备进程空间，与 Desktop 壳集成 |
| **执行内容** | 仅**本地**可完成的能力步骤；不承载账号、计费、任务真理的独立副本 |
| **策略约束** | Safety、Capability 可用性、市场开关以 **Shared Core** 下发或校验为准 |
| **非核心后端** | 不提供与 Task/Billing/User 对等的「第二套」领域 API；只暴露运行契约给客户端编排层 |

---

## 原则

- **Local Runtime = 执行器 + 端侧闸门 + 事件桥**，不是业务数据中心。
- 安全：**后端策略中心**为权威；**Local Safety Gate** 为执行前必过的一层。
- 与 **Client Capability Layer** 中的 Desktop 条目配合：Desktop「能做什么」由层描述，「在机器上怎么做」由本 Runtime 承担。
