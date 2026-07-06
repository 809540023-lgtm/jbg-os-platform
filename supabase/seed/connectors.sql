-- seed/connectors.sql — Channel 連線種子（idempotent）
-- Source: §0.8 三個 canonical connector（drive/facebook/line）。docs/06 §6.14.3 未明列，
--         依 §0.8 建立最小 seed（每種 connector 一筆，config/credentials_ref 待實接時填）。
-- 冪等：connectors 無自然唯一鍵，故以 (kind, name) 是否已存在來判斷。
insert into connectors (kind, name, status)
select v.kind::connector_kind, v.name, 'disabled'::connector_status
from (values
  ('drive',    'Google Drive'),
  ('facebook', 'Facebook Page'),
  ('line',     'LINE Notify')
) as v(kind, name)
where not exists (
  select 1 from connectors c
  where c.kind = v.kind::connector_kind and c.name = v.name
);
