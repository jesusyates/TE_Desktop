-- Controller v1 / 执行主链：run 扩展字段

alter table public.v1_task_runs
  add column if not exists steps jsonb not null default '[]'::jsonb;

alter table public.v1_task_runs
  add column if not exists result jsonb;

alter table public.v1_task_runs
  add column if not exists result_source_type text not null default 'mock';

alter table public.v1_task_runs
  add column if not exists updated_at timestamptz not null default now();

comment on column public.v1_task_runs.steps is '执行步骤状态机 JSON';
comment on column public.v1_task_runs.result is '执行产物（mock 或未来 AI）';
comment on column public.v1_task_runs.result_source_type is 'mock | ai | ...';
