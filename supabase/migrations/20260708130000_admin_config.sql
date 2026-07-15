-- 後台認證改存資料庫（免 Render env）。首次進後台於瀏覽器自設密碼。
-- 單列設定表；password_hash 為 PBKDF2 雜湊、session_secret 供簽章 cookie。
create table if not exists admin_config (
  id            smallint primary key default 1,
  password_hash text not null,
  session_secret text not null,
  updated_at    timestamptz not null default now(),
  constraint admin_config_singleton check (id = 1)
);

-- 新表需授權給 service_role（新版 Supabase 不自動 expose）。
grant all on table admin_config to service_role;
