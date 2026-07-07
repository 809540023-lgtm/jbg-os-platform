-- Data API 存取授權：新版 Supabase 預設不自動 expose 新表到 API roles。
-- service_role 為後端 runtime 角色（bypass RLS）；授予其 public schema 全權，
-- 讓 LoopRunner/AgentRunner 等 worker 能經 PostgREST 讀寫。
-- anon/authenticated 的存取仍由 RLS（deny-first, migration 0909）把關，故此處不放寬它們。

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;
