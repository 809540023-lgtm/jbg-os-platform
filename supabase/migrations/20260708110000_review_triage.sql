-- 人審智能分流（規劃書 §5.2「price 信心足夠 → 高信心自動放行」）。
-- 給 human_reviews 加分流訊號欄位（信心、金額），供 triage 判斷可否自動放行。
alter table human_reviews
  add column if not exists confidence numeric(3,2),   -- 觸發此審核的 agent 信心 0..1
  add column if not exists amount bigint,             -- 涉及金額（price 類），TWD 整數
  add column if not exists currency char(3) default 'TWD';

comment on column human_reviews.confidence is '觸發 agent 的信心，triage 分流用（規劃書 §5.2）';
