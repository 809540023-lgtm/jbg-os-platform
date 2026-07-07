-- 規劃書 §1.1 混合制 + §5.1 履約保障（款項代管）。additive migration。

-- 商品來源：own=自有現貨（門面/信任）、brokered=朋友貨源撮合直送
do $$ begin
  if not exists (select 1 from pg_type where typname = 'product_source') then
    create type product_source as enum ('own', 'brokered');
  end if;
end $$;

alter table products
  add column if not exists source product_source not null default 'own',
  -- 撮合貨的供應者代號（朋友網絡；不揭露於前台）
  add column if not exists supplier_ref text;

-- 款項代管（escrow）狀態：付款→平台代管→出貨→驗收→撥付賣家
-- pending_payment  買家尚未付款
-- funds_held       款項已入平台代管
-- delivered        設備已送達、待驗收
-- released         驗收無誤，款項已撥付賣家（終態-成功）
-- disputed         驗收有爭議，進入爭議流程
-- refunded         爭議成立退款買家（終態）
do $$ begin
  if not exists (select 1 from pg_type where typname = 'escrow_status') then
    create type escrow_status as enum (
      'pending_payment', 'funds_held', 'delivered', 'released', 'disputed', 'refunded'
    );
  end if;
end $$;

alter table orders
  add column if not exists escrow_status escrow_status not null default 'pending_payment',
  add column if not exists funds_held_at timestamptz,
  add column if not exists delivered_at  timestamptz,
  add column if not exists released_at   timestamptz,
  -- 驗收標準快照（下訂時從商品頁可驗收項複製，爭議時以此為準 —— 規劃書 §5.1 第三道防線）
  add column if not exists acceptance_criteria jsonb not null default '[]',
  add column if not exists dispute_reason text;

create index if not exists idx_orders_escrow_status on orders (escrow_status);
create index if not exists idx_products_source on products (source);

comment on column products.source is '商品來源：own=自有現貨, brokered=撮合直送（規劃書混合制）';
comment on column orders.escrow_status is '款項代管狀態（規劃書 §5.1 履約保障）';
