-- 20260707T0908_create_channel.sql
-- Context: Channel (docs/06 §6.9)
-- Tables: connectors, listings, inquiries, orders, after_sales
-- Source of truth: docs/06-database-schema.md §6.9
-- 說明：listings 引用 products(0902)/connectors/agent_runs(0904)；orders 引用 products/inquiries/listings。
--       憑證以 credentials_ref 指向 secret，不存明碼 token。

-- === connectors（§6.9.1）================================================
create table if not exists connectors (
  id              uuid primary key default gen_random_uuid(),
  kind            connector_kind not null,         -- drive|facebook|line
  name            text not null,
  status          connector_status not null default 'active',
  config          jsonb not null default '{}',     -- 非機密設定（folder id, page id…）
  credentials_ref text,                             -- 指向 Vault/secret
  last_synced_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table connectors is 'Channel: 對外連線（Drive/FB/LINE）；憑證以 ref 指向 secret，不存明碼';
create index if not exists idx_connectors_kind on connectors(kind);
create trigger trg_connectors_updated before update on connectors
  for each row execute function set_updated_at();

-- === listings（§6.9.2）==================================================
create table if not exists listings (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references products(id) on delete cascade,
  connector_id   uuid references connectors(id) on delete set null,
  status         listing_status not null default 'draft',  -- §0.11
  title          text,
  body           text,                             -- FB 文案
  hashtags       text[] not null default '{}',
  external_ref   text,                             -- FB post id（發佈後）
  price_amount   bigint,
  price_currency char(3) not null default 'TWD',
  agent_run_id   uuid references agent_runs(id) on delete set null,
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table listings is 'Channel: 商品在通路（FB）的刊登（狀態機 §0.11）';
create index if not exists idx_listings_product on listings(product_id);
create index if not exists idx_listings_status on listings(status);
create unique index if not exists uq_listings_external on listings(connector_id, external_ref)
  where external_ref is not null;
create trigger trg_listings_updated before update on listings
  for each row execute function set_updated_at();

-- === inquiries（§6.9.3）=================================================
create table if not exists inquiries (
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid not null references listings(id) on delete cascade,
  status          inquiry_status not null default 'new',
  external_ref    text,                            -- FB comment/message id
  customer_handle text,
  message         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table inquiries is 'Channel: 客戶詢問（可轉 Order）';
create index if not exists idx_inquiries_listing on inquiries(listing_id);
create index if not exists idx_inquiries_status on inquiries(status);
create trigger trg_inquiries_updated before update on inquiries
  for each row execute function set_updated_at();

-- === orders（§6.9.4）====================================================
create table if not exists orders (
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
create index if not exists idx_orders_product on orders(product_id);
create index if not exists idx_orders_inquiry on orders(inquiry_id);
create index if not exists idx_orders_status on orders(status);
create trigger trg_orders_updated before update on orders
  for each row execute function set_updated_at();

-- === after_sales（§6.9.5）===============================================
create table if not exists after_sales (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references orders(id) on delete cascade,
  kind       after_sale_kind not null,            -- return|exchange|complaint|repurchase|other
  status     after_sale_status not null default 'open',
  detail     text,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table after_sales is 'Channel: 售後事件（退換/客訴/回購）';
create index if not exists idx_after_sales_order on after_sales(order_id);
create index if not exists idx_after_sales_status on after_sales(status);
create trigger trg_after_sales_updated before update on after_sales
  for each row execute function set_updated_at();
