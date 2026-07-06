-- seed/loops.sql — Loop / Workflow 種子（idempotent）
-- Source: docs/06 §6.14.3 ; §0.7 SHAP 主流程 product-lifecycle

insert into workflows (slug, name, description) values
  ('product-lifecycle', 'Product Lifecycle', 'SHAP 商品全生命週期主流程')
on conflict (slug) do nothing;

insert into loops (slug, name, trigger_kind) values
  ('drive-ingest',      'Drive Ingest',      'cron'),
  ('product-lifecycle', 'Product Lifecycle', 'event')
on conflict (slug) do nothing;
