# Execution Tables Review (alpha.4)

## Final Tables

### execution_tasks
- id (pk), desktop_task_id, status, planner_source, input, output, error_type, error, latency, started_at, ended_at, created_at

### execution_steps
- id (pk), execution_task_id (fk), step_order, action_name, status, input, output, error_type, error, latency, started_at, ended_at, created_at

### execution_logs
- id (pk), execution_task_id (fk), execution_step_id (fk nullable), level, status, error_type, input, output, error, latency, created_at

## Index Suggestions
```sql
CREATE INDEX idx_execution_tasks_created_at ON execution_tasks (created_at DESC);
CREATE INDEX idx_execution_tasks_status_created_at ON execution_tasks (status, created_at DESC);
CREATE INDEX idx_execution_steps_task_order ON execution_steps (execution_task_id, step_order);
CREATE INDEX idx_execution_logs_task_created_at ON execution_logs (execution_task_id, created_at ASC);
```

## Query Examples

### history
```sql
SELECT id, status, planner_source, created_at
FROM execution_tasks
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 50;
```

### detail
```sql
SELECT * FROM execution_tasks WHERE id = $1;
SELECT * FROM execution_steps WHERE execution_task_id = $1 ORDER BY step_order ASC;
SELECT * FROM execution_logs WHERE execution_task_id = $1 ORDER BY created_at ASC;
```

### replay timeline
```sql
SELECT s.step_order, s.status, s.latency, s.error_type, l.level, l.error
FROM execution_steps s
LEFT JOIN execution_logs l ON l.execution_step_id = s.id
WHERE s.execution_task_id = $1
ORDER BY s.step_order ASC, l.created_at ASC;
```
