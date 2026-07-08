-- AI 客服（Inquiry Agent，canonical §0.6 v1.1）：讓詢問可來自網站商品頁、並存 AI 草稿。
-- additive migration。注意：ALTER TYPE ADD VALUE 必須在使用它之前 commit（獨立交易）。

-- 登錄第 8 個 agent 代號到 enum（必須先於下方 insert 執行並 commit）
alter type agent_code add value if not exists 'inquiry';

-- 原 inquiries.listing_id NOT NULL 且只綁 FB listing；網站詢問直接綁 product。
alter table inquiries
  alter column listing_id drop not null,
  add column if not exists product_id uuid references products(id) on delete cascade,
  add column if not exists channel text not null default 'web',   -- web / facebook / line
  add column if not exists ai_draft text,                          -- Inquiry Agent 草擬回覆
  add column if not exists ai_confidence numeric(3,2),             -- 0..1
  add column if not exists ai_requires_human boolean,              -- 是否強制人審（議價/客訴/承諾）
  add column if not exists answer text,                            -- 實際送出的回覆（人審核定）
  add column if not exists answered_at timestamptz;

create index if not exists idx_inquiries_product on inquiries (product_id);
create index if not exists idx_inquiries_status on inquiries (status);

comment on column inquiries.ai_draft is 'Inquiry Agent 草擬回覆（未送出；送出=不可逆動作需 HR，守則#4）';

-- 登錄第 8 個 canonical agent：inquiry（客服）
insert into actors (kind, agent_code, display_name) values ('agent', 'inquiry', 'Inquiry Agent')
on conflict (agent_code) where agent_code is not null do nothing;

insert into agents (code, name, requires_human_review) values
  ('inquiry', 'Inquiry Agent', true)   -- 回覆客戶＝不可逆，預設需 HR
on conflict (code) do nothing;
