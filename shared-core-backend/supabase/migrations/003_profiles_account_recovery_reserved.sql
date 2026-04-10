-- 账号恢复预留字段（业务层；认证仍以 Supabase Auth 为准）
alter table public.profiles
  add column if not exists backup_email text,
  add column if not exists phone_backup text,
  add column if not exists mfa_enabled boolean not null default false;

comment on column public.profiles.backup_email is 'Reserved: secondary recovery email (not yet enforced)';
comment on column public.profiles.phone_backup is 'Reserved: backup phone for recovery/MFA flows';
comment on column public.profiles.mfa_enabled is 'Reserved: MFA enrolled flag; enforce in future phase';

create index if not exists profiles_backup_email_idx on public.profiles (backup_email)
  where backup_email is not null;
