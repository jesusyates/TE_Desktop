# Log DTO

## Append Log Request
```json
{
  "taskId": "uuid",
  "stepId": "uuid",
  "level": "info|warn|error",
  "status": "pending|planning|ready|running|success|partial_success|failed|cancelled|skipped",
  "input": {},
  "output": {},
  "error": "string",
  "errorType": "planner_error|action_validation_error|action_execution_error|network_error|persistence_error|safety_blocked",
  "latency": 42
}
```

## Notes
- Every step start/finish/failure writes a log.
- Persistence/logging failure should be marked as `persistence_error`.
