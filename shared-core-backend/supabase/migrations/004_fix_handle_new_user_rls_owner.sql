-- admin.createUser / signUp 失败且 GoTrue 报：
--   "Database error creating new user" / unexpected_failure
-- 常见根因：002 对 public.profiles 启用了 RLS，但 on_auth_user_created -> handle_new_user
-- 在插入 profiles 时，函数 owner 若非可绕过 RLS 的角色，则 INSERT 被静默拒绝，整个 auth.users 插入事务回滚。
--
-- 验证（在 SQL Editor 执行）：
--   SELECT p.proname, r.rolname AS owner
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   JOIN pg_roles r ON r.oid = p.proowner
--   WHERE n.nspname = 'public' AND p.proname = 'handle_new_user';
--
-- 期望 owner 为 postgres（Supabase 托管实例默认超级用户，可绕过 RLS）。

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

-- 便于 service_role / 排障（触发器本身不依赖此项，但可与后端 PostgREST 权限对齐）
GRANT USAGE ON SCHEMA public TO postgres, service_role;
GRANT ALL ON TABLE public.profiles TO postgres, service_role;
