-- AICS v1：public.profiles（业务扩展）+ auth.users 插入后自动建档
-- 执行前请确认已启用 Supabase Auth。service_role 客户端绕过 RLS。

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  username text,
  avatar_url text,
  market text not null default 'global',
  locale text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (email);

comment on table public.profiles is 'Business profile; auth id = auth.users.id; no passwords.';

create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.set_profiles_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, market, locale)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'market', 'global'),
    coalesce(new.raw_user_meta_data ->> 'locale', 'en')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- 若后续未为 profiles 配置合适 policy，且 handle_new_user() 的 owner 非 postgres 等特权角色，
-- 触发器内 INSERT 可能被 RLS 拦截，导致 admin.createUser 报 Database error creating new user。
-- 部署后请执行 004_fix_handle_new_user_rls_owner.sql（或手动 ALTER FUNCTION ... OWNER TO postgres）。
alter table public.profiles enable row level security;
