# 附錄 I · PR Review Template

> 本附錄提供**可直接複製使用**的 PR 模板與 Reviewer checklist。
> 所有名詞（Entity/Agent/Loop/Connector/狀態機）以 `docs/00-canonical-model.md` 為準；命名細節見附錄 C（API）、附錄 D（DB）。
> 對應 §0.6（Reviewer / Human Review）、§0.9（Permission）、§0.11（狀態機 enum）。

---

## I.1 這份文件解決什麼問題

在 JBG OS 的開發節奏裡（見 `docs/12`），**一個 Todo = 一條分支 = 一個 PR**。
每個 PR 都必須能被兩種 reviewer 審查：

- **人類 reviewer**（老闆 / 資深工程師）。
- **Reviewer Agent**（`reviewer`，見 §0.6）——它本身是自動審關卡，也可以被接上 CI 去讀 PR diff、比對 Acceptance 與 `docs/00` 合約。

因此 PR 模板必須讓「這個 PR 對應哪一章、動了哪些合約資源、是否有外部副作用」**結構化、可機器讀**，而不是自由發揮的一段文字。

---

## I.2 PR 模板（貼進 `.github/pull_request_template.md`）

> 直接把下面整段（含 `<!-- -->` 註解）存成 `.github/pull_request_template.md`。
> 每個核取方塊都必須逐項確認；不適用者填 `N/A` 並附一句理由，不要留空。

```markdown
## 這個 PR 是什麼 (What)

<!-- 一句話說明。對應哪個 Todo？ -->
- **對應章節 / 合約**：<!-- e.g. docs/07 §price-agent、docs/06 §price_suggestions -->
- **對應 Todo / Issue**：<!-- #123 或 Todo 連結 -->
- **Loop / Agent / Stage**：<!-- e.g. Loop: product-lifecycle / Agent: price / Stage: [price] -->

## 為什麼 (Why)

<!-- 這個改動要滿足哪一條 Acceptance Criteria？直接貼出來。 -->
- [ ] 我已把對應章節的「驗收條件 (Acceptance Criteria)」貼在下方，且本 PR 全部滿足：

> <!-- 貼上 Acceptance 條文 -->

---

## 合約影響 (Contract Impact) — 對照 docs/00

### Entity / Table
<!-- 動了哪些 Canonical Entity？對應哪張 table？沒有就填 N/A -->
| Entity (§0.5) | Table (§0.10/附錄D) | 動作 | 說明 |
|---|---|---|---|
| <!-- Product --> | <!-- products --> | <!-- add column / new / — --> | |

- [ ] 沒有私自發明新 Entity（若有，已先加進 `docs/00` §0.5 並在此 PR 一併更新）
- [ ] 命名遵守附錄 C（API）/ 附錄 D（DB）：table 複數 snake_case、FK `<singular>_id`、金額 `_amount`+`_currency`、布林 `is_/has_`

### Migration
- [ ] 本 PR **無** DB migration
- [ ] 本 PR **有** migration，且：
  - [ ] 可逆（附 `down` 或明確的 rollback 說明）
  - [ ] 不破壞既有資料（backfill 策略：<!-- ... -->）
  - [ ] 新表 / 新欄位 **已寫 RLS policy**（預設 deny，逐表開；見 §0.9）
  - [ ] enum 變更對齊 §0.11（`loop_execution_status` / `human_review_status` / `task_status` / `listing_status`）

### API
<!-- 新增/變更了哪些 route？路徑符合 /api/<context>/<resource> 複數 kebab-case？ -->
| Method + Path | 變更 | 回應是否 `{ data, error, meta }` |
|---|---|---|
| <!-- POST /api/loops/{id}/executions --> | <!-- new --> | <!-- yes --> |

---

## 外部副作用 & Permission (Side-effects) — 對照 §0.8 / §0.9

- [ ] 本 PR **不觸及**任何對外系統
- [ ] 本 PR 有對外讀寫，且**全部經 Connector 層**（`drive` / `facebook` / `line`），Agent/Loop **沒有**直接 `fetch` 外部 API
- [ ] 新增 / 修改了會產生「外部副作用或不可逆」的動作（發佈、改價超門檻、回覆客戶、刪除），且：
  - [ ] 已經過 `PolicyEngine` 檢查或走 Human Review（§0.9 原則：AI 可提議，但副作用需 Permission 或 HR）
  - [ ] 對應的 `HumanReview` 場景已在附錄 K 覆蓋（或本 PR 補上）

## 資料正確性 (Correctness)

- [ ] 錯誤處理完整（外部呼叫失敗、逾時、schema 驗證失敗都有處理，不吞例外）
- [ ] **冪等**：重跑同一步（LoopStep / webhook 重送）不會重複建 Order / 重複發 FB / 重複扣款
- [ ] **沒有硬寫模型 id / 版本字串**（走 `MODELS.REASONING/VISION/FAST` 常數；§0.3）
- [ ] **沒有硬寫金額 / 門檻 / 匯率**（走設定或 Policy；金額用整數最小貨幣單位 + currency）
- [ ] 狀態轉移合法（只走 §0.11 允許的 transition，終態不可逆改）

## 測試 & Eval (Tests)

- [ ] 單元測試涵蓋新邏輯（列出檔案：<!-- ... -->）
- [ ] 若改動 Agent 輸出品質 → 有對應 `EvalRun` / eval case（§0.4 #10）
- [ ] `typecheck` / `lint` / `test` / migration check 全綠（CI 詳見附錄 J）
- [ ] TS strict，無新增 `any`（除非 `// eslint-disable` 且註明原因）

## 觀測性 (Observability)
- [ ] 新步驟有 trace / log（對應 `LoopExecution` / `LoopStep` / `AuditLog`；§0.4 #12）
- [ ] token / cost 有記帳（走 harness；§0.4 #3）

## 截圖 / 錄影 (Evidence)
<!-- UI 改動貼前後截圖；Loop 改動貼一次成功 LX 的 trace 截圖 -->

## 風險 & Rollback (Risk)
<!-- 最壞會發生什麼？如何回滾？有沒有 feature flag？ -->
- **風險等級**：<!-- low / medium / high -->
- **回滾方式**：<!-- revert PR / 關 flag / migration down -->

---

## 文件同步 (Docs)
- [ ] 已更新對應章節與其 Acceptance（若行為改變）
- [ ] 若動到合約，已更新 `docs/00-canonical-model.md`（並在此 PR 一併提交）
- [ ] 交叉引用用相對路徑（`見 docs/06 §products`）
```

---

## I.3 Reviewer Checklist（人 / Reviewer Agent 共用）

> Reviewer（人或 `reviewer` agent）逐項確認。**任一項不通過 = request changes。**
> 分四類：**correctness / security / consistency-with-bible / simplicity**。

### A. Correctness（正確性）
- [ ] 邏輯確實滿足所引 Acceptance，沒有「看起來對但沒真的實作」的空殼。
- [ ] 錯誤路徑有處理：外部失敗、null、逾時、部分成功；不靠 happy path。
- [ ] **冪等性**：重試 / webhook 重送不會產生重複副作用（重複 Order、重複 FB post、重複 Memory）。
- [ ] 狀態機轉移合法（§0.11）；不從終態回跳；`waiting_human` 有對應 `HumanReview`。
- [ ] 並行安全：`perceive` 這類 `‖` 並行步驟沒有共享可變狀態競態。
- [ ] 邊界值 / 空集合 / 大量資料都有考慮（分頁、批次）。

### B. Security（安全）
- [ ] **RLS 到位**：新 table / 新欄位 **預設 deny**，逐表寫 policy（§0.9 第一道防線）。
- [ ] **PolicyEngine 到位**：動作級授權有檢查（誰 / 哪個 agent 能做這動作；§0.9 第二道防線）。
- [ ] 外部副作用 **一律經 Connector**（`drive`/`facebook`/`line`），沒有裸 `fetch`；憑證不落 log、不進 client bundle。
- [ ] 「不可逆 / 有外部副作用」動作（發佈、改價超門檻、回客戶、刪除）**預設需 Permission 或 Human Review**。
- [ ] 沒有把 secret / token / service-role key 寫進程式碼或 client-side。
- [ ] 使用者輸入 / AI 輸出在寫 DB 或送外部前有驗證（避免 prompt 注入 → 直接執行副作用）。

### C. Consistency with the Bible（與合約一致）
- [ ] Entity / Agent / Loop / Stage / Connector 名稱與 §0.5–0.8 **完全一致**（不自創別名）。
- [ ] 命名遵守 §0.10 + 附錄 C/D（table 複數 snake_case、FK、金額、enum、API 路徑）。
- [ ] **沒有偏離 `docs/00` 合約**；若必須偏離，已同步修改 `docs/00` 並說明理由。
- [ ] 模型 id 走 `MODELS.*` 常數，金額走整數最小貨幣單位 + currency（不憑記憶硬寫）。
- [ ] Agent 單一職責、不越界（Perception 只描述事實、Reasoning 才產生主張；§0.6）。
- [ ] 對應章節與 Acceptance 已更新。

### D. Simplicity（簡潔）
- [ ] 沒有為了未來需求過度抽象（YAGNI）；解法與問題規模相稱。
- [ ] 沒有重複造輪子：能用既有 Skill / Connector / harness 就不要新寫。
- [ ] 沒有 dead code、註解掉的舊實作、無用的 flag。
- [ ] diff 聚焦單一 Todo；不夾帶無關重構（無關重構請另開 PR）。
- [ ] 命名 / 檔案結構讓下一個人（或下一個 agent）能一眼看懂。

---

## I.4 Reviewer Agent 使用提示（machine review）

若把 `reviewer` agent 接上 CI 審 PR，餵給它的 context 至少包含：

1. PR diff（含 migration SQL）。
2. `docs/00-canonical-model.md` §0.5–0.11（合約快照）。
3. 本 PR 引用的章節 Acceptance 條文。
4. 本 checklist（I.3）作為評分 rubric。

輸出契約：`pass | reject` + 逐條 checklist 結果 + 理由（對齊 §0.6 Reviewer Agent 的 `pass / reject + 理由`）。
`reject` 時必須指出**具體檔案 / 行 / 違反哪一條**，讓開發者（或 Claude Code）能直接修。

---

## 本章交付物 (Deliverables)
- 可直接落地的 `.github/pull_request_template.md`（I.2）。
- 人 / Reviewer Agent 共用的四類審查 checklist（I.3）。
- Reviewer Agent 接 CI 的 context 與輸出契約（I.4）。

## 驗收條件 (Acceptance Criteria)
- [ ] 專案 repo 已放入 `.github/pull_request_template.md`，開 PR 會自動帶出模板。
- [ ] 模板每一區塊都能對應到 `docs/00` 的某一節（Entity/Migration/Permission/狀態機）。
- [ ] Reviewer checklist 四類（correctness/security/consistency/simplicity）每類至少可被逐條勾稽。
- [ ] `reviewer` agent 能以 I.3 為 rubric 產出 `pass/reject + 理由`。
