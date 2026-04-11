-- 核心行：market / locale / product（全球化维度）+ 用户设置

alter table public.v1_tasks
  add column if not exists market text not null default 'global',
  add column if not exists locale text not null default 'en-US',
  add column if not exists product text not null default 'aics';

alter table public.v1_task_runs
  add column if not exists market text not null default 'global',
  add column if not exists locale text not null default 'en-US',
  add column if not exists product text not null default 'aics';

alter table public.v1_results
  add column if not exists market text not null default 'global',
  add column if not exists locale text not null default 'en-US',
  add column if not exists product text not null default 'aics';

alter table public.v1_history
  add column if not exists market text not null default 'global',
  add column if not exists locale text not null default 'en-US',
  add column if not exists product text not null default 'aics';

alter table public.v1_usage_records
  add column if not exists market text not null default 'global',
  add column if not exists locale text not null default 'en-US',
  add column if not exists product text not null default 'aics';

alter table public.v1_templates
  add column if not exists market text not null default 'global',
  add column if not exists locale text not null default 'en-US',
  add column if not exists product text not null default 'aics';

create table if not exists public.v1_user_settings (
  user_id text primary key,
  default_model text not null default 'gpt-4o-mini',
  auto_write_memory boolean not null default true,
  allow_ai boolean not null default true,
  preferred_language text not null default 'en-US',
  updated_at timestamptz not null default now()
);

comment on table public.v1_user_settings is 'AICS 用户级设置（桌面/Web 共用）';

create table if not exists public.v1_feature_flag_overrides (
  user_id text primary key,
  flags jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.v1_feature_flag_overrides is '每用户 feature flag 覆盖（合并默认与市场规则）';
