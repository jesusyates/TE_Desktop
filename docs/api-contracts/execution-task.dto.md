# Execution Task DTO

## Create Execution Task
- Endpoint: `POST /aics/execution/tasks`

### Fields
| field | type | required | note |
|---|---|---:|---|
| taskId | string(uuid) | yes | 前端生成或后端分配 |
| prompt | string | yes | 用户一句话输入 |
| sourceTaskId | string(uuid) | no | rerun 来源任务 |
| runType | string(`new`,`rerun`) | no | 默认 `new` |
| plannerSource | string(`remote`,`fallback`,`failed`) | yes | planner 来源 |
| status | string(TaskStatus) | yes | 初始 `ready/planning` |
| input | object | yes | 输入对象 |

### Example
```json
{
  "taskId": "9e9f4e3f-17a3-4f6f-9ff4-00ac76484ddf",
  "prompt": "帮我做一个TikTok视频内容",
  "sourceTaskId": "1c50b4f1-6e67-41af-8701-22ed97a38af8",
  "runType": "rerun",
  "plannerSource": "remote",
  "status": "ready",
  "input": {
    "oneLinePrompt": "帮我做一个TikTok视频内容",
    "importedMaterials": []
  }
}
```

## Update Execution Task
- Endpoint: `PATCH /aics/execution/tasks/{taskId}`

### Fields
| field | type | required |
|---|---|---:|
| status | string(TaskStatus) | yes |
| result | object | no |
| lastErrorSummary | string | no |
