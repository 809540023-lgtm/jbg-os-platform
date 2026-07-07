-- 20260707T0901_create_governance.sql
-- Context: Governance (docs/06 §6.10)
-- Tables: actors, policies, audit_logs, eval_runs, human_reviews
-- Source of truth: docs/06-database-schema.md §6.10 + §6.13 (audit append-only)
-- 說明：actors 被幾乎所有其他 context 引用（created_by / assignee 等），故最先建立。
--       human_reviews.loop_execution_id 指向 loops context（尚未建立），該 FK 於
--       20260707T0904_create_loop.sql 以 alter table 補上，以打破 context 間循環依賴。

-- === actors（§6.10.1）====================================================
create table if not exists actors (
  id            uuid primary key default gen_random_uuid(),
  kind          actor_kind not null,          -- human|agent|system
  auth_user_id  uuid,                          -- kind='human' → auth.users.id
  agent_code    agent_code,                    -- kind='agent' → §0.6 代號
  display_name  text not null,
  created_at    timestamptz not null default now(),
  -- 恰好一種身分：human 有 auth_user_id；agent 有 agent_code；system 兩者皆無
  constraint ck_actors_identity check (
    (kind = 'human'  and auth_user_id is not null and agent_code is null) or
    (kind = 'agent'  and agent_code is not null and auth_user_id is null) or
    (kind = 'system' and auth_user_id is null and agent_code is null)
  )
);
comment on table actors is 'Governance: 動作發起者（human/agent/system）';
create unique index if not exists uq_actors_auth_user on actors(auth_user_id)
  where auth_user_id is not null;
create unique index if not exists uq_actors_agent on actors(agent_code)
  where agent_code is not null;

-- === policies（§6.10.3）==================================================
create table if not exists policies (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  description text,
  actor_kind  actor_kind,                       -- 套用於哪類 actor（null=全部）
  agent_code  agent_code,                        -- 套用於哪個 agent（可選）
  action      text not null,                     -- 'listing.publish', 'price.apply'…
  resource    text,                              -- 資源型別/範圍
  effect      policy_effect not null default 'deny',  -- §0.9 預設 deny
  condition   jsonb not null default '{}',       -- e.g. {"max_price_amount": 3000000}
  priority    int not null default 100,          -- 數字小者優先
  is_enabled  boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table policies is 'Governance: 動作級授權規則（PolicyEngine；預設 deny）';
create index if not exists idx_policies_action on policies(action);
create index if not exists idx_policies_agent on policies(agent_code);
create trigger trg_policies_updated before update on policies
  for each row execute function set_updated_at();

-- === audit_logs（§6.10.4；append-only §6.13）=============================
create table if not exists audit_logs (
  id                uuid primary key default gen_random_uuid(),
  actor_id          uuid references actors(id) on delete set null,
  actor_kind        actor_kind not null,
  action            text not null,               -- 'product.create', 'listing.publish'…
  target_kind       audit_target_kind not null,
  target_id         uuid not null,
  loop_execution_id uuid,                         -- 關聯 LX（可選；不硬 FK 保 append-only 純粹）
  before            jsonb,
  after             jsonb,
  metadata          jsonb not null default '{}',
  created_at        timestamptz not null default now()
  -- 無 updated_at：append-only
);
comment on table audit_logs is 'Governance: 不可變動作紀錄（append-only，見 §6.13 trigger）';
create index if not exists idx_audit_logs_target on audit_logs(target_kind, target_id, created_at desc);
create index if not exists idx_audit_logs_actor on audit_logs(actor_id, created_at desc);
create index if not exists idx_audit_logs_action on audit_logs(action);

-- append-only trigger（§6.13）：對所有角色（含 service role）生效
drop trigger if exists trg_audit_logs_no_update on audit_logs;
create trigger trg_audit_logs_no_update
  before update on audit_logs
  for each row execute function prevent_mutation();

drop trigger if exists trg_audit_logs_no_delete on audit_logs;
create trigger trg_audit_logs_no_delete
  before delete on audit_logs
  for each row execute function prevent_mutation();

-- === eval_runs（§6.10.5）=================================================
create table if not exists eval_runs (
  id                 uuid primary key default gen_random_uuid(),
  target_kind        eval_target_kind not null,   -- agent_run|loop_execution
  target_id          uuid not null,
  verdict            eval_verdict not null,        -- pass|fail|warn
  score              numeric(4,3),                 -- 0.000–1.000
  rubric             text,
  is_human           boolean not null default false,
  detail             jsonb not null default '{}',
  evaluator_actor_id uuid references actors(id) on delete set null,
  created_at         timestamptz not null default now()
);
comment on table eval_runs is 'Governance: 對 AgentRun/LX 輸出的評分（自動+人工）';
create index if not exists idx_eval_runs_target on eval_runs(target_kind, target_id);
create index if not exists idx_eval_runs_verdict on eval_runs(verdict);

-- === human_reviews（§6.10.2）============================================
-- 注意：loop_execution_id FK 於 loop 檔補（打破 context 循環）。
create table if not exists human_reviews (
  id                uuid primary key default gen_random_uuid(),
  target_kind       review_target_kind not null,  -- price_suggestion|listing|...
  target_id         uuid not null,
  status            human_review_status not null default 'pending',  -- §0.11
  reason            text,
  loop_execution_id uuid,                          -- FK 於 loop 檔補
  assignee_actor_id uuid references actors(id) on delete set null,
  decided_by        uuid references actors(id) on delete set null,
  decision_note     text,
  edited_payload    jsonb,
  decided_at        timestamptz,
  expires_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table human_reviews is 'Governance: 人審關卡（polymorphic target；狀態機 §0.11）';
create index if not exists idx_human_reviews_target on human_reviews(target_kind, target_id);
create index if not exists idx_human_reviews_status on human_reviews(status);
create index if not exists idx_human_reviews_lx on human_reviews(loop_execution_id);
create trigger trg_human_reviews_updated before update on human_reviews
  for each row execute function set_updated_at();
