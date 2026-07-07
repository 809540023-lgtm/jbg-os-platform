-- Product runtime 欄位補充（R5 定案：以 DB 為準，additive 對齊 domain）。
-- domain 的 Product 有 primaryPhotoId / missingFields，migration 原本未涵蓋。
alter table products
  add column if not exists primary_photo_id uuid,
  add column if not exists missing_fields   text[] not null default '{}';
