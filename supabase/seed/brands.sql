-- seed/brands.sql — Catalog 品牌種子（idempotent）
-- Source: docs/06 §6.14.3
insert into brands (slug, name) values
  ('chanel', 'Chanel'),
  ('nike',   'Nike'),
  ('lv',     'Louis Vuitton')
on conflict (slug) do nothing;
