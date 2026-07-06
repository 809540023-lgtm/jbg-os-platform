-- 20260707T0903_create_loop.sql
-- Context: Loop (docs/06 §6.6)
-- Tables: loops, workflows, tasks, loop_executions, loop_steps
-- Source of truth: docs/06-database-schema.md §6.6
-- 說明：tasks ↔ loop_executions 互相引用（§6.14.2）。先建 tasks（loop_execution_id 稍後補），
--       再建 loop_executions，最後以 alter table 補 tasks.loop_execution_id 與
--       governance.human_reviews.loop_execution_id 兩個跨表 FK。

-- === loops（§6.6.1）=====================================================
create table if not exists loops (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,             -- kebab-case e.g. 'product-lifecycle'
  name         text not null,
  description  text,
  definition   jsonb not null default '{}',      -- 步驟圖 / DAG / 觸發 / 終止條件
  trigger_kind text,                             -- 'cron'|'webhook'|'event'|'manual'
  is_enabled   boolean not null default true,
  version      int not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table loops is 'Loop: Loop 定義（步驟圖/觸發/終止條件）';
create trigger trg_loops_updated before update on loops
  for each row execute function set_updated_at();

-- === workflows（§6.6.4）=================================================
create table if not exists workflows (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,              -- e.g. 'product-lifecycle'
  name        text not null,
  description text,
  definition  jsonb not null default '{}',       -- 各 stage → loop 的編排
  is_enabled  boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table workflows is 'Loop: Workflow（多 Loop 編排；SHAP product-lifecycle）';
create trigger trg_workflows_updated before update on workflows
  for each row execute function set_updated_at();

-- === tasks（§6.6.5）=====================================================
-- loop_execution_id FK 稍後補（loop_executions 尚未建立）。
create table if not exists tasks (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  description       text,
  status            task_status not null default 'open',  -- §0.11
  target_kind       review_target_kind,
  target_id         uuid,
  assignee_actor_id uuid references actors(id) on delete set null,
  loop_execution_id uuid,                         -- FK 稍後補
  due_at            timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table tasks is 'Loop: 工作單（可指派 agent/人；可 spawn LX / HR）';
create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_tasks_assignee on tasks(assignee_actor_id);
create index if not exists idx_tasks_target on tasks(target_kind, target_id);
create trigger trg_tasks_updated before update on tasks
  for each row execute function set_updated_at();

-- === loop_executions（§6.6.2）===========================================
create table if not exists loop_executions (
  id             uuid primary key default gen_random_uuid(),
  loop_id        uuid not null references loops(id) on delete cascade,
  workflow_id    uuid references workflows(id) on delete set null,
  task_id        uuid references tasks(id) on delete set null,
  status         loop_execution_status not null default 'queued',
  trigger_source text,
  input          jsonb not null default '{}',
  output         jsonb,
  error          text,
  started_at     timestamptz,
  finished_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table loop_executions is 'Loop: 一次 Loop 執行（狀態機 §0.11）';
create index if not exists idx_loop_executions_loop on loop_executions(loop_id, created_at desc);
create index if not exists idx_loop_executions_status on loop_executions(status);
create index if not exists idx_loop_executions_workflow on loop_executions(workflow_id);
create trigger trg_loop_executions_updated before update on loop_executions
  for each row execute function set_updated_at();

-- === 補跨表 FK（打破循環）================================================
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fk_tasks_loop_execution_id') then
    alter table tasks
      add constraint fk_tasks_loop_execution_id
      foreign key (loop_execution_id) references loop_executions(id) on delete set null;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fk_human_reviews_loop_execution_id') then
    alter table human_reviews
      add constraint fk_human_reviews_loop_execution_id
      foreign key (loop_execution_id) references loop_executions(id) on delete set null;
  end if;
end $$;

-- === loop_steps（§6.6.3）================================================
create table if not exists loop_steps (
  id                uuid primary key default gen_random_uuid(),
  loop_execution_id uuid not null references loop_executions(id) on delete cascade,
  step_index        int not null,
  name              text not null,                -- stage 名（'perceive','price'）
  kind              loop_step_kind not null,      -- agent|skill|connector|human|system
  ref               text,                         -- agent_code / skill_id / connector_kind
  status            loop_step_status not null default 'pending',
  input             jsonb not null default '{}',
  output            jsonb,
  error             text,
  started_at        timestamptz,
  finished_at       timestamptz,
  created_at        timestamptz not null default now()
);
comment on table loop_steps is 'Loop: LX 的一步（Agent/Skill/Connector/Human 呼叫）';
create index if not exists idx_loop_steps_lx on loop_steps(loop_execution_id, step_index);
create index if not exists idx_loop_steps_status on loop_steps(status);
