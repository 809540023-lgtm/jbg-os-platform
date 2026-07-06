# 06 · Database Schema (Supabase)

> 本章是 JBG OS 的**資料落地層**：把 `docs/00-canonical-model.md` §0.5 的 Entity 全部落成 Supabase Postgres 的 table、enum、index、FK、RLS。
> 命名一律遵守 §0.10（table = `snake_case` 複數；FK = `<singular>_id`；金額 = 整數 `_amount` + `char(3)` `_currency`；時間 = `timestamptz`）；狀態 enum 一律遵守 §0.11。
> 所有 DDL 皆為**可直接貼到 Supabase SQL Editor / migration 執行**的 Postgres 15+ 語法。
>
> 版本：v1.0 · 最後更新：2026-07-07 · 對齊 `docs/00` §0.5–0.11、`docs/05`（Entity）

---

## 6.0 設計原則 (Design Principles)

1. **一 Entity 一 table**：§0.5 每個 PascalCase Entity 對應一張 `snake_case` 複數 table。`Price` 是 `Product` 上的 value object（不獨立成表），以 `products.price_amount` / `products.price_currency` 內嵌。
2. **UUID 主鍵**：`id uuid primary key default gen_random_uuid()`（需 `pgcrypto`；Supabase 內建）。
3. **時間戳**：每表都有 `created_at timestamptz not null default now()`；可變表加 `updated_at timestamptz not null default now()`（由 trigger 維護）。
4. **金額**：整數 minor unit（`_amount bigint`）+ `_currency char(3)`。禁 float 存錢。
5. **enum 優先**：狀態、種類欄位一律用 Postgres `CREATE TYPE ... AS ENUM`，命名 `<entity>_<field>`。
6. **polymorphic 關聯**：`Embedding`/`AuditLog`/`HumanReview`/`Actor` 這類跨 Entity 目標，用 `(<x>_kind <enum>, <x>_id uuid)` 對 + `CHECK`；不做硬 FK，靠 app 層與 partial index 保證。
7. **RLS 預設 deny**（§0.9）：所有 table `ENABLE ROW LEVEL SECURITY`，逐表寫 policy；agent 走 service role（`bypassrls`）＋ `PolicyEngine` 第二道防線。
8. **Schema 分層**：業務資料放 `public`；Loop/Agent runtime 也放 `public`（Supabase Auth 在 `auth`）。所有 DDL 用 fully-qualified 或預設 `public`。

---

## 6.1 總覽 ER 圖 (Overview ER)

```
Catalog Context
  brands ──< products >── categories
                │
                ├──< product_photos ──1:1── ocr_results
                │                   └─1:1── vision_results
                ├──< price_histories
                └──< price_suggestions >── agent_runs

Perception Context
  product_photos ─1:1─ ocr_results
  product_photos ─1:1─ vision_results
  embeddings (polymorphic: owner_kind ∈ {product, memory, listing})

Loop Context
  loops ──< loop_executions ──< loop_steps
  workflows ──orchestrates──> loops
  tasks ──may spawn──> loop_executions / human_reviews

Agent Context
  agents ──< agent_runs ──1:1── context_snapshots
  agent_runs ── belongs to ──> loop_steps
  skills ; prompts ──used by──> agents

Memory Context
  memories ──< memory_links >── memories   (self many-to-many)
  memories ─has─ embeddings

Channel Context
  connectors ──< listings >── products
  listings ──< inquiries ──may become──> orders
  products ──< orders ──< after_sales

Governance Context
  actors (human | agent | system)
  human_reviews (polymorphic target)
  policies
  audit_logs (append-only, polymorphic)
  eval_runs ── belongs to ──> agent_runs / loop_executions
```

### Table 清單（依 Context）

| Context | Tables |
|---|---|
| Catalog | `brands`, `categories`, `products`, `product_photos` |
| Pricing | `price_histories`, `price_suggestions`（`Price` 內嵌於 `products`） |
| Perception | `ocr_results`, `vision_results`, `embeddings` |
| Loop | `loops`, `loop_executions`, `loop_steps`, `workflows`, `tasks` |
| Agent | `agents`, `agent_runs`, `skills`, `prompts`, `context_snapshots` |
| Memory | `memories`, `memory_links` |
| Channel | `connectors`, `listings`, `inquiries`, `orders`, `after_sales` |
| Governance | `actors`, `human_reviews`, `policies`, `audit_logs`, `eval_runs` |

共 **31 張 table**（+ pgvector 索引與 trigger）。

---

## 6.2 Extensions & Enum Types

### 6.2.1 必要 extensions

```sql
-- 於第一支 migration 最上方執行
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "vector";     -- pgvector（embedding）
create extension if not exists "pg_trgm";    -- 文字模糊查詢（品牌/型號）
-- pg_cron / pgmq 於 §10 Backend 章開啟（Automation / queue）
```

### 6.2.2 Enum types（權威，依 §0.11 + 本章擴充）

```sql
-- === §0.11 權威狀態機 ===
create type loop_execution_status as enum (
  'queued', 'running', 'waiting_human', 'succeeded', 'failed', 'cancelled'
);

create type human_review_status as enum (
  'pending', 'approved', 'rejected', 'edited', 'expired'
);

create type task_status as enum (
  'open', 'in_progress', 'done', 'blocked', 'cancelled'
);

create type listing_status as enum (
  'draft', 'in_review', 'approved', 'published', 'sold', 'archived'
);

-- === 本章擴充（§0.5 對齊所需） ===

-- Loop step 狀態（LoopStep 一步）
create type loop_step_status as enum (
  'pending', 'running', 'succeeded', 'failed', 'skipped'
);

-- LoopStep 種類（對應一次 Agent / Skill / Connector / Human 呼叫）
create type loop_step_kind as enum (
  'agent', 'skill', 'connector', 'human', 'system'
);

-- AgentRun 狀態
create type agent_run_status as enum (
  'running', 'succeeded', 'failed', 'timeout', 'rejected'
);

-- Agent 代號（§0.6 權威 7 agent）
create type agent_code as enum (
  'vision', 'ocr', 'price', 'marketing', 'reviewer', 'publisher', 'memory'
);

-- Connector 種類（§0.8）
create type connector_kind as enum (
  'drive', 'facebook', 'line'
);

-- Connector 連線狀態
create type connector_status as enum (
  'active', 'disabled', 'error', 'expired'
);

-- Memory 種類（§0.4 layer 9）
create type memory_type as enum (
  'fact', 'preference', 'feedback', 'reference'
);

-- Actor 種類（§0.9 兩種 actor + system）
create type actor_kind as enum (
  'human', 'agent', 'system'
);

-- Embedding owner 種類（polymorphic）
create type embedding_owner_kind as enum (
  'product', 'memory', 'listing'
);

-- HumanReview / AuditLog / Task 目標種類（polymorphic）
create type review_target_kind as enum (
  'price_suggestion', 'listing', 'product', 'order', 'after_sale', 'loop_execution'
);

create type audit_target_kind as enum (
  'product', 'listing', 'order', 'price_suggestion', 'human_review',
  'loop_execution', 'agent_run', 'memory', 'connector', 'policy'
);

-- Inquiry / Order / AfterSale
create type inquiry_status as enum (
  'new', 'in_progress', 'answered', 'converted', 'closed'
);

create type order_status as enum (
  'pending', 'paid', 'shipped', 'completed', 'refunded', 'cancelled'
);

create type after_sale_kind as enum (
  'return', 'exchange', 'complaint', 'repurchase', 'other'
);

create type after_sale_status as enum (
  'open', 'in_progress', 'resolved', 'rejected'
);

-- EvalRun
create type eval_target_kind as enum ('agent_run', 'loop_execution');
create type eval_verdict as enum ('pass', 'fail', 'warn');

-- Product 生命週期（對齊 SHAP product-lifecycle）
create type product_status as enum (
  'ingested', 'assembled', 'gap', 'priced', 'composed',
  'reviewing', 'published', 'sold', 'archived'
);

-- Policy effect
create type policy_effect as enum ('allow', 'deny');
```

### 6.2.3 共用 `updated_at` trigger

```sql
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
-- 用法：每張有 updated_at 的表建立
--   create trigger trg_<table>_updated before update on <table>
--     for each row execute function set_updated_at();
```

---

## 6.3 Catalog Context

### 6.3.1 `brands`

品牌（Chanel / Nike…）。`has many products`。

```sql
create table brands (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,               -- 'chanel', 'nike'
  name        text not null,                      -- 顯示名
  name_ja     text,                               -- 日文名（SHAP-specific：日本代購）
  aliases     text[] not null default '{}',       -- 別名（辨識用）
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table brands is 'Catalog: 品牌主檔';
create index idx_brands_name_trgm on brands using gin (name gin_trgm_ops);
create trigger trg_brands_updated before update on brands
  for each row execute function set_updated_at();
```

### 6.3.2 `categories`

品類（包/鞋/家電…）。`has many products`。自參考支援子品類。

```sql
create table categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,               -- 'bag', 'shoes', 'appliance'
  name        text not null,
  parent_id   uuid references categories(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table categories is 'Catalog: 品類主檔（可階層）';
create index idx_categories_parent on categories(parent_id);
create trigger trg_categories_updated before update on categories
  for each row execute function set_updated_at();
```

### 6.3.3 `products`

一件商品（aggregate root）。內嵌 `Price` value object（`price_amount`/`price_currency`）。

```sql
create table products (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid references brands(id) on delete set null,
  category_id   uuid references categories(id) on delete set null,
  title         text,                             -- 商品標題（assemble 後）
  description   text,
  condition     text,                             -- 成色描述（e.g. 'S', 'A', '九成新'）
  attributes    jsonb not null default '{}',      -- 合併 OCR+Vision 的結構化屬性
  status        product_status not null default 'ingested',
  -- Price value object（§0.10 金額規範）
  price_amount    bigint,                         -- 建議售價（minor unit, e.g. 日圓/日幣無小數則=整數）
  price_currency  char(3) not null default 'TWD',
  cost_amount     bigint,                         -- 進貨成本（可選）
  cost_currency   char(3) not null default 'JPY',
  source_ref      text,                           -- SHAP-specific：Drive folder/file 來源
  created_by      uuid,                           -- actors.id（發起者）
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table products is 'Catalog: 商品（aggregate root）；內嵌 Price value object';
comment on column products.attributes is '合併 OCR/Vision 的結構化屬性（品牌信心、瑕疵、尺寸…）';
create index idx_products_brand on products(brand_id);
create index idx_products_category on products(category_id);
create index idx_products_status on products(status);
create index idx_products_created_at on products(created_at desc);
create trigger trg_products_updated before update on products
  for each row execute function set_updated_at();
```

### 6.3.4 `product_photos`

一張商品照片（源自 Drive）。`belongs to product`；`has one ocr_result, vision_result`。

```sql
create table product_photos (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references products(id) on delete cascade,
  storage_path  text not null,                    -- Supabase Storage 路徑
  drive_file_id text,                             -- SHAP-specific：Google Drive file id
  width         int,
  height        int,
  is_primary    boolean not null default false,   -- 主圖
  position      int not null default 0,           -- 排序
  created_at    timestamptz not null default now()
);
comment on table product_photos is 'Catalog: 商品照片（源自 Drive）';
create index idx_product_photos_product on product_photos(product_id);
create unique index uq_product_photos_drive on product_photos(drive_file_id)
  where drive_file_id is not null;             -- 冪等 ingest
```

---

## 6.4 Pricing Context

### 6.4.1 `price_histories`

定價變更的一筆歷史。`belongs to product`。

```sql
create table price_histories (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references products(id) on delete cascade,
  price_amount  bigint not null,
  price_currency char(3) not null default 'TWD',
  reason        text,                             -- 'initial', 'markdown', 'agent_suggestion'
  changed_by    uuid,                             -- actors.id
  created_at    timestamptz not null default now()
);
comment on table price_histories is 'Pricing: 定價變更歷史（append 導向）';
create index idx_price_histories_product on price_histories(product_id, created_at desc);
```

### 6.4.2 `price_suggestions`

Price Agent 產生的建議（含理由、信心）。`belongs to product, agent_run`。

```sql
create table price_suggestions (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references products(id) on delete cascade,
  agent_run_id    uuid references agent_runs(id) on delete set null,
  suggested_amount bigint not null,
  min_amount      bigint,                          -- 建議區間下限
  max_amount      bigint,                          -- 建議區間上限
  currency        char(3) not null default 'TWD',
  confidence      numeric(4,3),                    -- 0.000–1.000
  rationale       text,                            -- 估價理由
  is_applied      boolean not null default false,  -- 是否已套用到 products
  created_at      timestamptz not null default now()
);
comment on table price_suggestions is 'Pricing: Price Agent 的估價建議（理由+信心）';
create index idx_price_suggestions_product on price_suggestions(product_id, created_at desc);
create index idx_price_suggestions_agent_run on price_suggestions(agent_run_id);
```

---

## 6.5 Perception Context

### 6.5.1 `ocr_results`

一張照片的文字抽取結果。`belongs to product_photo`（1:1）。

```sql
create table ocr_results (
  id                uuid primary key default gen_random_uuid(),
  product_photo_id  uuid not null references product_photos(id) on delete cascade,
  agent_run_id      uuid references agent_runs(id) on delete set null,
  raw_text          text,                          -- 完整抽取文字
  fields            jsonb not null default '{}',   -- {model_no, serial, size, material...}
  confidence        numeric(4,3),
  created_at        timestamptz not null default now()
);
comment on table ocr_results is 'Perception: 照片 OCR 抽取（吊牌/型號/序號/尺寸/成分）';
create unique index uq_ocr_results_photo on ocr_results(product_photo_id);
create index idx_ocr_results_agent_run on ocr_results(agent_run_id);
```

### 6.5.2 `vision_results`

一張照片的視覺理解結果。`belongs to product_photo`（1:1）。

```sql
create table vision_results (
  id                uuid primary key default gen_random_uuid(),
  product_photo_id  uuid not null references product_photos(id) on delete cascade,
  agent_run_id      uuid references agent_runs(id) on delete set null,
  brand_guess       text,
  category_guess    text,
  colors            text[] not null default '{}',
  defects           jsonb not null default '[]',   -- [{type, severity, location}]
  attributes        jsonb not null default '{}',   -- 附件/配件/屬性
  confidence        numeric(4,3),
  created_at        timestamptz not null default now()
);
comment on table vision_results is 'Perception: 照片視覺理解（品牌/品類/顏色/瑕疵/屬性）';
create unique index uq_vision_results_photo on vision_results(product_photo_id);
create index idx_vision_results_agent_run on vision_results(agent_run_id);
```

### 6.5.3 `embeddings`（pgvector）

某實體的向量（文字或圖）。polymorphic → `product`/`memory`/`listing`。詳見 §6.11。

```sql
create table embeddings (
  id            uuid primary key default gen_random_uuid(),
  owner_kind    embedding_owner_kind not null,     -- 'product' | 'memory' | 'listing'
  owner_id      uuid not null,
  content       text,                              -- 被向量化的原文（可回放）
  embedding     vector(1536) not null,             -- Voyage/OpenAI 維度（§0.3；可換）
  model         text not null,                     -- 產生此向量的 embedding model id
  created_at    timestamptz not null default now()
);
comment on table embeddings is 'Perception: 向量（polymorphic owner）；用於 memory recall / 相似商品';
create index idx_embeddings_owner on embeddings(owner_kind, owner_id);
-- 向量索引見 §6.11（ivfflat / hnsw）
```

---

## 6.6 Loop Context

### 6.6.1 `loops`

一個 Loop 的**定義**（步驟圖、觸發、終止條件）。`has many loop_executions`。

```sql
create table loops (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,            -- kebab-case（§0.10）e.g. 'product-lifecycle'
  name            text not null,
  description     text,
  definition      jsonb not null default '{}',     -- 步驟圖 / DAG / 觸發 / 終止條件
  trigger_kind    text,                            -- 'cron' | 'webhook' | 'event' | 'manual'
  is_enabled      boolean not null default true,
  version         int not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table loops is 'Loop: Loop 定義（步驟圖/觸發/終止條件）';
create trigger trg_loops_updated before update on loops
  for each row execute function set_updated_at();
```

### 6.6.2 `loop_executions`（LX）

一次 Loop 執行實例（狀態機 §0.11）。`has many loop_steps`；`belongs to loop`。

```sql
create table loop_executions (
  id              uuid primary key default gen_random_uuid(),
  loop_id         uuid not null references loops(id) on delete cascade,
  workflow_id     uuid references workflows(id) on delete set null,
  task_id         uuid references tasks(id) on delete set null,
  status          loop_execution_status not null default 'queued',
  trigger_source  text,                            -- 觸發來源描述
  input           jsonb not null default '{}',
  output          jsonb,
  error           text,
  started_at      timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table loop_executions is 'Loop: 一次 Loop 執行（狀態機 §0.11）';
create index idx_loop_executions_loop on loop_executions(loop_id, created_at desc);
create index idx_loop_executions_status on loop_executions(status);
create index idx_loop_executions_workflow on loop_executions(workflow_id);
create trigger trg_loop_executions_updated before update on loop_executions
  for each row execute function set_updated_at();
```

### 6.6.3 `loop_steps`

LX 中的一步（對應一次 Agent/Skill/Connector 呼叫）。`belongs to loop_execution`。

```sql
create table loop_steps (
  id                uuid primary key default gen_random_uuid(),
  loop_execution_id uuid not null references loop_executions(id) on delete cascade,
  step_index        int not null,                  -- 順序
  name              text not null,                 -- stage 名（e.g. 'perceive', 'price'）
  kind              loop_step_kind not null,       -- agent|skill|connector|human|system
  ref               text,                          -- agent_code / skill_id / connector_kind
  status            loop_step_status not null default 'pending',
  input             jsonb not null default '{}',
  output            jsonb,
  error             text,
  started_at        timestamptz,
  finished_at       timestamptz,
  created_at        timestamptz not null default now()
);
comment on table loop_steps is 'Loop: LX 的一步（Agent/Skill/Connector/Human 呼叫）';
create index idx_loop_steps_lx on loop_steps(loop_execution_id, step_index);
create index idx_loop_steps_status on loop_steps(status);
```

### 6.6.4 `workflows`

多個 Loop 組成的更大業務流程（SHAP 主流程）。`orchestrates loops`。

```sql
create table workflows (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,            -- e.g. 'product-lifecycle'
  name            text not null,
  description     text,
  definition      jsonb not null default '{}',     -- 各 stage → loop 的編排
  is_enabled      boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table workflows is 'Loop: Workflow（多 Loop 編排；SHAP product-lifecycle）';
create trigger trg_workflows_updated before update on workflows
  for each row execute function set_updated_at();
```

### 6.6.5 `tasks`

需要被處理的工作單。`may spawn loop_execution / human_review`。

```sql
create table tasks (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  description       text,
  status            task_status not null default 'open',  -- §0.11
  target_kind       review_target_kind,             -- 關聯的業務對象種類（可選）
  target_id         uuid,
  assignee_actor_id uuid references actors(id) on delete set null, -- 指派給 agent 或人
  loop_execution_id uuid references loop_executions(id) on delete set null,
  due_at            timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table tasks is 'Loop: 工作單（可指派 agent/人；可 spawn LX / HR）';
create index idx_tasks_status on tasks(status);
create index idx_tasks_assignee on tasks(assignee_actor_id);
create index idx_tasks_target on tasks(target_kind, target_id);
create trigger trg_tasks_updated before update on tasks
  for each row execute function set_updated_at();
```

---

## 6.7 Agent Context

### 6.7.1 `agents`

一個 AI 執行單元的**定義**。`has many agent_runs`。

```sql
create table agents (
  id              uuid primary key default gen_random_uuid(),
  code            agent_code not null unique,      -- §0.6 權威 7 agent
  name            text not null,
  description     text,
  io_schema       jsonb not null default '{}',     -- input/output JSON schema
  default_model   text,                            -- MODELS.* 指向（§0.3；不硬寫版本）
  allowed_skills  text[] not null default '{}',    -- skill slug 白名單
  allowed_connectors connector_kind[] not null default '{}',
  requires_human_review boolean not null default false,
  is_enabled      boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table agents is 'Agent: Agent 定義（角色/I-O schema/可用 skill+connector）';
create trigger trg_agents_updated before update on agents
  for each row execute function set_updated_at();
```

### 6.7.2 `agent_runs`

Agent 的一次執行（input/output/cost/trace）。`belongs to agent, loop_step`。

```sql
create table agent_runs (
  id              uuid primary key default gen_random_uuid(),
  agent_id        uuid not null references agents(id) on delete restrict,
  loop_step_id    uuid references loop_steps(id) on delete set null,
  status          agent_run_status not null default 'running',
  model           text,                            -- 實際使用的 model id
  prompt_id       uuid references prompts(id) on delete set null,
  input           jsonb not null default '{}',
  output          jsonb,
  input_tokens    int,
  output_tokens   int,
  cost_amount     bigint,                          -- token 成本（minor unit）
  cost_currency   char(3) not null default 'USD',
  latency_ms      int,
  trace_id        text,                            -- Observability trace 關聯
  error           text,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  created_at      timestamptz not null default now()
);
comment on table agent_runs is 'Agent: 一次 Agent 執行（I/O + cost + trace）';
create index idx_agent_runs_agent on agent_runs(agent_id, created_at desc);
create index idx_agent_runs_loop_step on agent_runs(loop_step_id);
create index idx_agent_runs_status on agent_runs(status);
create index idx_agent_runs_trace on agent_runs(trace_id);
```

### 6.7.3 `skills`

可被呼叫的能力單元定義。`used by agent/loop`。

```sql
create table skills (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,            -- kebab-case 動詞開頭（§0.10）'extract-brand'
  name            text not null,
  description     text,
  io_schema       jsonb not null default '{}',
  kind            text not null default 'function',-- 'function' | 'sub_loop'
  is_enabled      boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table skills is 'Agent: Skill 定義（純函式或 sub-loop）';
create trigger trg_skills_updated before update on skills
  for each row execute function set_updated_at();
```

### 6.7.4 `prompts`

版本化的 prompt 模板。`used by agent`。

```sql
create table prompts (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null,                   -- 邏輯名（同 slug 多版本）
  version         int not null default 1,
  agent_code      agent_code,                      -- 綁定某 agent（可選）
  role            text,                            -- system/user 模板類型
  template        text not null,                   -- prompt 內容（含變數）
  output_contract jsonb not null default '{}',     -- 期望輸出 schema
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (slug, version)
);
comment on table prompts is 'Agent: 版本化 prompt 模板';
create index idx_prompts_slug_active on prompts(slug) where is_active;
create trigger trg_prompts_updated before update on prompts
  for each row execute function set_updated_at();
```

### 6.7.5 `context_snapshots`

某次執行實際餵入模型的 context（可回放）。`belongs to agent_run`。

```sql
create table context_snapshots (
  id              uuid primary key default gen_random_uuid(),
  agent_run_id    uuid not null references agent_runs(id) on delete cascade,
  content         jsonb not null default '{}',     -- 完整 context（RAG/memory/entity 快照）
  token_count     int,
  memory_ids      uuid[] not null default '{}',    -- 被 recall 的 memories
  created_at      timestamptz not null default now()
);
comment on table context_snapshots is 'Agent: 執行當下餵入模型的 context 快照（可回放）';
create unique index uq_context_snapshots_run on context_snapshots(agent_run_id);
```

---

## 6.8 Memory Context

### 6.8.1 `memories`

一條跨執行的記憶。`has embedding`；`has many memory_link`。

```sql
create table memories (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique,                     -- [[slug]] 供 MemoryLink 引用
  type            memory_type not null,            -- fact|preference|feedback|reference
  title           text,
  content         text not null,
  source_kind     text,                            -- 'order' | 'inquiry' | 'after_sale' ...
  source_id       uuid,
  confidence      numeric(4,3),
  created_by      uuid,                            -- actors.id（memory agent 或人）
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table memories is 'Memory: 跨執行記憶（fact/preference/feedback/reference）';
create index idx_memories_type on memories(type);
create index idx_memories_source on memories(source_kind, source_id);
create trigger trg_memories_updated before update on memories
  for each row execute function set_updated_at();
```

### 6.8.2 `memory_links`

記憶之間的關聯（`[[slug]]`）。between two `memory`。

```sql
create table memory_links (
  id            uuid primary key default gen_random_uuid(),
  from_memory_id uuid not null references memories(id) on delete cascade,
  to_memory_id   uuid not null references memories(id) on delete cascade,
  relation      text not null default 'related',  -- 'related' | 'supersedes' | 'contradicts'
  created_at    timestamptz not null default now(),
  check (from_memory_id <> to_memory_id),
  unique (from_memory_id, to_memory_id, relation)
);
comment on table memory_links is 'Memory: 記憶間關聯（[[slug]] graph）';
create index idx_memory_links_from on memory_links(from_memory_id);
create index idx_memory_links_to on memory_links(to_memory_id);
```

---

## 6.9 Channel Context

### 6.9.1 `connectors`

對外系統的連線設定與憑證。Drive/FB/LINE（§0.8）。

```sql
create table connectors (
  id              uuid primary key default gen_random_uuid(),
  kind            connector_kind not null,         -- drive|facebook|line
  name            text not null,
  status          connector_status not null default 'active',
  config          jsonb not null default '{}',     -- 非機密設定（folder id, page id…）
  credentials_ref text,                            -- 指向 Vault/secret（不存明碼 token）
  last_synced_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table connectors is 'Channel: 對外連線（Drive/FB/LINE）；憑證以 ref 指向 secret，不存明碼';
create index idx_connectors_kind on connectors(kind);
create trigger trg_connectors_updated before update on connectors
  for each row execute function set_updated_at();
```

### 6.9.2 `listings`

商品在某通路（FB）上的刊登。`belongs to product, connector`。狀態機 §0.11。

```sql
create table listings (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references products(id) on delete cascade,
  connector_id    uuid references connectors(id) on delete set null,
  status          listing_status not null default 'draft',  -- §0.11
  title           text,
  body            text,                            -- FB 文案
  hashtags        text[] not null default '{}',
  external_ref    text,                            -- FB post id（發佈後）
  price_amount    bigint,
  price_currency  char(3) not null default 'TWD',
  agent_run_id    uuid references agent_runs(id) on delete set null, -- marketing agent
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table listings is 'Channel: 商品在通路（FB）的刊登（狀態機 §0.11）';
create index idx_listings_product on listings(product_id);
create index idx_listings_status on listings(status);
create unique index uq_listings_external on listings(connector_id, external_ref)
  where external_ref is not null;
create trigger trg_listings_updated before update on listings
  for each row execute function set_updated_at();
```

### 6.9.3 `inquiries`

一則客戶詢問。`belongs to listing`；`may become order`。

```sql
create table inquiries (
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid not null references listings(id) on delete cascade,
  status          inquiry_status not null default 'new',
  external_ref    text,                            -- FB comment/message id
  customer_handle text,                            -- 客戶識別
  message         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table inquiries is 'Channel: 客戶詢問（可轉 Order）';
create index idx_inquiries_listing on inquiries(listing_id);
create index idx_inquiries_status on inquiries(status);
create trigger trg_inquiries_updated before update on inquiries
  for each row execute function set_updated_at();
```

### 6.9.4 `orders`

一筆成交。`belongs to product, inquiry`。

```sql
create table orders (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references products(id) on delete restrict,
  inquiry_id      uuid references inquiries(id) on delete set null,
  listing_id      uuid references listings(id) on delete set null,
  status          order_status not null default 'pending',
  amount          bigint not null,                 -- 成交金額（minor unit）
  currency        char(3) not null default 'TWD',
  customer_handle text,
  note            text,
  ordered_at      timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table orders is 'Channel: 成交訂單';
create index idx_orders_product on orders(product_id);
create index idx_orders_inquiry on orders(inquiry_id);
create index idx_orders_status on orders(status);
create trigger trg_orders_updated before update on orders
  for each row execute function set_updated_at();
```

### 6.9.5 `after_sales`

售後事件（退換/客訴/回購）。`belongs to order`。

```sql
create table after_sales (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id) on delete cascade,
  kind            after_sale_kind not null,        -- return|exchange|complaint|repurchase|other
  status          after_sale_status not null default 'open',
  detail          text,
  resolution      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table after_sales is 'Channel: 售後事件（退換/客訴/回購）';
create index idx_after_sales_order on after_sales(order_id);
create index idx_after_sales_status on after_sales(status);
create trigger trg_after_sales_updated before update on after_sales
  for each row execute function set_updated_at();
```

---

## 6.10 Governance Context

### 6.10.1 `actors`

動作的發起者（human / agent / system）。§0.9 兩種 actor + system。

```sql
create table actors (
  id              uuid primary key default gen_random_uuid(),
  kind            actor_kind not null,             -- human|agent|system
  auth_user_id    uuid,                            -- kind='human' → auth.users.id
  agent_code      agent_code,                      -- kind='agent' → §0.6 代號
  display_name    text not null,
  created_at      timestamptz not null default now(),
  -- 恰好一種身分：human 有 auth_user_id；agent 有 agent_code；system 兩者皆無
  check (
    (kind = 'human'  and auth_user_id is not null and agent_code is null) or
    (kind = 'agent'  and agent_code is not null and auth_user_id is null) or
    (kind = 'system' and auth_user_id is null and agent_code is null)
  )
);
comment on table actors is 'Governance: 動作發起者（human/agent/system）';
create unique index uq_actors_auth_user on actors(auth_user_id) where auth_user_id is not null;
create unique index uq_actors_agent on actors(agent_code) where agent_code is not null;
```

### 6.10.2 `human_reviews`（HR）

一個等待人類決策的關卡。`belongs to polymorphic target`。狀態機 §0.11。

```sql
create table human_reviews (
  id              uuid primary key default gen_random_uuid(),
  target_kind     review_target_kind not null,     -- price_suggestion|listing|...
  target_id       uuid not null,
  status          human_review_status not null default 'pending',  -- §0.11
  reason          text,                            -- 為何進人審（高價/合規…）
  loop_execution_id uuid references loop_executions(id) on delete set null,
  assignee_actor_id uuid references actors(id) on delete set null,
  decided_by      uuid references actors(id) on delete set null,
  decision_note   text,
  edited_payload  jsonb,                           -- status='edited' 時的人工修改
  decided_at      timestamptz,
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table human_reviews is 'Governance: 人審關卡（polymorphic target；狀態機 §0.11）';
create index idx_human_reviews_target on human_reviews(target_kind, target_id);
create index idx_human_reviews_status on human_reviews(status);
create index idx_human_reviews_lx on human_reviews(loop_execution_id);
create trigger trg_human_reviews_updated before update on human_reviews
  for each row execute function set_updated_at();
```

### 6.10.3 `policies`

一條權限規則。`evaluated by PolicyEngine`（§0.9 第二道防線）。

```sql
create table policies (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  description     text,
  actor_kind      actor_kind,                      -- 套用於哪類 actor（null=全部）
  agent_code      agent_code,                      -- 套用於哪個 agent（可選）
  action          text not null,                   -- 'listing.publish', 'price.apply'…
  resource        text,                            -- 資源型別/範圍
  effect          policy_effect not null default 'deny',  -- §0.9 預設 deny
  condition       jsonb not null default '{}',     -- e.g. {"max_price_amount": 3000000}
  priority        int not null default 100,        -- 數字小者優先
  is_enabled      boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table policies is 'Governance: 動作級授權規則（PolicyEngine；預設 deny）';
create index idx_policies_action on policies(action);
create index idx_policies_agent on policies(agent_code);
create trigger trg_policies_updated before update on policies
  for each row execute function set_updated_at();
```

### 6.10.4 `audit_logs`

一條不可變的動作紀錄（polymorphic）。**append-only**（trigger 阻擋 update/delete，見 §6.13）。

```sql
create table audit_logs (
  id              uuid primary key default gen_random_uuid(),
  actor_id        uuid references actors(id) on delete set null,
  actor_kind      actor_kind not null,
  action          text not null,                   -- 'product.create', 'listing.publish'…
  target_kind     audit_target_kind not null,
  target_id       uuid not null,
  loop_execution_id uuid,                          -- 關聯 LX（可選；不硬 FK 保 append-only 純粹）
  before          jsonb,                           -- 變更前
  after           jsonb,                           -- 變更後
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now()
  -- 無 updated_at：append-only
);
comment on table audit_logs is 'Governance: 不可變動作紀錄（append-only，見 §6.13 trigger）';
create index idx_audit_logs_target on audit_logs(target_kind, target_id, created_at desc);
create index idx_audit_logs_actor on audit_logs(actor_id, created_at desc);
create index idx_audit_logs_action on audit_logs(action);
```

### 6.10.5 `eval_runs`

對某輸出的一次評分。`belongs to agent_run / loop_execution`。

```sql
create table eval_runs (
  id              uuid primary key default gen_random_uuid(),
  target_kind     eval_target_kind not null,       -- agent_run|loop_execution
  target_id       uuid not null,
  verdict         eval_verdict not null,           -- pass|fail|warn
  score           numeric(4,3),                    -- 0.000–1.000
  rubric          text,                            -- 使用的評分準則
  is_human        boolean not null default false,  -- 人工 vs 自動評分
  detail          jsonb not null default '{}',
  evaluator_actor_id uuid references actors(id) on delete set null,
  created_at      timestamptz not null default now()
);
comment on table eval_runs is 'Governance: 對 AgentRun/LX 輸出的評分（自動+人工）';
create index idx_eval_runs_target on eval_runs(target_kind, target_id);
create index idx_eval_runs_verdict on eval_runs(verdict);
```

---

## 6.11 pgvector — Embedding 與 Memory Recall

### 6.11.1 向量索引（HNSW 首選 / ivfflat 備選）

```sql
-- HNSW：查詢快、免訓練、對增量寫入友善（pgvector 0.5+）。cosine 距離。
create index idx_embeddings_hnsw
  on embeddings using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- 備選 ivfflat（資料量大且批次建索引時）：
-- create index idx_embeddings_ivfflat
--   on embeddings using ivfflat (embedding vector_cosine_ops)
--   with (lists = 100);
-- 註：ivfflat 需先有代表性資料才建；查詢前設 set ivfflat.probes = 10;
```

> 維度 `vector(1536)` 對齊 §0.3 的 embedding 供應商（Voyage/OpenAI）。換 model 時同步改維度並重建索引；`embeddings.model` 欄位記錄來源，避免混維度查詢。

### 6.11.2 Memory recall 相似度查詢（範例）

```sql
-- 給定 query 向量 :qvec（app 端先算好），取 top-k 最相近的 memory：
select m.id, m.slug, m.type, m.title, m.content,
       1 - (e.embedding <=> :qvec) as similarity   -- cosine 相似度
from embeddings e
join memories m on m.id = e.owner_id
where e.owner_kind = 'memory'
  and m.type in ('fact', 'preference')             -- 只召回可用記憶
order by e.embedding <=> :qvec                      -- <=> = cosine distance
limit 8;
```

### 6.11.3 相似商品查詢（範例）

```sql
-- 找與某商品最相似的其他商品（去重自己）：
with target as (
  select embedding from embeddings
  where owner_kind = 'product' and owner_id = :product_id
  limit 1
)
select p.id, p.title, 1 - (e.embedding <=> (select embedding from target)) as similarity
from embeddings e
join products p on p.id = e.owner_id
where e.owner_kind = 'product'
  and e.owner_id <> :product_id
order by e.embedding <=> (select embedding from target)
limit 10;
```

> `MemoryStore.recall()`（§0.4 layer 9）在 app 層封裝 §6.11.2；`ContextBuilder`（layer 2）呼叫它組 context，並把召回的 `memory_ids` 記進 `context_snapshots`（可回放）。

---

## 6.12 RLS — Row Level Security（§0.9 預設 deny）

### 6.12.1 原則

- **兩種 actor**：`human`（Supabase Auth user，走 anon/authenticated role）與 `agent`（走 **service role**，`bypassrls`）。
- **agent 讀寫**：service role 天生繞過 RLS，但**必須**經 `PolicyEngine`（§6.10.3）做動作級授權——RLS 管「列可見性」，PolicyEngine 管「能不能做這動作」。
- **human 讀寫**：由 RLS policy 精細控制。**預設 deny**：table 一 `enable row level security` 且不寫 policy，就是全 deny。
- 下面示範 §需求指定的 5 張關鍵 table（+ helper）。其餘 table 依相同 pattern 補齊。

### 6.12.2 Helper：判斷目前是否為認證人類

```sql
-- 目前 request 是否為已登入人類（authenticated）。service role 不會匹配。
create or replace function is_authenticated_human()
returns boolean
language sql stable
as $$
  select auth.role() = 'authenticated' and auth.uid() is not null;
$$;

-- 目前人類是否為 admin（以 app_metadata.role 判斷；於 Supabase Auth 設定）
create or replace function is_admin()
returns boolean
language sql stable
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false
  );
$$;
```

### 6.12.3 `products`

```sql
alter table products enable row level security;

-- 認證人類可讀所有商品
create policy products_select_human on products
  for select to authenticated
  using (is_authenticated_human());

-- 認證人類可新增/改（人工建卡、補件）
create policy products_insert_human on products
  for insert to authenticated
  with check (is_authenticated_human());

create policy products_update_human on products
  for update to authenticated
  using (is_authenticated_human())
  with check (is_authenticated_human());

-- 刪除僅 admin（不可逆動作，§0.9）
create policy products_delete_admin on products
  for delete to authenticated
  using (is_admin());
-- agent（service role）繞過 RLS，改由 PolicyEngine 管動作級授權
```

### 6.12.4 `listings`

```sql
alter table listings enable row level security;

create policy listings_select_human on listings
  for select to authenticated
  using (is_authenticated_human());

-- 人類可建 draft / 編輯文案，但「發佈」（status→published）屬外部副作用：
-- RLS 允許改列，實際 publish 動作由 Publisher Agent + PolicyEngine 執行，
-- 這裡限制人類不得直接把 status 設為 'published'（發佈須走 agent 流程）。
create policy listings_insert_human on listings
  for insert to authenticated
  with check (is_authenticated_human() and status <> 'published');

create policy listings_update_human on listings
  for update to authenticated
  using (is_authenticated_human())
  with check (is_authenticated_human() and status <> 'published');
-- 無 delete policy → 人類不可刪 listing（預設 deny）
```

### 6.12.5 `human_reviews`

```sql
alter table human_reviews enable row level security;

-- 人類看得到指派給自己或未指派的待審
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

-- 人類只能「決策」自己那筆（approve/reject/edit）：限定更新自己被指派的 review
create policy human_reviews_decide on human_reviews
  for update to authenticated
  using (
    is_authenticated_human() and (
      assignee_actor_id is null or is_admin()
      or assignee_actor_id in (
        select id from actors where kind='human' and auth_user_id = auth.uid()
      )
    )
  )
  with check (is_authenticated_human());
-- 建立 HR 由 agent/system（service role）觸發；人類不得 insert（無 insert policy）
```

### 6.12.6 `memories`

```sql
alter table memories enable row level security;

-- 人類可讀所有記憶（透明度）
create policy memories_select_human on memories
  for select to authenticated
  using (is_authenticated_human());

-- 人類可修正/新增記憶（feedback）；刪除限 admin
create policy memories_insert_human on memories
  for insert to authenticated
  with check (is_authenticated_human());

create policy memories_update_human on memories
  for update to authenticated
  using (is_authenticated_human())
  with check (is_authenticated_human());

create policy memories_delete_admin on memories
  for delete to authenticated
  using (is_admin());
-- Memory Agent 寫入走 service role（bypassrls）
```

### 6.12.7 `audit_logs`（唯讀給人類）

```sql
alter table audit_logs enable row level security;

-- 人類（admin）唯讀稽核；一般人不可見（預設 deny）
create policy audit_logs_select_admin on audit_logs
  for select to authenticated
  using (is_admin());
-- 無 insert/update/delete policy 給 authenticated：
--   寫入僅 service role（agent/system），且受 §6.13 append-only trigger 保護
```

> 其餘 table 套用相同 pattern：讀給 authenticated、寫依業務、刪限 admin、外部副作用（publish/回覆客戶）一律走 agent + PolicyEngine。**任何未寫 policy 的 (table, 動作) 組合＝deny。**

---

## 6.13 audit_logs Append-Only（trigger 阻擋 update/delete）

```sql
create or replace function prevent_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs is append-only: % not allowed', tg_op
    using errcode = 'insufficient_privilege';
  return null;
end;
$$;

create trigger trg_audit_logs_no_update
  before update on audit_logs
  for each row execute function prevent_mutation();

create trigger trg_audit_logs_no_delete
  before delete on audit_logs
  for each row execute function prevent_mutation();
```

> 此 trigger 對**所有角色**（含 service role）生效，確保 audit 純粹只增不改。若日後需歸檔，用分區（partition by `created_at`）搬冷資料，而非 delete。同 pattern 亦建議套用於 `price_histories`（歷史不可改）。

---

## 6.14 Migration 策略（Supabase）

### 6.14.1 目錄與命名

```
supabase/
  migrations/
    20260707000100_extensions.sql        -- 6.2.1 extensions
    20260707000200_enums.sql             -- 6.2.2 所有 CREATE TYPE
    20260707000300_functions.sql         -- set_updated_at / prevent_mutation / RLS helpers
    20260707000400_catalog.sql           -- brands/categories/products/product_photos
    20260707000500_pricing.sql           -- price_histories/price_suggestions
    20260707000600_perception.sql        -- ocr/vision/embeddings (+ vector index)
    20260707000700_loop.sql              -- loops/loop_executions/loop_steps/workflows/tasks
    20260707000800_agent.sql             -- agents/agent_runs/skills/prompts/context_snapshots
    20260707000900_memory.sql            -- memories/memory_links
    20260707001000_channel.sql           -- connectors/listings/inquiries/orders/after_sales
    20260707001100_governance.sql        -- actors/human_reviews/policies/audit_logs/eval_runs
    20260707001200_rls.sql               -- 6.12 所有 RLS policy
    20260707001300_audit_append_only.sql -- 6.13 trigger
    20260707009000_seed.sql              -- 6.14.3 seed（idempotent）
```

- **命名慣例**：`<UTC timestamp yyyymmddHHMMSS>_<snake_case_描述>.sql`。時間戳保證順序。
- **依賴順序**：extensions → enums → functions → tables（含 FK 前置表先建）→ vector index → RLS → trigger → seed。
- **前向遷移**：只加不改；改欄位用新 migration（`alter table ... add/alter column`）。禁手改已上線 migration。
- **指令**：本機 `supabase db reset`（重跑全部 + seed）、`supabase migration new <name>`（產生新檔）、`supabase db push`（推到遠端）。

### 6.14.2 FK 建表順序注意

`actors`、`workflows`、`tasks`、`loops`、`agents`、`prompts`、`memories` 被其他表引用，需在引用表之前建立。若同一 migration 內互相引用（如 `tasks` ↔ `loop_executions`），可先建表、後以 `alter table add constraint` 補 FK，或依上面 §6.14.1 拆檔順序處理。

### 6.14.3 Seed 資料（idempotent）

```sql
-- brands / categories 種子
insert into brands (slug, name) values
  ('chanel','Chanel'), ('nike','Nike'), ('lv','Louis Vuitton')
on conflict (slug) do nothing;

insert into categories (slug, name) values
  ('bag','包款'), ('shoes','鞋'), ('appliance','家電'), ('watch','錶')
on conflict (slug) do nothing;

-- actors：system + 7 個 agent（§0.6）
insert into actors (kind, agent_code, display_name) values
  ('agent','vision','Vision Agent'),
  ('agent','ocr','OCR Agent'),
  ('agent','price','Price Agent'),
  ('agent','marketing','Marketing Agent'),
  ('agent','reviewer','Reviewer Agent'),
  ('agent','publisher','Publisher Agent'),
  ('agent','memory','Memory Agent')
on conflict (agent_code) do nothing;

insert into actors (kind, display_name)
select 'system','System'
where not exists (select 1 from actors where kind='system');

-- agents 定義（§0.6；requires_human_review 對齊）
insert into agents (code, name, requires_human_review) values
  ('vision','Vision Agent', false),
  ('ocr','OCR Agent', false),
  ('price','Price Agent', true),        -- 高價/低信心 → HR
  ('marketing','Marketing Agent', true),-- 首次上架 → HR
  ('reviewer','Reviewer Agent', false),
  ('publisher','Publisher Agent', false),
  ('memory','Memory Agent', false)
on conflict (code) do nothing;

-- workflows / loops 種子（SHAP 主流程 §0.7）
insert into workflows (slug, name, description) values
  ('product-lifecycle','Product Lifecycle','SHAP 商品全生命週期主流程')
on conflict (slug) do nothing;

insert into loops (slug, name, trigger_kind) values
  ('drive-ingest','Drive Ingest','cron'),
  ('product-lifecycle','Product Lifecycle','event')
on conflict (slug) do nothing;

-- policies 種子（§0.9 預設 deny + 少量 allow 門檻）
insert into policies (slug, action, agent_code, effect, condition, description) values
  ('publisher-publish-allow','listing.publish','publisher','allow','{}',
    '允許 Publisher 發佈已通過審核的 listing'),
  ('price-apply-threshold','price.apply','price','allow',
    '{"max_price_amount": 3000000}',
    '允許 Price Agent 自動套用 ≤ NT$30,000 的定價；超過須 HR')
on conflict (slug) do nothing;
```

---

## 6.15 關鍵查詢範例

### 6.15.1 某商品的完整生命週期時間軸

```sql
-- 合併照片/感知/估價/刊登/詢問/訂單/售後/審核為單一時間軸
select event_at, event_type, detail from (
  select created_at as event_at, 'photo' as event_type,
         jsonb_build_object('photo_id', id) as detail
    from product_photos where product_id = :product_id
  union all
  select created_at, 'price_suggestion',
         jsonb_build_object('amount', suggested_amount, 'confidence', confidence)
    from price_suggestions where product_id = :product_id
  union all
  select created_at, 'listing_'||status::text,
         jsonb_build_object('listing_id', id, 'external_ref', external_ref)
    from listings where product_id = :product_id
  union all
  select i.created_at, 'inquiry_'||i.status::text,
         jsonb_build_object('inquiry_id', i.id)
    from inquiries i join listings l on l.id = i.listing_id
    where l.product_id = :product_id
  union all
  select created_at, 'order_'||status::text,
         jsonb_build_object('order_id', id, 'amount', amount)
    from orders where product_id = :product_id
  union all
  select a.created_at, 'after_sale_'||a.kind::text,
         jsonb_build_object('after_sale_id', a.id, 'status', a.status)
    from after_sales a join orders o on o.id = a.order_id
    where o.product_id = :product_id
) t
order by event_at asc;
```

### 6.15.2 某 LoopExecution 的所有 steps（含 agent run）

```sql
select s.step_index, s.name, s.kind, s.ref, s.status,
       s.started_at, s.finished_at,
       ar.id as agent_run_id, ar.model, ar.cost_amount, ar.latency_ms
from loop_steps s
left join agent_runs ar on ar.loop_step_id = s.id
where s.loop_execution_id = :loop_execution_id
order by s.step_index asc;
```

### 6.15.3 待人審清單（pending human review）

```sql
select hr.id, hr.target_kind, hr.target_id, hr.reason,
       hr.created_at, hr.expires_at,
       le.id as loop_execution_id,
       a.display_name as assignee
from human_reviews hr
left join loop_executions le on le.id = hr.loop_execution_id
left join actors a on a.id = hr.assignee_actor_id
where hr.status = 'pending'
  and (hr.expires_at is null or hr.expires_at > now())
order by hr.created_at asc;
```

### 6.15.4 Agent 成本彙總（Observability 佐助）

```sql
select ag.code,
       count(*)                       as runs,
       sum(ar.input_tokens)           as in_tokens,
       sum(ar.output_tokens)          as out_tokens,
       sum(ar.cost_amount)            as cost_amount_usd_minor,
       round(avg(ar.latency_ms))      as avg_latency_ms
from agent_runs ar
join agents ag on ag.id = ar.agent_id
where ar.created_at >= now() - interval '7 days'
group by ag.code
order by cost_amount_usd_minor desc nulls last;
```

---

## 本章交付物 (Deliverables)

1. **完整 enum 定義**（§6.2.2）：涵蓋 §0.11 四個權威狀態機（`loop_execution_status`, `human_review_status`, `task_status`, `listing_status`）+ 本章擴充（`agent_run_status`, `connector_kind`, `memory_type`, `actor_kind`, `review_target_kind`, `audit_target_kind`, `loop_step_status/kind`, `agent_code`, `product_status`, `inquiry/order/after_sale` 狀態, `eval_*`, `policy_effect`, `embedding_owner_kind`, `connector_status`）。
2. **31 張 table 的可執行 DDL**（§6.3–6.10），完整覆蓋 §0.5 全部 Entity（`Price` 內嵌於 `products`），每表含欄位型別/not null/default、PK、FK、必要 index、`comment`。
3. **pgvector 落地**（§6.11）：`embeddings` vector(1536) 欄位、HNSW 索引（+ ivfflat 備選）、memory recall / 相似商品相似度查詢範例。
4. **RLS policy**（§6.12）：`products`, `listings`, `human_reviews`, `memories`, `audit_logs` 五張關鍵表的 Row Level Security，區分 human（authenticated）與 agent（service role），預設 deny。
5. **audit_logs append-only trigger**（§6.13）。
6. **Migration 策略 + seed**（§6.14）：`supabase/migrations/*.sql` 分檔命名慣例、依賴順序、idempotent seed（brands/categories/actors/agents/workflows/loops/policies）。
7. **關鍵查詢**（§6.15）：商品生命週期時間軸、LX 全 steps、待人審清單、Agent 成本彙總。

## 驗收條件 (Acceptance Criteria)

- [ ] 所有 DDL 可在乾淨的 Supabase Postgres 15+（啟用 `pgcrypto`/`vector`/`pg_trgm`）依 §6.14 順序**一次跑完無錯**。
- [ ] 每個 §0.5 Entity 都有對應 table（或明確標注為 value object 內嵌）；table 名為 `snake_case` 複數，FK 為 `<singular>_id`。
- [ ] 所有金額欄位為整數 `_amount` + `char(3)` `_currency`；無 float 存錢；時間欄位皆 `timestamptz`。
- [ ] §0.11 四個狀態 enum 的值與順序與合約**逐字一致**。
- [ ] `embeddings` 有 vector 欄位與 HNSW 索引；memory recall 範例查詢可回傳 top-k 相似度。
- [ ] 五張關鍵表啟用 RLS，未定義的 (table, action) 組合預設 deny；agent 走 service role + PolicyEngine。
- [ ] `audit_logs` 的 update/delete 被 trigger 阻擋（含 service role）。
- [ ] `supabase db reset` 後 seed 產生 7 個 agent actor、7 個 agents、`product-lifecycle` workflow、初始 policies，且重跑 idempotent。
- [ ] §6.15 四支查詢在有種子/樣本資料時可正確執行並回傳結果。

---

> 交叉引用：Entity 權威見 `docs/00` §0.5 與 `docs/05`；狀態機見 `docs/00` §0.11 與 `docs/05` §State Machine；Permission/PolicyEngine 見 `docs/07` 與附錄 K；Connector 憑證與冪等見附錄 F；DB 命名完整版見附錄 D；Queue/pg_cron/pgmq 見 `docs/10`。
