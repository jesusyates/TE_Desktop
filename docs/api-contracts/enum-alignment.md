# Enum Alignment Check (alpha.4)

## Frontend Canonical Enums
- TaskStatus: `pending, planning, ready, running, success, partial_success, failed, cancelled`
- StepStatus: `pending, running, success, failed, skipped`
- LogLevel: `info, warn, error`
- ErrorType: `planner_error, action_validation_error, action_execution_error, network_error, persistence_error, safety_blocked`
- planner_source: `remote, fallback, failed`

## Backend Alignment Status
- Current backend live check blocked (baseURL unavailable), so enum runtime alignment is **unverified**.
- Contract-level expectation已写入 DTO 文档，等待后端确认并回传真实枚举列表。
