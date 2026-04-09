# Shared Core Backend v0.1

Minimal local backend for AICS execution chain activation.

## Start

```bash
cd shared-core-backend
node server.js
```

Runs at: `http://localhost:4000`

## Implemented APIs

- `POST /planner/tasks:plan`
- `POST /aics/execution/tasks`
- `PATCH /aics/execution/tasks/{taskId}`
- `PUT /aics/execution/tasks/{taskId}/steps/{stepId}`
- `POST /aics/execution/tasks/{taskId}/logs`
- `GET /aics/execution/tasks/{taskId}`
- `GET /aics/execution/tasks?status=`
- `POST /aics/execution/tasks/{taskId}:rerun`

## Storage

In-memory Maps:
- `tasks`
- `stepsByTask`
- `logsByTask`

Data resets after process restart.
