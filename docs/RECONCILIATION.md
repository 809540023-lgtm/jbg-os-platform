# RECONCILIATION — 決策紀錄（全數已定案）

> MVP 開發時發現的「文件↔文件 / 文件↔落地 schema」衝突。owner 已於 **2026-07-07** 全數裁決並回填 `docs/00`（SSOT）與相關章節/migration。本檔保留為決策紀錄。

| # | 議題 | 決策 | 已回填 |
|---|---|---|---|
| **R1** | `product_status` vs `listing_status` | **保留獨立 `product_status`**（9 階段），Product 不共用 listing_status | `docs/00` §0.11、`docs/05` §5.12.2、`@jbg/db` `PRODUCT_STATUS`、migration |
| **R2** | `loop_step_kind` 缺 `branch` | **DB enum 加 `branch`** | migration `..._0900`、`@jbg/db` `LOOP_STEP_KIND`、`domain/loop` `StepType`、`docs/00` §0.11 |
| **R3** | `policy_effect` 缺 `require_human` | **enum 加 `require_human`** | migration `..._0900`、`@jbg/db` `POLICY_EFFECT`、`seed/policies.sql`、`docs/00` §0.11 |
| **R4** | Agent 檔案路徑 | **依附錄 A：`packages/domain/src/agent/agents/*`**（schema 置於 context package） | `docs/07` §7.0/§7.3/§7.6 註解 |

## R5 · domain/docs Entity 與 migration 欄位不符（接 Supabase 時發現）
- **衝突**：(a) `docs/05` Product 與 `@jbg/domain` 的 catalog `Product` 有 `sku`，但 migration 的 `products` 表**無 `sku` 欄**（有 `brand_id/category_id/title/condition/attributes/status/price_amount…`）。(b) `docs/07` Memory 用 `kind`，但 migration `memories` 表用 `type` + `source_kind/source_id`（非 `kind`/`links`/`sourceRef`）。
- **暫採**：Loop/Agent 持久化不受影響（已測綠）。products/memories 的 Supabase repo **尚未建**；demo 資料以 migration 實際欄位插入。
- **建議定案（待裁決）**：以 migration（DB 真值）為準，回頭把 `@jbg/domain` 的 `Product`（拿掉 sku 或改 DB 補 sku）與 memory 型別對齊 migration；或改 migration 補欄。**建立 products/memories repo 前需先定案**，否則 mapping 會卡住。

---
狀態：R1–R4 已定案回填；**R5 待裁決**（不阻塞目前已完成部分，但阻塞 products/memories 的 DB repo）。
