# Rerun DTO

## Trigger Rerun
- Endpoint: `POST /aics/execution/tasks/{taskId}:rerun`

### Response Fields
| field | type | required | note |
|---|---|---:|---|
| taskId | string(uuid) | yes | 新任务ID |
| sourceTaskId | string(uuid) | yes | 原任务ID |
| status | string(TaskStatus) | yes | 新任务当前状态 |

### Example Response
```json
{
  "taskId": "7f7f20f7-2f7e-4f22-bf40-d9331606fc9f",
  "sourceTaskId": "1c50b4f1-6e67-41af-8701-22ed97a38af8",
  "status": "running"
}
```

## Fallback Rule
- 若后端 `:rerun` 暂不可用，前端执行替代流程：  
  1) 读取旧任务输入  
  2) 走 create execution task 新建任务  
  3) 全链路重新执行并持久化  
  4) 新任务带 `sourceTaskId` 映射到旧任务
