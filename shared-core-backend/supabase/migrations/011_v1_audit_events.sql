-- AICS 正式审计事件（桌面 / v1；按 user_id 隔离）

create table if not exists public.v1_audit_events (
  id text primary key,
  user_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  market text not null default 'global',
  locale text not null default 'en-US',
  product text not null default 'aics',
  created_at timestamptz not null default now()
);

create index if not exists idx_v1_audit_events_user_created  on public.v1_audit_events (user_id, created_at desc);

comment on table public.v1_audit_events is 'AICS audit events (per user, v1 API)';
