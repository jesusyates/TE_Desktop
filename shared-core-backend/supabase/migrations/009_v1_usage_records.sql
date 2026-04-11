-- AI / Run 使用量明细（与 billing entitlement.used 联动由应用层 atomicConsume 完成）

create table if not exists public.v1_usage_records (
  id text primary key,
  user_id text not null,
  run_id text,
  provider text not null default 'openai',
  model text not null default '',
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  total_tokens int not null default 0,
  cost numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_v1_usage_user on public.v1_usage_records (user_id);
create index if not exists idx_v1_usage_created on public.v1_usage_records (created_at desc);

comment on table public.v1_usage_records is 'AICS token/cost usage per AI call';
