-- 20260707T0900_create_enums.sql
-- Context: (extensions + all enum types)
-- Source of truth: docs/06-database-schema.md §6.2 ; enum values 逐字對齊 docs/00 §0.11
-- 說明：本檔為第一支 migration，開啟必要 extensions 並建立所有 CREATE TYPE enum。
--       enum type 必須早於使用它的 table（附錄 D §D.11）。
--       docs/00 §0.11 四個權威狀態機（loop_execution_status / human_review_status /
--       task_status / listing_status）之值與順序與合約逐字一致。
-- 冪等：CREATE TYPE 無 "if not exists"，故每個型別以 do $$ ... $$ 包住檢查 pg_type。

-- === Extensions（docs/06 §6.2.1）=========================================
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "vector";     -- pgvector（embedding）
create extension if not exists "pg_trgm";    -- 文字模糊查詢（品牌/型號）

-- === Enum types（docs/06 §6.2.2）=========================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'loop_execution_status') then
    create type loop_execution_status as enum (
      'queued', 'running', 'waiting_human', 'succeeded', 'failed', 'cancelled'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'human_review_status') then
    create type human_review_status as enum (
      'pending', 'approved', 'rejected', 'edited', 'expired'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type task_status as enum (
      'open', 'in_progress', 'done', 'blocked', 'cancelled'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'listing_status') then
    create type listing_status as enum (
      'draft', 'in_review', 'approved', 'published', 'sold', 'archived'
    );
  end if;
end $$;

-- === 本章擴充（docs/06 §6.2.2 對齊 §0.5 所需）============================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'loop_step_status') then
    create type loop_step_status as enum (
      'pending', 'running', 'succeeded', 'failed', 'skipped'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'loop_step_kind') then
    create type loop_step_kind as enum (
      'agent', 'skill', 'connector', 'human', 'system'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'agent_run_status') then
    create type agent_run_status as enum (
      'running', 'succeeded', 'failed', 'timeout', 'rejected'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'agent_code') then
    create type agent_code as enum (
      'vision', 'ocr', 'price', 'marketing', 'reviewer', 'publisher', 'memory'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'connector_kind') then
    create type connector_kind as enum (
      'drive', 'facebook', 'line'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'connector_status') then
    create type connector_status as enum (
      'active', 'disabled', 'error', 'expired'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'memory_type') then
    create type memory_type as enum (
      'fact', 'preference', 'feedback', 'reference'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'actor_kind') then
    create type actor_kind as enum (
      'human', 'agent', 'system'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'embedding_owner_kind') then
    create type embedding_owner_kind as enum (
      'product', 'memory', 'listing'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'review_target_kind') then
    create type review_target_kind as enum (
      'price_suggestion', 'listing', 'product', 'order', 'after_sale', 'loop_execution'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'audit_target_kind') then
    create type audit_target_kind as enum (
      'product', 'listing', 'order', 'price_suggestion', 'human_review',
      'loop_execution', 'agent_run', 'memory', 'connector', 'policy'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'inquiry_status') then
    create type inquiry_status as enum (
      'new', 'in_progress', 'answered', 'converted', 'closed'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type order_status as enum (
      'pending', 'paid', 'shipped', 'completed', 'refunded', 'cancelled'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'after_sale_kind') then
    create type after_sale_kind as enum (
      'return', 'exchange', 'complaint', 'repurchase', 'other'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'after_sale_status') then
    create type after_sale_status as enum (
      'open', 'in_progress', 'resolved', 'rejected'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'eval_target_kind') then
    create type eval_target_kind as enum ('agent_run', 'loop_execution');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'eval_verdict') then
    create type eval_verdict as enum ('pass', 'fail', 'warn');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'product_status') then
    create type product_status as enum (
      'ingested', 'assembled', 'gap', 'priced', 'composed',
      'reviewing', 'published', 'sold', 'archived'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'policy_effect') then
    create type policy_effect as enum ('allow', 'deny');
  end if;
end $$;

-- === 共用 trigger functions（docs/06 §6.2.3 / §6.13）=====================

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function prevent_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'append-only table: % not allowed', tg_op
    using errcode = 'insufficient_privilege';
  return null;
end;
$$;
