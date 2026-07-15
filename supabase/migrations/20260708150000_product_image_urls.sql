-- 一台設備多張照片（相簿）。image_url 保留為主圖（=image_urls[0]），相容既有單圖程式。
alter table products
  add column if not exists image_urls jsonb not null default '[]';

-- 回填：既有單圖 → 陣列。
update products
  set image_urls = jsonb_build_array(image_url)
  where image_url is not null and (image_urls is null or image_urls = '[]'::jsonb);

comment on column products.image_urls is '商品照片 URL 陣列（相簿）；image_url 為主圖=第一張';
