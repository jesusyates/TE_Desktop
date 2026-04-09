CREATE TABLE desktop_tasks (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  status VARCHAR(32) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE desktop_task_inputs (
  id UUID PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES desktop_tasks(id),
  one_line_prompt TEXT NOT NULL,
  materials JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE desktop_task_outputs (
  id UUID PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES desktop_tasks(id),
  title TEXT NOT NULL,
  hook TEXT NOT NULL,
  content_structure TEXT NOT NULL,
  body TEXT NOT NULL,
  copywriting TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  publish_suggestion TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE desktop_task_runs (
  id UUID PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES desktop_tasks(id),
  run_status VARCHAR(32) NOT NULL,
  error_message TEXT,
  latency_ms INT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE style_preferences (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  preference_key VARCHAR(64) NOT NULL,
  preference_value JSONB NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE desktop_task_feedback (
  id UUID PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES desktop_tasks(id),
  user_id UUID NOT NULL,
  score INT NOT NULL,
  comment TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE execution_tasks (
  id UUID PRIMARY KEY,
  desktop_task_id UUID REFERENCES desktop_tasks(id),
  status VARCHAR(16) NOT NULL,
  planner_source VARCHAR(16) NOT NULL,
  input JSONB NOT NULL,
  output JSONB,
  error_type VARCHAR(64),
  error TEXT,
  latency INT,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE execution_steps (
  id UUID PRIMARY KEY,
  execution_task_id UUID NOT NULL REFERENCES execution_tasks(id),
  step_order INT NOT NULL,
  action_name VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL,
  input JSONB NOT NULL,
  output JSONB,
  error_type VARCHAR(64),
  error TEXT,
  latency INT,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE execution_logs (
  id UUID PRIMARY KEY,
  execution_task_id UUID NOT NULL REFERENCES execution_tasks(id),
  execution_step_id UUID REFERENCES execution_steps(id),
  level VARCHAR(16) NOT NULL,
  status VARCHAR(16) NOT NULL,
  error_type VARCHAR(64),
  input JSONB,
  output JSONB,
  error TEXT,
  latency INT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
