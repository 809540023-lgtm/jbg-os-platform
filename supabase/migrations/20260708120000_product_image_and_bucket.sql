-- 手動上架 + 商品照片（P1）。products 直接存主圖 URL（MVP；未來可換 product_photos 關聯）。
alter table products
  add column if not exists image_url text;

comment on column products.image_url is '商品主圖公開 URL（Supabase Storage）；MVP 直存，未來可改 primary_photo_id 關聯';

-- Supabase Storage bucket：公開可讀（商品照片給客人看），寫入走 service_role。
insert into storage.buckets (id, name, public)
values ('product-photos', 'product-photos', true)
on conflict (id) do nothing;
