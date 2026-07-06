-- 20260707T0904_create_agent.sql
-- Context: Agent (docs/06 §6.7)
-- Tables: agents, skills, prompts, agent_runs, context_snapshots
-- Source of truth: docs/06-database-schema.md §6.7
-- 說明：agent_runs 引用 agents / loop_steps(已於 0903 建) / prompts；故 agents/skills/prompts 先建。

-- === agents（§6.7.1）====================================================
create table if not exists agents (
  id                    uuid primary key default gen_random_uuid(),
  code                  agent_code not null unique,  -- §0.6 權威 7 agent
  name                  text not null,
  description           text,
  io_schema             jsonb not null default '{}',
  default_model         text,                        -- MODELS.* 指向（§0.3）
  allowed_skills        text[] not null default '{}',
  allowed_connectors    connector_kind[] not null default '{}',
  requires_human_review boolean not null default false,
  is_enabled            boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
comment on table agents is 'Agent: Agent 定義（角色/I-O schema/可用 skill+connector）';
create trigger trg_agents_updated before update on agents
  for each row execute function set_updated_at();

-- === skills（§6.7.3）====================================================
create table if not exists skills (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,             -- kebab-case 動詞開頭 'extract-brand'
  name        text not null,
  description text,
  io_schema   jsonb not null default '{}',
  kind        text not null default 'function', -- 'function' | 'sub_loop'
  is_enabled  boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table skills is 'Agent: Skill 定義（純函式或 sub-loop）';
create trigger trg_skills_updated before update on skills
  for each row execute function set_updated_at();

-- === prompts（§6.7.4）===================================================
create table if not exists prompts (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null,                -- 邏輯名（同 slug 多版本）
  version         int not null default 1,
  agent_code      agent_code,                    -- 綁定某 agent（可選）
  role            text,                          -- system/user 模板類型
  template        text not null,                 -- prompt 內容（含變數）
  output_contract jsonb not null default '{}',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (slug, version)
);
comment on table prompts is 'Agent: 版本化 prompt 模板';
create index if not exists idx_prompts_slug_active on prompts(slug) where is_active;
create trigger trg_prompts_updated before update on prompts
  for each row execute function set_updated_at();

-- === agent_runs（§6.7.2）================================================
create table if not exists agent_runs (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid not null references agents(id) on delete restrict,
  loop_step_id  uuid references loop_steps(id) on delete set null,
  status        agent_run_status not null default 'running',
  model         text,
  prompt_id     uuid references prompts(id) on delete set null,
  input         jsonb not null default '{}',
  output        jsonb,
  input_tokens  int,
  output_tokens int,
  cost_amount   bigint,                          -- token 成本（minor unit）
  cost_currency char(3) not null default 'USD',
  latency_ms    int,
  trace_id      text,
  error         text,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  created_at    timestamptz not null default now()
);
comment on table agent_runs is 'Agent: 一次 Agent 執行（I/O + cost + trace）';
create index if not exists idx_agent_runs_agent on agent_runs(agent_id, created_at desc);
create index if not exists idx_agent_runs_loop_step on agent_runs(loop_step_id);
create index if not exists idx_agent_runs_status on agent_runs(status);
create index if not exists idx_agent_runs_trace on agent_runs(trace_id);

-- === context_snapshots（§6.7.5）=========================================
create table if not exists context_snapshots (
  id           uuid primary key default gen_random_uuid(),
  agent_run_id uuid not null references agent_runs(id) on delete cascade,
  content      jsonb not null default '{}',
  token_count  int,
  memory_ids   uuid[] not null default '{}',
  created_at   timestamptz not null default now()
);
comment on table context_snapshots is 'Agent: 執行當下餵入模型的 context 快照（可回放）';
create unique index if not exists uq_context_snapshots_run on context_snapshots(agent_run_id);
