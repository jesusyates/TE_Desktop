# Execution Log DTO

## Append Execution Log
- Endpoint: `POST /aics/execution/tasks/{taskId}/logs`

### Fields
| field | type | required | note |
|---|---|---:|---|
| taskId | string(uuid) | yes | 任务ID |
| stepId | string(uuid) | no | 可为空（任务级日志） |
| level | string(LogLevel) | yes | info/warn/error |
| status | string(TaskStatus or StepStatus) | yes | 当前状态 |
| input | object | no | 关键输入 |
| output | object | no | 关键输出 |
| error | string | no | 错误文案 |
| errorType | string(ErrorType) | no | 分类 |
| latency | number | yes | ms |

### Example
```json
{
  "taskId": "9e9f4e3f-17a3-4f6f-9ff4-00ac76484ddf",
  "stepId": "f33790b9-cd6d-4f77-b8bc-bd1ec8be25d4",
  "level": "error",
  "status": "failed",
  "error": "planner timeout",
  "errorType": "network_error",
  "latency": 30000
}
```
