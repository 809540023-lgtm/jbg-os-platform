-- 20260707T0907_create_memory.sql
-- Context: Memory (docs/06 §6.8)
-- Tables: memories, memory_links
-- Source of truth: docs/06-database-schema.md §6.8
-- 說明：memory_links 為 memories 自關聯的具名 join（§0.5 MemoryLink 是有意義 Entity，故用 id PK）。

-- === memories（§6.8.1）==================================================
create table if not exists memories (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique,                       -- [[slug]] 供 MemoryLink 引用
  type        memory_type not null,              -- fact|preference|feedback|reference
  title       text,
  content     text not null,
  source_kind text,                              -- 'order'|'inquiry'|'after_sale' ...
  source_id   uuid,
  confidence  numeric(4,3),
  created_by  uuid,                              -- actors.id（docs/06 為裸 uuid）
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table memories is 'Memory: 跨執行記憶（fact/preference/feedback/reference）';
create index if not exists idx_memories_type on memories(type);
create index if not exists idx_memories_source on memories(source_kind, source_id);
create trigger trg_memories_updated before update on memories
  for each row execute function set_updated_at();

-- === memory_links（§6.8.2）==============================================
create table if not exists memory_links (
  id             uuid primary key default gen_random_uuid(),
  from_memory_id uuid not null references memories(id) on delete cascade,
  to_memory_id   uuid not null references memories(id) on delete cascade,
  relation       text not null default 'related', -- 'related'|'supersedes'|'contradicts'
  created_at     timestamptz not null default now(),
  constraint ck_memory_links_not_self check (from_memory_id <> to_memory_id),
  unique (from_memory_id, to_memory_id, relation)
);
comment on table memory_links is 'Memory: 記憶間關聯（[[slug]] graph）';
create index if not exists idx_memory_links_from on memory_links(from_memory_id);
create index if not exists idx_memory_links_to on memory_links(to_memory_id);
