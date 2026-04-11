-- 计费镜像 + 任务运行最小表（后端 dual_write / cloud_primary）

create table if not exists public.v1_entitlements (
  user_id text not null,
  product text not null,
  plan text not null,
  quota integer not null,
  used integer not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, product)
);

create index if not exists idx_v1_entitlements_user on public.v1_entitlements (user_id);

comment on table public.v1_entitlements is 'SQLite entitlements 云镜像 — service role only';

create table if not exists public.v1_task_runs (
  id text primary key,
  task_id text not null,
  user_id text not null,
  status text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_v1_task_runs_user on public.v1_task_runs (user_id);
create index if not exists idx_v1_task_runs_task on public.v1_task_runs (task_id);

comment on table public.v1_task_runs is 'AICS 最小 task run 记录 — service role only';
