# History DTO

## Endpoint
- `GET /aics/execution/tasks?status=`
- `GET /aics/execution/tasks/{taskId}`

## Query Fields
| field | type | required | note |
|---|---|---:|---|
| status | string(TaskStatus) | no | 可选过滤 |

## Fetch History Response
### Fields
| field | type | required |
|---|---|---:|
| id | string(uuid) | yes |
| prompt | string | yes |
| status | string(TaskStatus) | yes |
| plannerSource | string | yes |
| createdAt | string(ISO8601) | yes |
| updatedAt | string(ISO8601) | no |
| lastErrorSummary | string | no |
| steps | Step[] | yes |

```json
[
  {
    "id": "uuid",
    "prompt": "string",
    "status": "success|partial_success|failed|running",
    "plannerSource": "remote|fallback|failed",
    "createdAt": "2026-03-31T12:00:00.000Z",
    "updatedAt": "2026-03-31T12:01:00.000Z",
    "lastErrorSummary": "string",
    "steps": []
  }
]
```

## Fetch Task Detail Response
### Fields
| field | type | required |
|---|---|---:|
| task | object | yes |
| steps | object[] | yes |
| logs | object[] | yes |

```json
{
  "task": {},
  "steps": [],
  "logs": []
}
```

## Replay vs Rerun
- `replay`: read `task + steps + logs`, rebuild chain as read-only timeline.
- `rerun`: use historical input to start a brand-new execution.
