-- 20260707T0902_create_catalog.sql
-- Context: Catalog (docs/06 §6.3)
-- Tables: brands, categories, products, product_photos
-- Source of truth: docs/06-database-schema.md §6.3
-- 說明：Price 為 products 上的 value object（price_amount/price_currency 內嵌），不獨立成表。
--       products.created_by 依 docs/06 為裸 uuid（非硬 FK），忠實搬運。

-- === brands（§6.3.1）====================================================
create table if not exists brands (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,               -- 'chanel', 'nike'
  name       text not null,
  name_ja    text,                               -- 日文名（SHAP-specific）
  aliases    text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table brands is 'Catalog: 品牌主檔';
create index if not exists idx_brands_name_trgm on brands using gin (name gin_trgm_ops);
create trigger trg_brands_updated before update on brands
  for each row execute function set_updated_at();

-- === categories（§6.3.2）================================================
create table if not exists categories (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,               -- 'bag', 'shoes', 'appliance'
  name       text not null,
  parent_id  uuid references categories(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table categories is 'Catalog: 品類主檔（可階層）';
create index if not exists idx_categories_parent on categories(parent_id);
create trigger trg_categories_updated before update on categories
  for each row execute function set_updated_at();

-- === products（§6.3.3）==================================================
create table if not exists products (
  id             uuid primary key default gen_random_uuid(),
  brand_id       uuid references brands(id) on delete set null,
  category_id    uuid references categories(id) on delete set null,
  title          text,
  description    text,
  condition      text,                            -- 成色（'S','A','九成新'）
  attributes     jsonb not null default '{}',     -- 合併 OCR+Vision 的結構化屬性
  status         product_status not null default 'ingested',
  -- Price value object（§0.10 金額規範）
  price_amount   bigint,
  price_currency char(3) not null default 'TWD',
  cost_amount    bigint,
  cost_currency  char(3) not null default 'JPY',
  source_ref     text,                            -- SHAP-specific：Drive 來源
  created_by     uuid,                            -- actors.id（發起者；docs/06 為裸 uuid）
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table products is 'Catalog: 商品（aggregate root）；內嵌 Price value object';
comment on column products.attributes is '合併 OCR/Vision 的結構化屬性（品牌信心、瑕疵、尺寸…）';
create index if not exists idx_products_brand on products(brand_id);
create index if not exists idx_products_category on products(category_id);
create index if not exists idx_products_status on products(status);
create index if not exists idx_products_created_at on products(created_at desc);
create trigger trg_products_updated before update on products
  for each row execute function set_updated_at();

-- === product_photos（§6.3.4）============================================
create table if not exists product_photos (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references products(id) on delete cascade,
  storage_path  text not null,                    -- Supabase Storage 路徑
  drive_file_id text,                             -- SHAP-specific：Google Drive file id
  width         int,
  height        int,
  is_primary    boolean not null default false,
  position      int not null default 0,
  created_at    timestamptz not null default now()
);
comment on table product_photos is 'Catalog: 商品照片（源自 Drive）';
create index if not exists idx_product_photos_product on product_photos(product_id);
create unique index if not exists uq_product_photos_drive on product_photos(drive_file_id)
  where drive_file_id is not null;             -- 冪等 ingest
