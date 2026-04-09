# Computer Capability System（D-5-4）

## 如何新增能力

1. **实现执行器**（若尚未存在）：`renderer/src/modules/computer/executors/yourExecutor.ts`  
   导出函数必须满足：`(input, emitEvent) => Promise<void>`，其中 `emitEvent` 产出 `ComputerExecutionEvent`。

2. **定义能力对象**：在同目录新增 `yourCapability.ts`，导出 `ComputerCapability`：
   - `id`：稳定唯一（如 `excel.fill`），且须写入 Task Analyzer 的 `candidateCapabilities` 推导逻辑
   - `name` / `description`：给人看的说明
   - `priority`（可选）：数字越大越优先（`resolveCapabilityFromCandidates` 同 id 冲突时）
   - `match(ctx)`：**须委托 `analyzeTask`**（或等价单源），禁止自建关键词表；仅用于测试/工具等非 session 路径
   - `run(ctx, emitEvent)`：调用你的 executor，**禁止**在 `useExecutionSession` 写分支

3. **Task Analyzer**：在 `taskAnalyzer.ts` 中为对应 `intent` 填入本能力的 `id` 到 `candidateCapabilities`。

4. **注册一次**：在 `capabilityRegistry.ts` 的 `computerCapabilityRegistry` 数组中**追加一行** import + 数组项。

5. **验收**：Session 经 Analyzer → `resolveCapabilityFromCandidates` → `capability.run`；`ComputerExecutionPanel` 消费事件流。

无需改 session 路由：会话只消费 `analyzeTask` 结果与 `resolveCapabilityFromCandidates`。

## 预留扩展

- 更高优先级：调高 `priority`
- 组合能力 / 失败切换：可在 `ComputerCapability` 上扩展字段，并在 `capabilityResolver` 内实现对应策略（后续迭代）
