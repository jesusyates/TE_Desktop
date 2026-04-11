-- Result快照 + History摘要（执行沉淀；service role）

create table if not exists public.v1_results (
  id text primary key,
  task_id text not null,
  user_id text not null,
  result jsonb not null default '{}'::jsonb,
  result_source_type text not null default 'mock',
  success boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_v1_results_user_created on public.v1_results (user_id, created_at desc);
create index if not exists idx_v1_results_task on public.v1_results (task_id);

comment on table public.v1_results is 'run 结果快照，id = run_id';

create table if not exists public.v1_history (
  id text primary key,
  task_id text not null,
  run_id text not null,
  user_id text not null,
  prompt text not null default '',
  status text not null default 'success',
  result_source_type text not null default 'mock',
  summary text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_v1_history_user_created on public.v1_history (user_id, created_at desc);
create index if not exists idx_v1_history_run on public.v1_history (run_id);

comment on table public.v1_history is '用户可浏览的执行历史摘要';
