-- 20260707T0906_create_perception.sql
-- Context: Perception (docs/06 §6.5, §6.11)
-- Tables: ocr_results, vision_results, embeddings (pgvector + HNSW)
-- Source of truth: docs/06-database-schema.md §6.5 + §6.11
-- 說明：ocr/vision 引用 product_photos(0902) 與 agent_runs(0904)。
--       embeddings 為 polymorphic（owner_kind ∈ product|memory|listing），不做硬 FK。
--       vector extension 已於 0900 開啟；HNSW index（cosine）見 §6.11.1。

-- === ocr_results（§6.5.1）===============================================
create table if not exists ocr_results (
  id               uuid primary key default gen_random_uuid(),
  product_photo_id uuid not null references product_photos(id) on delete cascade,
  agent_run_id     uuid references agent_runs(id) on delete set null,
  raw_text         text,
  fields           jsonb not null default '{}',   -- {model_no, serial, size, material...}
  confidence       numeric(4,3),
  created_at       timestamptz not null default now()
);
comment on table ocr_results is 'Perception: 照片 OCR 抽取（吊牌/型號/序號/尺寸/成分）';
create unique index if not exists uq_ocr_results_photo on ocr_results(product_photo_id);
create index if not exists idx_ocr_results_agent_run on ocr_results(agent_run_id);

-- === vision_results（§6.5.2）============================================
create table if not exists vision_results (
  id               uuid primary key default gen_random_uuid(),
  product_photo_id uuid not null references product_photos(id) on delete cascade,
  agent_run_id     uuid references agent_runs(id) on delete set null,
  brand_guess      text,
  category_guess   text,
  colors           text[] not null default '{}',
  defects          jsonb not null default '[]',   -- [{type, severity, location}]
  attributes       jsonb not null default '{}',
  confidence       numeric(4,3),
  created_at       timestamptz not null default now()
);
comment on table vision_results is 'Perception: 照片視覺理解（品牌/品類/顏色/瑕疵/屬性）';
create unique index if not exists uq_vision_results_photo on vision_results(product_photo_id);
create index if not exists idx_vision_results_agent_run on vision_results(agent_run_id);

-- === embeddings（§6.5.3 + §6.11）========================================
create extension if not exists vector;  -- 保險：確保 pgvector 已啟用
create table if not exists embeddings (
  id         uuid primary key default gen_random_uuid(),
  owner_kind embedding_owner_kind not null,       -- 'product'|'memory'|'listing'
  owner_id   uuid not null,
  content    text,                                 -- 被向量化的原文（可回放）
  embedding  vector(1536) not null,                -- §0.3 Voyage/OpenAI 維度（可換）
  model      text not null,                        -- 產生此向量的 embedding model id
  created_at timestamptz not null default now()
);
comment on table embeddings is 'Perception: 向量（polymorphic owner）；用於 memory recall / 相似商品';
create index if not exists idx_embeddings_owner on embeddings(owner_kind, owner_id);

-- 向量索引（§6.11.1）：HNSW 首選，cosine 距離。
create index if not exists idx_embeddings_hnsw
  on embeddings using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- 備選 ivfflat（資料量大且批次建索引時）：
-- create index idx_embeddings_ivfflat
--   on embeddings using ivfflat (embedding vector_cosine_ops)
--   with (lists = 100);
