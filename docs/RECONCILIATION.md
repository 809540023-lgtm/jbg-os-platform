# RECONCILIATION — 待合約定案的不一致點

> 開發 MVP 時發現「文件之間 / 文件與落地 schema 之間」有幾處衝突。依黃金守則 5（不確定就停下標記，不亂猜），這裡列出衝突、目前暫採的做法、與建議定案。**請 owner 逐項裁決**，裁決後回填 `docs/00`（SSOT）並移除本項。
>
> 建立：MVP M0 完成後（Todo 1–3）。

---

## R1 · `product_status` vs `listing_status`
- **衝突**：`docs/05` §5.12.2 說「Product 與 Listing 共用 `listing_status`」；但 `docs/06` 落地的 migration 另建了獨立 `product_status` enum（值：`ingested, assembled, gap, priced, composed, reviewing, published, sold, archived`），與 `listing_status`（`draft, in_review, approved, published, sold, archived`）不同。
- **暫採**：以 DB 真值為準 → 程式用 `product_status`（`@jbg/db` 的 `PRODUCT_STATUS`）。`listing_status` 專供 `Listing`。
- **建議定案**：保留兩個獨立 enum（Product 的生命週期階段本就比 Listing 細）。請更新 `docs/05` §5.12.2 與 `docs/00` §0.11，把 `product_status` 列為權威、移除「共用」敘述。

## R2 · `loop_step_kind` 缺 `branch`
- **衝突**：`docs/08` Loop DSL 定義 step `type = agent|skill|connector|human|branch`；但 `docs/06` 的 `loop_step_kind` enum = `agent|skill|connector|human|system`（有 `system`、無 `branch`）。
- **暫採**：DB mirror（`@jbg/db` `LOOP_STEP_KIND`）採 DB 5 值；Loop DSL 的 `StepType`（`@jbg/domain`）= `LoopStepKind | 'branch'` 超集，`branch` 持久化時記為 DB 的 `system`。
- **建議定案**：二選一 —(a) 在 `loop_step_kind` enum 增加 `'branch'`（推薦，語意清楚）；或 (b) 正式定義「branch 步驟以 `system` 儲存、用 `ref`/metadata 區分」。定案後更新 `docs/06` 或 `docs/08`。

## R3 · `policy_effect` 缺 `require_human`
- **衝突**：`docs/06` 的 `policy_effect` enum = `allow|deny`；但 §0.9 與 `docs/07` 的 PolicyEngine 決策含第三種 `require_human`（發佈、超門檻定價都靠它）。
- **暫採**：runtime `PolicyEngine`（`@jbg/domain`）回傳 `allow|deny|require_human`（正確）。但 `policies` table 目前無法儲存 `require_human` 規則。
- **建議定案**：在 `policy_effect` enum 增加 `'require_human'`（推薦），讓 seed/`policies` 能落地「publish → require_human」這類規則。定案後改 `docs/06` migration + `seed/policies.sql`。

## R4 · Agent 檔案路徑：`packages/agents/*` vs `packages/domain/src/agent/*`
- **衝突**：`docs/07` 程式碼註解寫 `packages/agents/vision/schema.ts`；但附錄 A 的資料夾規範把 Agent 定義放 `packages/domain/src/agent/`（層=domain）。
- **暫採**：依附錄 A → Agent 定義放 `@jbg/domain` 的 `agent/agents/*`，prompt 放 `@jbg/prompts`。
- **建議定案**：以附錄 A 為準（domain 分層），請把 `docs/07` 的註解路徑改為 `packages/domain/src/agent/agents/*`。

---
裁決方式：對每項回覆 (a)/(b)/自訂，我據以回填 `docs/00` 與相關章節/migration，並移除該項。
