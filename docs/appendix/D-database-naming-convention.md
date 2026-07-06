# 附錄 D · Database Naming Convention

> 本附錄把 §0.10「Database」段展開成完整、可直接遵循的 Supabase Postgres（§0.3，PG 15+）命名與建模規範。
> 與 `docs/00-canonical-model.md` 衝突時，**以 00 為準**。Entity 名稱引用 §0.5，狀態機 enum 引用 §0.11，PK/FK/金額規則引用 §0.10。API 對應見附錄 C。

---

## D.1 Table 命名

- **snake_case、複數**：`products`, `loop_executions`, `price_histories`, `human_reviews`。
- table 名 = §0.5 Entity 的 snake_case 複數形（`ProductPhoto` → `product_photos`；`AfterSale` → `after_sales`）。
- 不加前綴（不用 `tbl_`、不用 context 前綴）；context 靠 schema 分組或靠 migration 檔名區隔即可。
- 不可縮寫到看不懂（`price_histories` 不寫成 `pr_hist`）。

| Entity (§0.5) | Table |
|---|---|
| `Product` | `products` |
| `ProductPhoto` | `product_photos` |
| `PriceHistory` | `price_histories` |
| `LoopExecution` | `loop_executions` |
| `PriceSuggestion` | `price_suggestions` |
| `HumanReview` | `human_reviews` |
| `AuditLog` | `audit_logs` |

---

## D.2 主鍵 (Primary Key)

- 一律 `id uuid primary key default gen_random_uuid()`（§0.10）。
- 不用自增整數 PK（避免可猜、利於分散與外部曝光）。
- 複合 PK 只用於 join table（見 D.10）。

```sql
id uuid primary key default gen_random_uuid()
```

---

## D.3 外鍵 (Foreign Key)

- 欄位名 = `<referenced_singular>_id`：`product_id`, `loop_execution_id`, `agent_run_id`（§0.10）。
- 型別 `uuid`，指向目標表 `id`；明確宣告 `references` 與 `on delete` 行為。
- 多形關聯（polymorphic，如 `AuditLog`、`Embedding`、`HumanReview`）用 `<name>_type` + `<name>_id` 一組，`_type` 存 Entity 名。

```sql
product_id uuid not null references products(id) on delete cascade,
-- polymorphic：
target_type text not null,   -- 'Product' | 'Listing' | ...
target_id   uuid not null
```

`on delete` 準則：
- 子資源隨父刪 → `on delete cascade`（`product_photos.product_id`）。
- 需保留歷史/稽核 → `on delete restrict` 或 `set null`（`audit_logs` 不 cascade）。

---

## D.4 時間欄位 (Timestamps)

- `created_at timestamptz not null default now()`。
- `updated_at timestamptz not null default now()`，並用 trigger 自動更新。
- 型別一律 `timestamptz`（存 UTC），禁用 `timestamp`(無時區)。
- 業務時間點另命名清楚：`published_at`, `sold_at`, `reviewed_at`, `deleted_at`（見 D.9）。

```sql
created_at timestamptz not null default now(),
updated_at timestamptz not null default now()
-- + moddatetime / 自訂 trigger 維護 updated_at
```

---

## D.5 Enum 命名 (§0.11)

- Postgres `enum` type 命名 `<entity>_<field>`：`loop_execution_status`, `human_review_status`, `task_status`, `listing_status`。
- enum 值用 snake_case，且**與 §0.11 完全一致**：

```sql
create type loop_execution_status as enum
  ('queued','running','waiting_human','succeeded','failed','cancelled');

create type human_review_status as enum
  ('pending','approved','rejected','edited','expired');

create type task_status as enum
  ('open','in_progress','done','blocked','cancelled');

create type listing_status as enum
  ('draft','in_review','approved','published','sold','archived');
```

- 欄位使用該 type：`status loop_execution_status not null default 'queued'`。
- 新增 enum 值用 `alter type ... add value`（不可刪值，故命名要謹慎）。

---

## D.6 布林欄位

- 前綴 `is_` / `has_`（§0.10）：`is_published`, `is_default`, `has_defect`, `is_deleted`。
- 一律 `not null default false`（避免三態 null）。
- 不用否定命名（用 `is_active` 不用 `is_not_active`）。

---

## D.7 金額欄位

- 存**整數**、單位 = 最小貨幣單位（TWD 用「元」的整數即可、JPY 無小數），欄位後綴 `_amount`；搭配 `_currency char(3)`（§0.10）。
- **禁用 `float`/`double` 存錢**；需要小數的貨幣用 `bigint` 存最小單位或 `numeric`。
- 一個金額 = 一對欄位：`price_amount bigint` + `price_currency char(3)`。

```sql
price_amount   bigint not null,
price_currency char(3) not null default 'TWD'
```

| ✅ good | ❌ bad |
|---|---|
| `price_amount bigint` + `price_currency char(3)` | `price float` |
| `suggested_amount` + `suggested_currency` | `suggested_price numeric(10,2)`（無幣別） |

---

## D.8 索引 / 唯一鍵 / FK 約束命名

| 物件 | 命名 | 範例 |
|---|---|---|
| 一般 index | `idx_<table>_<cols>` | `idx_products_brand_id`, `idx_loop_executions_status` |
| 唯一 index | `uq_<table>_<cols>` | `uq_listings_connector_id_external_post_id` |
| 外鍵約束 | `fk_<table>_<col>` | `fk_product_photos_product_id` |
| 主鍵約束 | `pk_<table>`（多用預設即可） | `pk_loop_step` |
| check 約束 | `ck_<table>_<rule>` | `ck_price_suggestions_confidence_range` |

規則：
- 多欄 index 欄位用底線相接、依查詢順序排列：`idx_price_histories_product_id_created_at`。
- 每個 FK 欄位通常都建 index（Postgres 不自動為 FK 建 index）。
- 唯一鍵表達業務不變量（一個 Product 在同一 Connector 上只有一個 external post）：`uq_listings_connector_id_external_post_id`。

```sql
create index idx_products_brand_id on products (brand_id);
create index idx_loop_executions_status on loop_executions (status);
create unique index uq_listings_connector_id_external_post_id
  on listings (connector_id, external_post_id);
```

---

## D.9 Soft Delete 策略

- 需保留/可還原的實體用 soft delete：加 `deleted_at timestamptz`（null = 未刪）。
- 搭配布林 `is_deleted`（generated 或由 app 維護）供索引與 RLS 判斷；查詢預設帶 `where deleted_at is null`（用 view 或 RLS 封裝）。
- 真正一次性、無稽核價值的關聯資料（如暫存 `context_snapshots`）可硬刪。
- `audit_logs` **永不**刪（append-only）。

```sql
deleted_at timestamptz,             -- null = alive
-- 建部分索引只涵蓋存活列
create index idx_products_alive on products (id) where deleted_at is null;
```

---

## D.10 Audit 欄位 與 多對多 Join Table

### Audit 欄位

- 每張業務表建議帶：`created_at`, `updated_at`（D.4）、`created_by uuid`, `updated_by uuid`（指向 `actors.id`，§0.5 `Actor`）。
- 不可變的動作紀錄集中在 `audit_logs`（§0.5 `AuditLog`，polymorphic、append-only）。
- `created_by`/`updated_by` 記錄發起 Actor（human 或 agent），對應 §0.9 兩種 Actor。

```sql
created_by uuid references actors(id),
updated_by uuid references actors(id)
```

### 多對多 Join Table

- 命名 = 兩表**單數**以底線相接、字母序排列：`<a>_<b>`。
  - `Memory` ↔ `Memory`（自關聯，§0.5 `MemoryLink`）用具名表 `memory_links`（因它是有意義的 Entity）。
  - 純連接（無自身屬性）用 `product_tags`, `agent_skills`（`Agent` 可用哪些 `Skill`）。
- join table 用複合 PK `(a_id, b_id)`，兩欄皆 FK；若 join 本身有屬性/需被引用，才改用獨立 `id uuid` PK。

```sql
create table agent_skills (
  agent_id uuid not null references agents(id) on delete cascade,
  skill_id uuid not null references skills(id) on delete cascade,
  primary key (agent_id, skill_id)
);
```

| ✅ good | ❌ bad |
|---|---|
| `agent_skills` (單數_單數，字母序) | `skill_agent_map` / `AgentSkills` |
| `product_tags` | `product_tag_relation` |

---

## D.11 Migration 檔命名與順序

- 位置：`supabase/migrations/`（§0.3、附錄 A）。
- 命名：`<timestamp>_<verb>_<context>_<object>.sql`，timestamp 保證順序（Supabase 慣例 `YYYYMMDDHHMMSS`）。
  - 動詞：`create` / `alter` / `add` / `drop` / `backfill` / `enable_rls`。
  - 一個 migration 做一件語意完整的事，可安全前滾。

```
20260707090000_create_catalog_products.sql
20260707090100_create_catalog_product_photos.sql
20260707090200_create_perception_ocr_results.sql
20260707091000_create_enum_loop_execution_status.sql
20260707091100_create_loop_loop_executions.sql
20260707092000_enable_rls_products.sql
20260708100000_add_products_deleted_at.sql
```

規則：
- enum type 的 migration 排在使用它的 table 之前。
- RLS：每張 table 建立後緊跟 `enable_rls_<table>.sql`（§0.9：預設 deny，逐表寫 policy）。
- 已合併進 main 的 migration **不可修改**，只能追加新 migration 修正（前滾）。
- 破壞性變更（改欄型別、刪欄）分兩步：先 additive + backfill，再於後續 migration 移除舊欄。

| ✅ good | ❌ bad |
|---|---|
| `20260707090000_create_catalog_products.sql` | `products.sql` / `migration1.sql` |
| `20260708100000_add_products_deleted_at.sql` | `fix.sql` |
| enum 先於 table | 先建 table 再建 enum（順序錯，套用失敗） |

---

## D.12 完整範例（Product 表片段）

```sql
create table products (
  id             uuid primary key default gen_random_uuid(),
  brand_id       uuid references brands(id) on delete set null,
  category_id    uuid references categories(id) on delete set null,
  title          text not null,
  status         listing_status not null default 'draft',
  price_amount   bigint,
  price_currency char(3) not null default 'TWD',
  is_published   boolean not null default false,
  has_defect     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references actors(id),
  updated_by     uuid references actors(id),
  deleted_at     timestamptz
);

create index idx_products_brand_id on products (brand_id);
create index idx_products_status   on products (status);
create index idx_products_alive    on products (id) where deleted_at is null;
```

---

## D.13 命名對照速查：good / bad

| 面向 | ✅ good | ❌ bad |
|---|---|---|
| table | `loop_executions` | `LoopExecution` / `loopexecution` / `loop_execution`(單數) |
| PK | `id uuid default gen_random_uuid()` | `product_id serial` |
| FK | `product_id uuid references products(id)` | `productId` / `fk_product` |
| 時間 | `created_at timestamptz` | `created` / `create_time timestamp` |
| enum type | `loop_execution_status` | `status_enum` / `LoopStatus` |
| 布林 | `is_published` | `published` / `publish_flag` |
| 金額 | `price_amount bigint` + `price_currency` | `price money` / `price float` |
| index | `idx_products_brand_id` | `products_brand_idx` / `index1` |
| 唯一鍵 | `uq_listings_connector_id_external_post_id` | `unique_listing` |
| join table | `agent_skills` | `AgentSkill` / `agents_to_skills` |
| migration | `20260707090000_create_catalog_products.sql` | `create_products.sql` |

---

## D.14 檢查清單 (Checklist)

- [ ] table 為 snake_case 複數，等於 §0.5 Entity 的複數形，無前綴。
- [ ] PK 為 `id uuid default gen_random_uuid()`；join table 才用複合 PK。
- [ ] FK 命名 `<singular>_id`、宣告 `references` 與 `on delete` 行為；每個 FK 欄位有 index。
- [ ] 多形關聯用 `<name>_type` + `<name>_id`，`_type` 存 Entity 名。
- [ ] 時間欄用 `timestamptz`；`created_at`/`updated_at` 具 default，`updated_at` 有 trigger。
- [ ] enum type 命名 `<entity>_<field>`，值與 §0.11 完全一致；enum migration 早於使用它的 table。
- [ ] 布林用 `is_`/`has_` 前綴、`not null default false`。
- [ ] 金額用整數 `_amount` + `_currency char(3)`，未用 float/money。
- [ ] index/唯一鍵/FK 約束遵 `idx_` / `uq_` / `fk_` 命名。
- [ ] 需保留的實體用 `deleted_at` soft delete；`audit_logs` append-only。
- [ ] 業務表帶 `created_by`/`updated_by`（→ `actors`）；join table 命名為單數_單數字母序。
- [ ] migration 檔名 `<timestamp>_<verb>_<context>_<object>.sql`，已合併者不改、只前滾；建表後緊跟 `enable_rls`（§0.9）。
