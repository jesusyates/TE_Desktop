-- Run 详情：模板建议（不落库为 template表，仅挂在 run 上）

alter table public.v1_task_runs
  add column if not exists template_suggestion jsonb;

comment on column public.v1_task_runs.template_suggestion is 'Controller 建议的可复用模板结构（suggested only）';
