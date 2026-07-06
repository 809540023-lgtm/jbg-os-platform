-- seed/categories.sql — Catalog 品類種子（idempotent）
-- Source: docs/06 §6.14.3
insert into categories (slug, name) values
  ('bag',       '包款'),
  ('shoes',     '鞋'),
  ('appliance', '家電'),
  ('watch',     '錶')
on conflict (slug) do nothing;
