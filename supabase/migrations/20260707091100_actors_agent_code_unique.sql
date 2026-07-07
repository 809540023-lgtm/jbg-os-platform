-- 每個 canonical agent 代號至多一個 agent actor（§0.6）。
-- seed/agents.sql 以 `on conflict (agent_code)` 保持 idempotent，需此唯一索引支撐。
create unique index if not exists uq_actors_agent_code
  on actors (agent_code)
  where agent_code is not null;
