-- 本地/雲端示範資料 —— 餐飲二手設備（對齊「JBG_OS 平台規劃書-二手」領域）。
-- 用法：docker exec -i supabase_db_JBG_OS psql -U postgres -d postgres < scripts/seed-demo.sql
-- 正式 seed 在 supabase/seed/*；此檔為 demo。

-- 品類（餐飲設備）
insert into categories (slug, display_name, required_attributes) values
  ('ice-machine',   '製冰機',        array['brand','capacity']),
  ('commercial-fridge','商用冰箱',   array['doors','voltage']),
  ('dishwasher',    '洗碗機',        array['type']),
  ('stove',         '爐具',          array['burners']),
  ('stainless',     '不鏽鋼設備',    array['size'])
on conflict (slug) do nothing;

-- 品牌（製冰機常見）
insert into brands (slug, display_name, aliases, tier) values
  ('manitowoc', '萬利多', array['Manitowoc','萬利多'], 'premium'),
  ('scotsman',  'Scotsman', array['Scotsman'], 'premium'),
  ('hoshizaki', '力頓', array['Hoshizaki','力頓'], 'premium')
on conflict (slug) do nothing;

-- 清掉舊 demo 商品（精品包），重建為餐飲設備
delete from products where title like 'Chanel%' or title like 'LV%' or title like 'Hermès%'
  or title like 'Nike%' or title like 'Gucci%';

-- 餐飲設備商品（SEO 標題結構＝品項＋規格/品牌/磅數＋地區；status=published 代表可成交）
insert into products (status, title, description, condition, price_amount, price_currency, attributes) values
  ('published','二手 萬利多 500磅 製冰機 台北｜保固三個月',
   '萬利多（Manitowoc）500 磅日產能製冰機，營業用月型冰。外觀九成新、壓縮機運轉正常、水路已清洗除垢。可驗收：製冰量、排水、噪音、冷媒壓力。附三個月保固，可到府安裝。比買新省約 55%。',
   'excellent', 45000, 'TWD',
   '[{"key":"品牌","value":"萬利多 Manitowoc"},{"key":"磅數","value":"500 磅/日"},{"key":"冰型","value":"月型冰"},{"key":"電壓","value":"220V"},{"key":"地區","value":"台北"}]'::jsonb),
  ('published','中古 Scotsman 300磅 製冰機 新北｜可議',
   'Scotsman 300 磅製冰機，粒冰機型。使用約兩年、成色良好，已更換濾心。可驗收：製冰速度、儲冰量、漏水檢查。適合手搖飲、小吃店。',
   'good', 32000, 'TWD',
   '[{"key":"品牌","value":"Scotsman"},{"key":"磅數","value":"300 磅/日"},{"key":"冰型","value":"粒冰"},{"key":"地區","value":"新北"}]'::jsonb),
  ('published','二手 四門 商用冰箱 桃園｜企業採購',
   '四門營業用不鏽鋼冷藏冰箱，上冷藏下冷凍。整台除鏽保養、門封更新、溫控正常。可驗收：各室溫度、密封、壓縮機。開店整套採購可再優惠。',
   'good', 28000, 'TWD',
   '[{"key":"門數","value":"四門"},{"key":"型式","value":"上藏下凍"},{"key":"材質","value":"不鏽鋼"},{"key":"電壓","value":"220V"},{"key":"地區","value":"桃園"}]'::jsonb),
  ('published','中古 六門 不鏽鋼工作台冰箱 台中',
   '六門臥式工作台冰箱，檯面可備料。壓縮機新換、冷藏均勻。可驗收：溫度、檯面平整、輪組。適合中大型廚房。',
   'excellent', 55000, 'TWD',
   '[{"key":"門數","value":"六門"},{"key":"型式","value":"工作台/臥式"},{"key":"材質","value":"不鏽鋼"},{"key":"地區","value":"台中"}]'::jsonb),
  ('reviewing','二手 營業用 掀門式 洗碗機 新竹',
   '掀門式營業用洗碗機，洗淨力強、省水。管路清洗完成。可驗收：洗程、加熱、排水。適合餐廳、團膳。',
   'good', 26000, 'TWD',
   '[{"key":"型式","value":"掀門式"},{"key":"電壓","value":"三相 220V"},{"key":"地區","value":"新竹"}]'::jsonb),
  ('priced','中古 雙口 快炒爐 台北',
   '營業用雙口快炒爐，火力猛、鼓風正常。可驗收：火力、瓦斯管線、水盤。適合快炒、熱炒店。',
   'good', 18000, 'TWD',
   '[{"key":"口數","value":"雙口"},{"key":"燃料","value":"桶裝瓦斯/天然氣"},{"key":"地區","value":"台北"}]'::jsonb);

-- demo 執行 / 人審 / 記憶（沿用，代表系統在動）
insert into loop_executions (id, loop_id, status, input, context, cursor, created_at, updated_at, started_at, finished_at)
select '11111111-1111-1111-1111-111111111111', id, 'succeeded', '{"driveFileId":"demo-1"}', '{}', 8,
       now()-interval '20 min', now()-interval '18 min', now()-interval '20 min', now()-interval '18 min'
from loops where slug='product-lifecycle' on conflict (id) do nothing;
insert into loop_executions (id, loop_id, status, input, context, cursor, created_at, updated_at, started_at)
select '22222222-2222-2222-2222-222222222222', id, 'waiting_human', '{"driveFileId":"demo-2"}', '{}', 5,
       now()-interval '5 min', now()-interval '4 min', now()-interval '5 min'
from loops where slug='product-lifecycle' on conflict (id) do nothing;
insert into loop_steps (loop_execution_id, step_index, name, kind, ref, status) values
  ('11111111-1111-1111-1111-111111111111',0,'perceive','skill','perceive','succeeded'),
  ('11111111-1111-1111-1111-111111111111',1,'assemble','skill','assemble','succeeded'),
  ('11111111-1111-1111-1111-111111111111',2,'price','agent','price','succeeded'),
  ('22222222-2222-2222-2222-222222222222',0,'perceive','skill','perceive','succeeded'),
  ('22222222-2222-2222-2222-222222222222',1,'human-review','human',null,'skipped')
on conflict do nothing;
insert into human_reviews (target_kind, target_id, status, reason) values
  ('listing', gen_random_uuid(), 'pending', '製冰機首次上架文案審核'),
  ('price_suggestion', gen_random_uuid(), 'pending', '商用冰箱估價高於門檻，需人審')
on conflict do nothing;
insert into memories (slug, type, title, content) values
  ('manitowoc-500lb-ice-tpe-45k','fact','萬利多500磅成交參考','萬利多 500 磅製冰機（九成新）台北成交參考約 NT$45,000。')
on conflict (slug) do nothing;
insert into agent_runs (agent_id, status, model, input, output, input_tokens, output_tokens, cost_amount, started_at, finished_at)
select id, 'succeeded', 'demo', '{}', '{}', 120, 30, 270, now()-interval '19 min', now()-interval '19 min'
from agents where code in ('ocr','vision','price','marketing');
