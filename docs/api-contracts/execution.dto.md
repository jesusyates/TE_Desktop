# Execution DTO

## API List
- `POST /aics/execution/tasks` create execution task
- `PATCH /aics/execution/tasks/{taskId}` update execution task status/result
- `PUT /aics/execution/tasks/{taskId}/steps/{stepId}` append/update execution step
- `POST /aics/execution/tasks/{taskId}/logs` append execution log
- `GET /aics/execution/tasks/{taskId}` fetch execution task detail
- `GET /aics/execution/tasks?status=` fetch execution task history
- `POST /aics/execution/tasks/{taskId}:rerun` rerun execution task

## Create Task Request
```json
{
  "taskId": "uuid",
  "prompt": "string",
  "plannerSource": "remote|fallback|failed",
  "status": "pending|planning|ready|running|success|partial_success|failed|cancelled",
  "input": {
    "oneLinePrompt": "string",
    "importedMaterials": []
  }
}
```

## Upsert Step Request
```json
{
  "taskId": "uuid",
  "stepId": "uuid",
  "stepOrder": 1,
  "title": "生成创意",
  "actionName": "generate-content",
  "status": "pending|running|success|failed|skipped",
  "input": {},
  "output": {},
  "error": "string",
  "errorType": "planner_error|action_validation_error|action_execution_error|network_error|persistence_error|safety_blocked",
  "latency": 130
}
```
