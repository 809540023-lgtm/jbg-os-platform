-- 20260707T0909_rls_policies.sql
-- Context: RLS (docs/06 §6.12) — 放最後（所有 table 已建立）
-- Source of truth: docs/06-database-schema.md §6.12
-- 說明：預設 deny-first（enable RLS 且不寫 policy = 全 deny）。
--       human 走 authenticated role（RLS 精細控制）；agent 走 service role（bypassrls）
--       + PolicyEngine（§6.10 policies）第二道防線。
--       docs/06 明列 5 張關鍵表：products / listings / human_reviews / memories / audit_logs。
--       其餘 table 亦 enable RLS（預設 deny），未寫 policy = 對 authenticated 全 deny，
--       僅 service role 可存取——符合 §6.12「任何未寫 policy 的 (table, 動作) 組合＝deny」。

-- === Helper functions（§6.12.2）=========================================
create or replace function is_authenticated_human()
returns boolean
language sql stable
as $$
  select auth.role() = 'authenticated' and auth.uid() is not null;
$$;

create or replace function is_admin()
returns boolean
language sql stable
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false
  );
$$;

-- === products（§6.12.3）=================================================
alter table products enable row level security;

drop policy if exists products_select_human on products;
create policy products_select_human on products
  for select to authenticated
  using (is_authenticated_human());

drop policy if exists products_insert_human on products;
create policy products_insert_human on products
  for insert to authenticated
  with check (is_authenticated_human());

drop policy if exists products_update_human on products;
create policy products_update_human on products
  for update to authenticated
  using (is_authenticated_human())
  with check (is_authenticated_human());

drop policy if exists products_delete_admin on products;
create policy products_delete_admin on products
  for delete to authenticated
  using (is_admin());
-- agent（service role）繞過 RLS，改由 PolicyEngine 管動作級授權

-- === listings（§6.12.4）=================================================
alter table listings enable row level security;

drop policy if exists listings_select_human on listings;
create policy listings_select_human on listings
  for select to authenticated
  using (is_authenticated_human());

-- 人類可建 draft / 編輯文案，但不得直接把 status 設為 'published'（發佈須走 agent 流程）
drop policy if exists listings_insert_human on listings;
create policy listings_insert_human on listings
  for insert to authenticated
  with check (is_authenticated_human() and status <> 'published');

drop policy if exists listings_update_human on listings;
create policy listings_update_human on listings
  for update to authenticated
  using (is_authenticated_human())
  with check (is_authenticated_human() and status <> 'published');
-- 無 delete policy → 人類不可刪 listing（預設 deny）

-- === human_reviews（§6.12.5）============================================
alter table human_reviews enable row level security;

drop policy if exists human_reviews_select on human_reviews;
create policy human_reviews_select on human_reviews
  for select to authenticated
  using (
    is_authenticated_human() and (
      assignee_actor_id is null
      or assignee_actor_id in (
        select id from actors
        where kind = 'human' and auth_user_id = auth.uid()
      )
      or is_admin()
    )
  );

drop policy if exists human_reviews_decide on human_reviews;
create policy human_reviews_decide on human_reviews
  for update to authenticated
  using (
    is_authenticated_human() and (
      assignee_actor_id is null or is_admin()
      or assignee_actor_id in (
        select id from actors where kind = 'human' and auth_user_id = auth.uid()
      )
    )
  )
  with check (is_authenticated_human());
-- 建立 HR 由 agent/system（service role）觸發；人類不得 insert（無 insert policy）

-- === memories（§6.12.6）=================================================
alter table memories enable row level security;

drop policy if exists memories_select_human on memories;
create policy memories_select_human on memories
  for select to authenticated
  using (is_authenticated_human());

drop policy if exists memories_insert_human on memories;
create policy memories_insert_human on memories
  for insert to authenticated
  with check (is_authenticated_human());

drop policy if exists memories_update_human on memories;
create policy memories_update_human on memories
  for update to authenticated
  using (is_authenticated_human())
  with check (is_authenticated_human());

drop policy if exists memories_delete_admin on memories;
create policy memories_delete_admin on memories
  for delete to authenticated
  using (is_admin());
-- Memory Agent 寫入走 service role（bypassrls）

-- === audit_logs（§6.12.7；唯讀給 admin）=================================
alter table audit_logs enable row level security;

drop policy if exists audit_logs_select_admin on audit_logs;
create policy audit_logs_select_admin on audit_logs
  for select to authenticated
  using (is_admin());
-- 無 insert/update/delete policy 給 authenticated：
--   寫入僅 service role（agent/system），且受 §6.13 append-only trigger 保護

-- === 其餘 table：enable RLS（預設 deny；僅 service role 可存取）==========
-- 依 §6.12「未寫 policy 的 (table, 動作)＝deny」，逐表開 RLS 但暫不給 authenticated policy。
alter table brands            enable row level security;
alter table categories        enable row level security;
alter table product_photos    enable row level security;
alter table price_histories   enable row level security;
alter table price_suggestions enable row level security;
alter table ocr_results       enable row level security;
alter table vision_results    enable row level security;
alter table embeddings        enable row level security;
alter table loops             enable row level security;
alter table workflows         enable row level security;
alter table tasks             enable row level security;
alter table loop_executions   enable row level security;
alter table loop_steps        enable row level security;
alter table agents            enable row level security;
alter table skills            enable row level security;
alter table prompts           enable row level security;
alter table agent_runs        enable row level security;
alter table context_snapshots enable row level security;
alter table memory_links      enable row level security;
alter table connectors        enable row level security;
alter table inquiries         enable row level security;
alter table orders            enable row level security;
alter table after_sales       enable row level security;
alter table actors            enable row level security;
alter table policies          enable row level security;
alter table eval_runs         enable row level security;
