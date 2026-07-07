-- 本地示範資料（非正式 seed）。讓 Dashboard 有東西可顯示。
-- 用法：docker exec -i supabase_db_JBG_OS psql -U postgres -d postgres < scripts/seed-demo.sql
-- 或：npx supabase db reset 後手動套用。正式 seed 在 supabase/seed/*。

insert into products (status, title) values
  ('published'::product_status,'Chanel 經典口蓋包'),
  ('reviewing'::product_status,'LV Neverfull MM'),
  ('composed'::product_status,'Hermès 絲巾'),
  ('priced'::product_status,'Nike Dunk Low'),
  ('assembled'::product_status,'Gucci 皮帶');

insert into loop_executions (id, loop_id, status, input, context, cursor, created_at, updated_at, started_at, finished_at)
select '11111111-1111-1111-1111-111111111111', id, 'succeeded', '{"driveFileId":"demo-1"}', '{}', 8,
       now()-interval '20 min', now()-interval '18 min', now()-interval '20 min', now()-interval '18 min'
from loops where slug='product-lifecycle'
on conflict (id) do nothing;

insert into loop_executions (id, loop_id, status, input, context, cursor, created_at, updated_at, started_at)
select '22222222-2222-2222-2222-222222222222', id, 'waiting_human', '{"driveFileId":"demo-2"}', '{}', 5,
       now()-interval '5 min', now()-interval '4 min', now()-interval '5 min'
from loops where slug='product-lifecycle'
on conflict (id) do nothing;

insert into loop_steps (loop_execution_id, step_index, name, kind, ref, status) values
  ('11111111-1111-1111-1111-111111111111',0,'perceive','skill','perceive','succeeded'),
  ('11111111-1111-1111-1111-111111111111',1,'assemble','skill','assemble','succeeded'),
  ('11111111-1111-1111-1111-111111111111',2,'price','agent','price','succeeded'),
  ('22222222-2222-2222-2222-222222222222',0,'perceive','skill','perceive','succeeded'),
  ('22222222-2222-2222-2222-222222222222',1,'human-review','human',null,'skipped')
on conflict do nothing;

insert into human_reviews (target_kind, target_id, status) values
  ('listing', gen_random_uuid(), 'pending'),
  ('price_suggestion', gen_random_uuid(), 'pending');

insert into memories (slug, type, title, content) values
  ('chanel-classic-flap-caviar-60k','fact','Chanel 成交參考','Chanel Classic Flap caviar 成交參考約 NT$60,000。')
on conflict (slug) do nothing;
