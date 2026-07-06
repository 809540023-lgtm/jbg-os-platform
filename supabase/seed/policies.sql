-- seed/policies.sql — Governance 授權規則種子（idempotent）
-- Source: docs/06 §6.14.3 ; §0.9 預設 deny + 少量 allow 門檻
-- 含「publish 需 HR / 受 Permission 管」規則：Publisher 僅可發佈已通過審核的 listing。

insert into policies (slug, action, agent_code, effect, condition, description) values
  ('publisher-publish-allow', 'listing.publish', 'publisher', 'allow', '{}',
    '允許 Publisher 發佈已通過審核的 listing'),
  ('price-apply-threshold',   'price.apply',     'price',     'allow',
    '{"max_price_amount": 3000000}',
    '允許 Price Agent 自動套用 ≤ NT$30,000 的定價；超過須 HR')
on conflict (slug) do nothing;
