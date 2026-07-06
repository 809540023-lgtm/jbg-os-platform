# RECONCILIATION — 決策紀錄（全數已定案）

> MVP 開發時發現的「文件↔文件 / 文件↔落地 schema」衝突。owner 已於 **2026-07-07** 全數裁決並回填 `docs/00`（SSOT）與相關章節/migration。本檔保留為決策紀錄。

| # | 議題 | 決策 | 已回填 |
|---|---|---|---|
| **R1** | `product_status` vs `listing_status` | **保留獨立 `product_status`**（9 階段），Product 不共用 listing_status | `docs/00` §0.11、`docs/05` §5.12.2、`@jbg/db` `PRODUCT_STATUS`、migration |
| **R2** | `loop_step_kind` 缺 `branch` | **DB enum 加 `branch`** | migration `..._0900`、`@jbg/db` `LOOP_STEP_KIND`、`domain/loop` `StepType`、`docs/00` §0.11 |
| **R3** | `policy_effect` 缺 `require_human` | **enum 加 `require_human`** | migration `..._0900`、`@jbg/db` `POLICY_EFFECT`、`seed/policies.sql`、`docs/00` §0.11 |
| **R4** | Agent 檔案路徑 | **依附錄 A：`packages/domain/src/agent/agents/*`**（schema 置於 context package） | `docs/07` §7.0/§7.3/§7.6 註解 |

— 無未決項。後續若再發現衝突，於此表新增一列，裁決後回填。
