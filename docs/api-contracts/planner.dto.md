# Planner DTO

## Endpoint
- `POST /planner/tasks:plan`

## Request Fields
| field | type | required | note |
|---|---|---:|---|
| prompt | string | yes | 用户一句话 |
| importedMaterials | string[] | yes | 导入资料 |
| clientContext.platform | string | yes | `desktop` |
| clientContext.market | string | yes | `cn` |
| clientContext.version | string | yes | `1.0.0` |

## Request
```json
{
  "prompt": "帮我做一个TikTok视频内容",
  "importedMaterials": ["https://example.com/ref1", "竞品脚本摘要"],
  "clientContext": {
    "platform": "desktop",
    "market": "cn",
    "version": "1.0.0"
  }
}
```

## Response
### Fields
| field | type | required | note |
|---|---|---:|---|
| taskId | string(uuid) | yes | planner 侧任务标识 |
| steps | Step[] | yes | 拆解步骤 |
| steps[].title | string | yes | 步骤名 |
| steps[].stepOrder | number | yes | 顺序 |
| steps[].action | string | yes | action name |
| steps[].input | object | yes | action 输入 |

```json
{
  "taskId": "uuid",
  "steps": [
    { "title": "生成创意", "stepOrder": 1, "action": "generate-content", "input": { "stage": "idea" } },
    { "title": "生成脚本", "stepOrder": 2, "action": "generate-content", "input": { "stage": "script" } }
  ]
}
```

## Fallback Conditions
- Planner API timeout/network error
- Planner API 5xx
- Response schema mismatch

## UI Marker
- `remote planner success` -> `plannerSource = remote`
- `remote planner fallback` -> `plannerSource = fallback`
- `planner failed` -> `plannerSource = failed`
