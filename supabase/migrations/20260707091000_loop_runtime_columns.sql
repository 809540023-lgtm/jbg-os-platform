-- Runtime 欄位補充：docs/06 的 loop_executions/loop_steps 未涵蓋 LoopRunner 需要的
-- resume 游標、累積 context 與冪等鍵。此為 additive 修補（不改既有欄位）。
-- 對應 @jbg/domain 的 LoopExecution / LoopStepRecord。

alter table loop_executions
  add column if not exists context         jsonb not null default '{}',
  add column if not exists cursor          int   not null default 0,
  add column if not exists idempotency_key text;

-- 冪等：同一 loop 的同一鍵只允許一筆（NULL 不受限）。
create unique index if not exists uq_loop_executions_loop_idem
  on loop_executions (loop_id, idempotency_key)
  where idempotency_key is not null;

alter table loop_steps
  add column if not exists attempt int not null default 1;
