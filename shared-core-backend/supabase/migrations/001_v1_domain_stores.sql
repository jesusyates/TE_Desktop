-- v1 领域表（Desktop/Web 统一 domain store；RLS 可按项目后在 Supabase 控制台启用）
-- 执行：Supabase SQL Editor 或 supabase db push

create extension if not exists "pgcrypto";

create table if not exists public.v1_tasks (
  id text primary key,
  user_id text not null,
  title text,
  status text not null default 'draft',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_v1_tasks_user_id on public.v1_tasks (user_id);
create index if not exists idx_v1_tasks_created_at on public.v1_tasks (created_at desc);

create table if not exists public.v1_memory_entries (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  entry_key text,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_v1_memory_user on public.v1_memory_entries (user_id);
create index if not exists idx_v1_memory_created on public.v1_memory_entries (created_at desc);

create table if not exists public.v1_templates (
  id text primary key,
  user_id text,
  scope text not null default 'user',
  title text,
  body jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_v1_templates_user on public.v1_templates (user_id);

comment on table public.v1_tasks is 'AICS v1 task store — service role only from backend';
comment on table public.v1_memory_entries is 'AICS v1 memory / preference entries';
comment on table public.v1_templates is 'AICS v1 templates';
