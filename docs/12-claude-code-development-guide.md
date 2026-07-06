# 12 · Claude Code Development Guide

> 這章是**給 Claude Code 的作業手冊**：每天怎麼開工、怎麼把 `docs/11` Roadmap 拆成一連串可執行的 **Milestone → Todo**，一路做到 Production。
> 所有名詞、Entity、Agent、Loop、狀態機一律引用 `docs/00-canonical-model.md`（合約）。**與合約衝突，一律以合約為準。**
> 本章不重述架構（那在 `docs/03`–`docs/10`）；本章講**流程、節奏、Definition of Done**。
>
> 版本：v1.0 · 最後更新：2026-07-07

---

## 12.0 給 Claude Code 的黃金守則 (Golden Rules — 每個 Todo 都適用)

> 這 8 條凌駕一切。動任何 code 前先回顧一遍。

1. **永遠先讀合約**：開任何 Todo，第一步讀 `docs/00`（相關 §）+ 該功能對應章節。不確定名詞就回 `docs/00` §0.5–0.11，不要自創。
2. **不得偏離命名與 Entity**：Table/Entity/Agent/Loop/狀態/API 路徑一律照 §0.5、§0.10、§0.11 與附錄 C/D。需要新 Entity → **先回填 `docs/00` §0.5** 再用；禁止在單章私自發明。
3. **外部副作用一律走 Connector 且過 Permission**：Agent/Loop **不得**直接 `fetch` 外部 API。所有 Drive/FB/LINE 讀寫走 `packages/connectors/*`（附錄 F）。發佈/改價超門檻/回客戶/刪除，過 `PolicyEngine` 或 `HumanReview`（§0.9）。
4. **每個 PR 對應某章的 Acceptance**：PR 描述必須指出「本 PR 滿足 `docs/NN` 的哪條 Acceptance / 哪個 Todo」。做不到 → 這個 PR 範圍有問題。
5. **不確定就停下標 TODO，不要亂猜**：遇到合約沒定義、需求模糊、外部行為不明——**停**，在 code 留 `// TODO(contract): …` 並在 PR 標記待人確認，不要自行發明語意。
6. **AI 可提議，副作用需授權**：任何有外部副作用或不可逆的動作，預設走 Permission 檢查或人審。寧可多一道 HR，不可讓 agent 越權。
7. **可回放**：每次 Agent 執行寫 `agent_runs` + `context_snapshots`（餵入的 context）；每個 Loop 步驟寫 `loop_steps`；每個副作用寫 `audit_logs`。無 trace 的功能視為未完成。
8. **TypeScript strict、禁 `any`**：模型 id 走 `MODELS.*` 常數（查 `claude-api` skill，不硬寫版本字串，§0.3）。金額用整數 + `_currency`，禁 float 存錢。

---

## 12.1 開發前置 · Bootstrap（第一天做什麼）

**Day 0 — 讀 (只讀不寫)**
1. 讀 `docs/00`（全部）。這是合約。
2. 讀 `README.md` §「怎麼讀」→ 按 Claude Code 路徑：`docs/00 → docs/12 → 附錄 A/B → docs/06`。
3. 讀 `docs/11` Roadmap（尤其 §11.1 MVP、§11.5 成熟度表、§11.7 依賴序）。
4. 讀本章全文。

**Day 1 — 立地基（對應 `docs/11` §11.7 階段0）**

| 步驟 | 動作 | 依據章節 | 產出 |
|---|---|---|---|
| B1 | 建 monorepo 資料夾樹（`apps/*`、`packages/*`） | 附錄 A | 空骨架 + `pnpm` workspace |
| B2 | 建 Next.js app（App Router、TS strict、Tailwind/shadcn） | 附錄 B、§0.3 | `apps/web` 跑得起來 |
| B3 | 建 Supabase 專案（Postgres/Auth/Storage/pgvector/Edge Functions） | §0.3、`docs/06` | 專案 + service keys |
| B4 | 設定 `.env`（Supabase、Anthropic、Drive/FB/LINE 憑證、`MODELS.*`） | §0.3、附錄 F/H | `.env.example` + 本地 `.env` |
| B5 | CI：typecheck + lint + test + migration check（禁 `any`） | 附錄 J | CI 綠燈 |
| B6 | 建 `packages/harness`（模型呼叫外殼：重試、schema 驗證、token 記帳、逾時） | §0.4 layer 3 | harness 可呼叫 `MODELS.FAST` 回傳 |
| B7 | 首個 migration：Governance 最小表（`actors`、`audit_logs`）+ RLS deny-first | `docs/06`、§0.9 | migration + RLS 測試 |

> **Day 1 完成定義**：`pnpm dev` 起得來、CI 綠、harness 能打一次模型並記帳、Supabase 有第一個 migration 且 RLS deny-first。此時尚無業務邏輯——這是正確的。

**環境檢查清單（Bootstrap DoD）**
- [ ] 資料夾樹符合附錄 A；Next.js 結構符合附錄 B。
- [ ] TS strict、ESLint 禁 `any` 生效。
- [ ] Supabase 本地/雲端可連；migration 可 `up`/`down`。
- [ ] `MODELS.REASONING/VISION/FAST` 由設定檔提供（值查 `claude-api`，不硬寫）。
- [ ] 所有外部憑證只在 Connector/env，不散落 code。
- [ ] CI 有 typecheck + lint + test + migration lint。

---

## 12.2 開發節奏 · Milestone → Todo 循環格式

把 Roadmap 拆成有序的 **Milestone**，每個 Milestone 拆成 **Todo**。每個 Todo 一律用同一份骨架描述：

```
Todo #<n> — <一句話目標>
├─ 目標 (Goal):        這個 Todo 做完，系統多了什麼可觀察的能力
├─ 動的檔案/章節:      要新增/修改的檔案 + 依據的 docs 章節/附錄
├─ Acceptance:        可勾選的完成條件（對應某章 Acceptance 的子集）
├─ Eval:              要寫/更新哪個 eval（golden case、期望輸出、門檻）
├─ Review 重點:       自我 code review 要特別看什麼（附錄 I）
└─ Loop:              對應 §0.7 的哪個 stage / §0.6 的哪個 Agent
```

**每一階段的節奏 = 逐個 Todo 跑這個五拍循環：**

```
Todo ──► Acceptance ──► Eval ──► Review ──► Loop
 做       驗收條件通過   跑評分過門檻  自審+人審   對回主流程 stage
  ▲                                              │
  └──────────────  下一個 Todo  ◄────────────────┘
```

---

## 12.3 單一 Todo 的標準工作流程 (TDD-ish · 每個 Todo 都照這 8 步)

```
1. 讀章節     讀 docs/00 相關 § + 該功能對應章節（如 price → docs/07 §price Agent, docs/06 §price_suggestions）
2. 寫 migration/type   先定 schema（migration，附錄 D 命名）+ TS type/interface（§0.10）。type 先於實作。
3. 寫測試/eval 骨架     先寫 failing test + eval golden case（期望輸出、門檻）。看它紅。
4. 實作         寫最小實作讓測試轉綠。Agent 走 harness、副作用走 Connector、記 agent_runs/loop_steps。
5. 跑測試/eval  單元測試 + eval 全綠且過門檻。cost 有記錄。
6. 自我 code review   照附錄 I 逐項自審（見 §12.4 清單）。修掉問題。
7. 開 PR       附錄 J git flow：feature branch → PR，描述指出滿足哪條 Acceptance/哪個 Todo（§12.0 守則4）。
8. 人審        附上附錄 K checklist；高風險（副作用/權限/改價/發佈）必人審後才 merge。
```

> **紅燈規則**：第 3 步的測試若「一寫就綠」，代表測試沒測到東西——重寫測試。
> **停損規則**：第 4 步若發現合約沒定義的語意，回 §12.0 守則5——停、標 `TODO(contract)`、PR 標待確認，不硬做。

---

## 12.4 自我 Code Review 清單 (§12.3 第6步 · 濃縮自附錄 I)

每個 PR 開出前，Claude Code 自問：
- [ ] **命名合約**：所有 table/entity/agent/loop/狀態/API 與 §0.5/§0.10/§0.11 一致？沒自創？
- [ ] **Connector 邊界**：有無任何 Agent/Loop 直接 fetch 外部？（有 → 移進 Connector）
- [ ] **Permission**：所有副作用/不可逆動作有過 PolicyEngine 或 HumanReview？
- [ ] **可回放**：有寫 `agent_runs` + `context_snapshots` + `loop_steps` + 必要的 `audit_logs`？
- [ ] **型別**：TS strict 過、無 `any`（或有註明原因）？模型 id 走 `MODELS.*`？
- [ ] **狀態機**：狀態轉移只走 §0.11 合法邊？無非法跳轉？
- [ ] **金額/時間**：金額整數+currency、時間 timestamptz？
- [ ] **RLS**：新表 deny-first + 逐條 policy + 有測試？
- [ ] **Eval**：新增/改動的 Agent 有對應 golden case，且跑過門檻？
- [ ] **對應 Acceptance**：PR 能明確對回某章的哪條 Acceptance？

---

## 12.5 MVP Milestone 展開（有序 Todo · 對應 `docs/11` §11.1）

> MVP 目標：一張 Drive 照片 → FB 上架草稿 → 人審 → 發佈（§0.7 打通到 `publish` + 最小 `remember`）。
> 依 §11.7 依賴序，Todo 有序：地基 → 感知 → 組裝 → 推理 → 審核 → 發佈 → 記憶。

### Milestone M0 · 地基 runtime（Todo 1–3）

**Todo 1 — Loop runtime + Loop/LX/Step schema**
- 目標：能定義一個 `Loop`、觸發一次 `LoopExecution`、逐步寫 `loop_steps`、跑 §0.11 狀態機。
- 檔案/章節：`docs/06`（loops/loop_executions/loop_steps migration）、`docs/08`（runner）、`packages/*` LoopRunner；附錄 G Loop 模板。
- Acceptance：能起一條假 LX 走 `queued→running→succeeded`、每步有 `loop_steps` 記錄、狀態非法轉移被擋。
- Eval：狀態機轉移單元測試（合法/非法邊各一組）。
- Review 重點：狀態機邊界、冪等 LX id。
- Loop：runtime（所有 stage 的載體）。

**Todo 2 — Agent runtime + agent_runs/context_snapshots/prompts**
- 目標：能定義一個 `Agent`、經 harness 執行一次、寫 `agent_runs`（cost）+ `context_snapshots`。
- 檔案/章節：`docs/07`（Agent 契約）、附錄 H Agent 模板、`docs/06`（agents/agent_runs/prompts/context_snapshots）。
- Acceptance：跑一個 echo Agent，`agent_runs` 有 input/output/cost/trace、`context_snapshots` 可回放。
- Eval：harness schema 驗證測試（壞輸出被擋、重試生效）。
- Review 重點：token 記帳正確、prompt 版本化。
- Loop：runtime（§0.6 全 Agent 的載體）。

**Todo 3 — Permission 最小版（RLS deny-first + hardcode policy）**
- 目標：所有表 deny-first；一條 hardcode 規則「`publish` 一律需 HR」。
- 檔案/章節：§0.9、`docs/06` RLS、`docs/07` PolicyEngine 骨架。
- Acceptance：未授權讀寫被 RLS 擋；`publisher` 未過 HR 無法發佈（測試）。
- Eval：權限測試（human/agent 兩種 Actor 各一組）。
- Review 重點：deny-first 無漏表。
- Loop：Permission（跨 stage）。

### Milestone M1 · 感知輸入（Todo 4–7）

**Todo 4 — `drive` Connector（讀）+ drive-ingest**
- 目標：監看單一 Drive 資料夾、抓新照片、建 `ProductPhoto`（存 Storage）。
- 檔案/章節：§0.8、附錄 F、`docs/04`；`packages/connectors/drive`；`product_photos` migration。
- Acceptance：資料夾放一張新照片 → 出現一筆 `product_photos` + Storage 檔；重複不重建（冪等）。
- Eval：ingest 冪等測試（同檔跑兩次只建一筆）。
- Review：憑證只在 Connector、rate limit/退避、唯讀。
- Loop：`drive-ingest`。

**Todo 5 — `ocr` Agent → OCRResult**
- 目標：一張 `ProductPhoto` → `ocr_results`（吊牌/型號/序號/尺寸/成分）。
- 檔案/章節：§0.6、`docs/07` §ocr、`docs/06` ocr_results；harness + `MODELS.FAST/VISION`。
- Acceptance：對樣本照片產出結構化 OCR、低信心有標記、寫 `agent_runs`。
- Eval：OCR golden set（3–5 張已知答案照片，欄位比對）。
- Review：schema 驗證、無直接 fetch。
- Loop：`perceive`（ocr）。

**Todo 6 — `vision` Agent → VisionResult**
- 目標：一張 `ProductPhoto` → `vision_results`（品牌/品類/顏色/瑕疵/附件/信心）。
- 檔案/章節：§0.6、`docs/07` §vision、`docs/06` vision_results；`MODELS.VISION`。
- Acceptance：產出結構化視覺結果、低信心標記、可升級（不阻斷）。
- Eval：vision golden set（含一張「低信心該標記」案例）。
- Review：信心閾值、輸出 schema。
- Loop：`perceive`（vision）。

**Todo 7 — perceive 並行編排**
- 目標：一個 `perceive` Loop 並行跑 ocr‖vision，兩者皆入庫。
- 檔案/章節：§0.7、`docs/08`；LoopRunner 並行步驟。
- Acceptance：一次 LX 併發兩 Agent、`loop_steps` 各一筆、任一失敗有處置。
- Eval：並行編排測試（一 Agent 失敗不拖垮另一）。
- Review：並行錯誤處理、部分成功語意。
- Loop：`perceive`。

### Milestone M2 · 組裝與缺口（Todo 8–9）

**Todo 8 — assemble → Product 商品卡**
- 目標：合併 OCRResult+VisionResult → 建 `products`（+ `brands`/`categories` 對應）。
- 檔案/章節：§0.7、`docs/05`（DDD 合併規則）、`docs/06` products/brands/categories。
- Acceptance：單張照片 → 一張 `Product` 商品卡、`listing_status=draft`、可在 UI 顯示。
- Eval：合併規則測試（衝突欄位取捨、缺欄留空）。
- Review：Product aggregate root 邊界。
- Loop：`assemble`。

**Todo 9 — gap-check（manual 補件）**
- 目標：缺關鍵欄位 → 開 `Task` / `HumanReview`，不自動補。
- 檔案/章節：§0.7、`docs/06` tasks/human_reviews、§0.11 task_status。
- Acceptance：缺欄位商品出現待補 `Task`；補完可續流程。
- Eval：缺欄位偵測測試。
- Review：不越界自動補、狀態正確。
- Loop：`gap-check`。

### Milestone M3 · 推理（Todo 10–11）

**Todo 10 — `price` Agent → PriceSuggestion**
- 目標：`Product` → `price_suggestions`（建議價、區間、理由、信心）。MVP 市場記憶可空。
- 檔案/章節：§0.6、`docs/07` §price、`docs/06` prices/price_suggestions、§0.10 金額規則。
- Acceptance：產出含理由+信心的建議、金額整數+currency、寫 `agent_runs`。
- Eval：price golden set（幾件已知合理區間商品，容差內）。
- Review：金額型別、高價/低信心→需 HR 旗標。
- Loop：`price`。

**Todo 11 — `marketing` Agent → Listing draft (compose)**
- 目標：`Product` → `listings`（標題/內文/hashtag/賣點）draft。
- 檔案/章節：§0.6、`docs/07` §marketing、`docs/06` listings、§0.11 listing_status。
- Acceptance：產出 FB 貼文草稿、`listing_status=draft`、可編輯。
- Eval：compose golden set（含合規/長度檢查）。
- Review：無虛構規格、賣點來自 Product 事實。
- Loop：`compose`。

### Milestone M4 · 審核與發佈（Todo 12–15）

**Todo 12 — `reviewer` Agent（自動審）→ pass/reject**
- 目標：審商品卡完整性/文案合規/價格合理性，pass 或 reject+理由。
- 檔案/章節：§0.6、`docs/07` §reviewer。
- Acceptance：完整→pass；缺陷→reject+具體理由（回 assemble/compose）。
- Eval：reviewer golden set（好/壞卡各數例，判定正確率）。
- Review：reject 理由可執行、不誤放行。
- Loop：`review`。

**Todo 13 — Human Review 面板（強制全審）**
- 目標：UI 待審隊列，approve/reject/edit + 理由；`human_review_status` 流轉。
- 檔案/章節：§0.6 HR、`docs/09` UI、§0.11 human_review_status、附錄 K。
- Acceptance：每則發佈前必進 HR；edit 內容回寫 `Product`/`Listing` 並可供 remember 萃取。
- Eval：HR 狀態流轉測試。
- Review：無繞過 HR 的發佈路徑。
- Loop：`human-review`。

**Todo 14 — `facebook` Connector（寫）+ `publisher` Agent → publish**
- 目標：approved `Listing` → 發上 FB、寫 `Listing.published` + FB post id。
- 檔案/章節：§0.8、附錄 F、`docs/07` §publisher、§0.9 Permission。
- Acceptance：僅 approved+過 Policy(HR) 才發；成功寫 post id + `audit_logs`；失敗有明確錯誤與重試。
- Eval：發佈冪等/失敗重試測試（可用 mock FB）。
- Review：**副作用必過 Connector + Permission**、憑證安全。
- Loop：`publish`。

**Todo 15 — `line` Connector 通知**
- 目標：待審 / 發佈成功 → LINE 推播老闆。
- 檔案/章節：§0.8、`docs/10`；`packages/connectors/line`。
- Acceptance：HR 待審與 publish 成功各觸發一則通知。
- Eval：通知觸發測試（mock）。
- Review：只推不讀、無敏感資料外洩。
- Loop：橫切（Observability/通知）。

### Milestone M5 · 記憶與觀測（Todo 16–17）

**Todo 16 — `memory` Agent 最小版 → Memory (remember)**
- 目標：成交 / 人審 edit → 寫一條 `memories`（純文字，pgvector 延後）。
- 檔案/章節：§0.6、`docs/07` §memory、`docs/06` memories。
- Acceptance：一次人審 edit 產生一條可讀 `Memory`；有來源關聯。
- Eval：萃取測試（edit → memory 內容正確）。
- Review：不記入離群/壞資料（信心/來源過濾）。
- Loop：`remember`。

**Todo 17 — 一頁 LoopExecution trace（最小 Observability）**
- 目標：一條 LX 的步驟、耗時、cost、status 可視化。
- 檔案/章節：§0.4 layer 12、`docs/09` UI、`docs/10`。
- Acceptance：任一 LX 可在 UI 看到完整 step trace + 總 cost + 終態。
- Eval：trace 完整性測試（每 step 皆有記錄）。
- Review：cost 加總正確、無漏 step。
- Loop：`Observability`（跨 stage）。

> **MVP 完成 = Todo 1–17 全綠 + §12.6 MVP DoD 全勾 + `docs/11` §11.1 成功指標達標。**

---

## 12.6 Definition of Done (三層)

**單一 Todo DoD**
- [ ] Acceptance 全勾；測試 + eval 全綠且過門檻。
- [ ] `agent_runs`/`context_snapshots`/`loop_steps`/必要 `audit_logs` 有記錄（可回放）。
- [ ] 自我 code review 清單（§12.4）全過。
- [ ] PR 已對回某章 Acceptance；副作用類經人審（附錄 K）後 merge。
- [ ] 命名/型別/狀態機/金額全合約（§0.5/§0.10/§0.11）。

**單一 Milestone DoD**
- [ ] 該 Milestone 全部 Todo 的 DoD 達成。
- [ ] 對應 §0.7 stage 端到端跑得通（前一 Milestone 產物餵得進本 Milestone）。
- [ ] 該階段涉及 Agent 皆有 golden case 且過門檻。
- [ ] 無 `TODO(contract)` 懸而未決（或已回填 `docs/00`）。

**MVP DoD（整個 MVP）**
- [ ] Todo 1–17 全綠。
- [ ] 端到端：Drive 照片 → 草稿 → 人審 → FB 發佈，可重現。
- [ ] `docs/11` §11.1 成功指標達標（端到端成功率 ≥ 80%、可追溯 100% 等）。
- [ ] 所有副作用走 Connector + 過 Permission；100% 發佈可回放。
- [ ] Scope-out 項目確實**未**混入（無 engage/close/aftersale/auto 放行）。

---

## 12.7 用 Eval 與 Observability 判斷「可從 assisted 升 auto」

> 執行 `docs/11` §11.6 Promotion Gate 的操作版。任一 Loop/Agent 想升 auto，跑這套：

```
升 auto 決策流程
 1) 資料:   從 agent_runs / eval_runs 撈近 N 次該 Agent 的表現
 2) Eval:   最新 golden set 分數 ≥ 門檻(例 0.9) 且近 N 次無回歸？ ──否──► 留 assisted，改 prompt/context 再評
 3) 觀測:   assisted 期 ≥ 2 週、樣本 ≥ 門檻，人審 override/reject 率 < 門檻？ ──否──► 留 assisted，分析 reject 原因
 4) Policy: PolicyEngine 有明文「此條件免 HR」規則(含金額/風險/信心閾)？ ──否──► 先寫 Policy
 5) 回退:   有開關可即時 auto→assisted，不需改 code？ ──否──► 先做開關
 6) 例外:   低信心/超門檻/Policy 命中仍自動落 waiting_human？ ──否──► 補例外路徑
 全部 ✓ ──► 升 auto，並在 Observability 設事故率告警；異常自動/一鍵降回 assisted
```

**要看的指標（Observability）**
- 各 Agent 的 Eval 分數趨勢、回歸次數。
- 人審 override / reject / edit 率（越低代表人越同意 AI）。
- auto 後的事故率（發佈錯誤、客訴、退回）、cost/商品。
- 例外落人審比例是否符合預期。

**降級規則**：auto 階段事故率或 reject 率突破門檻 → 自動或一鍵打回 assisted，開 `Task` 調查，Eval 補案例後再走一次升級流程。

---

## 12.8 Beta / Production Milestone 骨架

> 依 `docs/11` §11.2/§11.3。此處給骨架，實作時各自展成 §12.2 格式的有序 Todo。

**Beta Milestones（可並行三線，皆依賴 MVP 打通）**
- **B-A · Memory 迴圈**：`embeddings`+pgvector migration → `memories`/`memory_links` → `ContextBuilder` recall → 接進 `price`/`compose` → Eval 證明提升 ≥15%。Loop：`remember` + recall。
- **B-B · 客服 engage**：`facebook` 讀留言/私訊 → `inquiries` → engage 草稿 skill → 人審送出 → `close`→`orders`。Loop：`engage`/`close`。
- **B-C · 品質基建**：`packages/eval`+`eval_runs` → 5 Agent golden set + 回歸 → Observability 儀表板 → 依 §12.7 試點首個 auto 升級。Loop：Eval/Observability。
- Beta 每個 Todo 仍照 §12.3 八步；升 auto 一律走 §12.7。

**Production Milestones（先可靠與權限，後提升 auto）**
- **P-A · 可靠性**：Loop runtime 冪等/重試/死信/斷點續跑；狀態機全態處置；Connector 全附錄 F。
- **P-B · 權限完備**：RLS 全表 policy；`PolicyEngine` 覆蓋所有副作用；human/agent 分權。
- **P-C · 稽核**：`audit_logs` 不可變、可回放到 `context_snapshots`；報表匯出。
- **P-D · 成本控管**：per-Loop/Agent token 預算+告警；`MODELS.*` 分級最佳化；超額降級。
- **P-E · 升 auto + SLA**：低風險階段依 §12.7 升 auto；SLA 監控（發佈成功率 ≥99%、可用性 ≥99.5%）。
- Production Todo 額外強制：每個副作用類 PR 過安全審查 + 附錄 K 人審。

> Enterprise（multi-tenant / 第二 vertical / Connector 市集 / RBAC / 白標）在進場前先做**抽象審查**：把 `SHAP-specific` 邏輯抽離 OS 核心（`docs/11` §11.4/§11.7 階段4）。屆時另立 Milestone 展開。

---

## 12.9 每日開工檢查 (Daily Startup Checklist)

Claude Code 每次 session 開始：
1. [ ] 我這個 Todo 對應 `docs/11` 的哪階段、§0.7 哪個 stage、§0.6 哪個 Agent？
2. [ ] 我讀過對應章節 + `docs/00` 相關 § 了嗎？
3. [ ] 有沒有懸而未決的 `TODO(contract)` 要先確認？
4. [ ] 我要動的名稱/schema 是否都在合約內？（不在 → 先回填 `docs/00`）
5. [ ] 這個 Todo 的副作用有沒有走 Connector + Permission？
6. [ ] 我會寫哪個 test / eval？（先寫紅的）
7. [ ] 完成後 PR 對回哪條 Acceptance？

---

## 本章交付物 (Deliverables)

- [ ] Bootstrap / Day-1 步驟表 + 環境 DoD（§12.1）。
- [ ] Milestone→Todo 循環格式與五拍節奏（§12.2）。
- [ ] 單一 Todo 標準八步工作流程（TDD-ish，§12.3）。
- [ ] 自我 code review 清單（§12.4，接附錄 I）。
- [ ] 給 Claude Code 的 8 條黃金守則（§12.0）。
- [ ] MVP 展成 17 個有序 Todo，每個含 目標/檔案/Acceptance/Eval/Review/Loop（§12.5）。
- [ ] Beta/Production Milestone 骨架（§12.8）。
- [ ] 三層 Definition of Done（Todo / Milestone / MVP，§12.6）。
- [ ] 用 Eval+Observability 判定 assisted→auto 的操作流程（§12.7，接 `docs/11` §11.6）。

## 驗收條件 (Acceptance Criteria)

- [ ] Claude Code 照本章能在不回問需求下，從 Day 1 一路推到 MVP DoD。
- [ ] MVP 的 17 個 Todo 有序、可獨立驗收，且覆蓋 §0.7 從 `drive-ingest` 到 `remember` + Observability。
- [ ] 每個 Todo 都指明對應章節、Acceptance、要寫的 Eval、對應 Loop/Agent（無空 Todo）。
- [ ] 八步工作流程含「先寫 migration/type → 先寫失敗測試 → 實作 → 自審 → PR → 人審」，順序不可顛倒。
- [ ] 黃金守則涵蓋：先讀合約、不改命名/Entity、副作用走 Connector+Permission、PR 對回 Acceptance、不確定停下標 TODO。
- [ ] assisted→auto 判準與 `docs/11` §11.6 一致，且為可執行流程（非口號）。
- [ ] 全章名稱與 `docs/00` §0.5–0.11 一致；未擅自發明 Entity/Agent/狀態。
