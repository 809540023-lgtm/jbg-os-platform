-- 分類/地區改正式欄位（原本靠標題字串猜，脆弱）。slug 對齊 app/lib/landing.ts。
alter table products
  add column if not exists category text,  -- ice-machine|commercial-fridge|dishwasher|stove|stainless
  add column if not exists region text;    -- taipei|new-taipei|taoyuan|hsinchu|taichung

create index if not exists idx_products_category on products (category);
create index if not exists idx_products_region on products (region);

-- 回填既有商品（依標題；新北需先於台北比對）。
update products set region = case
  when title like '%新北%' then 'new-taipei'
  when title like '%桃園%' then 'taoyuan'
  when title like '%新竹%' then 'hsinchu'
  when title like '%台中%' then 'taichung'
  when title like '%台北%' then 'taipei'
  else region end
where region is null;

update products set category = case
  when title like '%製冰機%' then 'ice-machine'
  when title like '%洗碗機%' then 'dishwasher'
  when title like '%冰箱%' then 'commercial-fridge'
  when title like '%爐%' then 'stove'
  when title like '%不鏽鋼%' then 'stainless'
  else category end
where category is null;
