# Execution Step DTO

## Upsert Execution Step
- Endpoint: `PUT /aics/execution/tasks/{taskId}/steps/{stepId}`

### Fields
| field | type | required | note |
|---|---|---:|---|
| taskId | string(uuid) | yes | path + body 冗余校验 |
| stepId | string(uuid) | yes | step 主键 |
| stepOrder | number | yes | 步骤顺序 |
| title | string | yes | UI 展示标题 |
| actionName | string | yes | action 名称 |
| status | string(StepStatus) | yes | pending/running/success/failed/skipped |
| input | object | yes | 入参 |
| output | object | no | 成功输出 |
| error | string | no | 错误描述 |
| errorType | string(ErrorType) | no | 错误分类 |
| latency | number | yes | ms |

### Example
```json
{
  "taskId": "9e9f4e3f-17a3-4f6f-9ff4-00ac76484ddf",
  "stepId": "f33790b9-cd6d-4f77-b8bc-bd1ec8be25d4",
  "stepOrder": 2,
  "title": "生成脚本",
  "actionName": "generate-content",
  "status": "success",
  "input": { "stage": "script" },
  "output": { "script": "..." },
  "latency": 188
}
```
