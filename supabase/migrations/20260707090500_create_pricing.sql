-- 20260707T0905_create_pricing.sql
-- Context: Pricing (docs/06 §6.4)
-- Tables: price_histories, price_suggestions
-- Source of truth: docs/06-database-schema.md §6.4
-- 說明：Price 本身為 products 上的 value object（不獨立成表）。
--       price_suggestions.agent_run_id 引用 agent_runs（於 0904 建立），故排在 agent 之後。
--       price_histories 為 append 導向；如 §6.13 建議亦可加 append-only trigger（此處保留可改）。

-- === price_histories（§6.4.1）===========================================
create table if not exists price_histories (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references products(id) on delete cascade,
  price_amount   bigint not null,
  price_currency char(3) not null default 'TWD',
  reason         text,                            -- 'initial','markdown','agent_suggestion'
  changed_by     uuid,                            -- actors.id（docs/06 為裸 uuid）
  created_at     timestamptz not null default now()
);
comment on table price_histories is 'Pricing: 定價變更歷史（append 導向）';
create index if not exists idx_price_histories_product on price_histories(product_id, created_at desc);

-- === price_suggestions（§6.4.2）=========================================
create table if not exists price_suggestions (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references products(id) on delete cascade,
  agent_run_id     uuid references agent_runs(id) on delete set null,
  suggested_amount bigint not null,
  min_amount       bigint,
  max_amount       bigint,
  currency         char(3) not null default 'TWD',
  confidence       numeric(4,3),                   -- 0.000–1.000
  rationale        text,
  is_applied       boolean not null default false,
  created_at       timestamptz not null default now()
);
comment on table price_suggestions is 'Pricing: Price Agent 的估價建議（理由+信心）';
create index if not exists idx_price_suggestions_product on price_suggestions(product_id, created_at desc);
create index if not exists idx_price_suggestions_agent_run on price_suggestions(agent_run_id);
