-- seed/policies.sql — Governance 授權規則種子（idempotent）
-- Source: docs/06 §6.14.3 ; §0.9 預設 deny + 少量門檻
-- 對齊 runtime PolicyEngine.defaultMvpRules（@jbg/domain）與 R3 裁決（policy_effect 含 require_human）。

insert into policies (slug, action, agent_code, effect, condition, description) values
  ('publish-requires-human', 'listing.publish', 'publisher', 'require_human', '{}',
    '發佈至 FB 為不可逆外部副作用，一律人審（§0.9）'),
  ('price-apply-threshold',  'price.apply',     'price',     'require_human',
    '{"gt_amount": 3000000, "currency": "TWD"}',
    'Price Agent 建議 > NT$30,000（3,000,000 分）須人審；未超門檻走預設 deny，需明文放行')
on conflict (slug) do nothing;
