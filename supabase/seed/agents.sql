-- seed/agents.sql — 7 個 canonical agent + agent actors（idempotent）
-- Source: docs/06 §6.14.3 ; §0.6 權威 7 agent（vision/ocr/price/marketing/reviewer/publisher/memory）

-- actors：7 個 agent + system（§0.9 兩種 actor + system）
insert into actors (kind, agent_code, display_name) values
  ('agent', 'vision',    'Vision Agent'),
  ('agent', 'ocr',       'OCR Agent'),
  ('agent', 'price',     'Price Agent'),
  ('agent', 'marketing', 'Marketing Agent'),
  ('agent', 'reviewer',  'Reviewer Agent'),
  ('agent', 'publisher', 'Publisher Agent'),
  ('agent', 'memory',    'Memory Agent')
on conflict (agent_code) where agent_code is not null do nothing;

insert into actors (kind, display_name)
select 'system', 'System'
where not exists (select 1 from actors where kind = 'system');

-- agents 定義（§0.6；requires_human_review 對齊）
insert into agents (code, name, requires_human_review) values
  ('vision',    'Vision Agent',    false),
  ('ocr',       'OCR Agent',       false),
  ('price',     'Price Agent',     true),   -- 高價/低信心 → HR
  ('marketing', 'Marketing Agent', true),   -- 首次上架 → HR
  ('reviewer',  'Reviewer Agent',  false),
  ('publisher', 'Publisher Agent', false),
  ('memory',    'Memory Agent',    false)
on conflict (code) do nothing;
