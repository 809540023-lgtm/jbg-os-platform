# 附錄 K · Human Review Checklist

> 本附錄是 `docs/07` §Human Review 關卡的**可操作版**：把每個人審場景拆成「人要看什麼 / 通過條件 / 退回條件 / 可編輯欄位」。
> 對應 §0.6（Human Review 是關卡不是 Agent）、§0.9（Permission）、§0.11（`human_review_status`）、§0.7（SHAP 主流程 stage）。
> Human Review 的權威狀態機：`human_review_status`：`pending → approved | rejected | edited | expired`（§0.11）。

---

## K.1 Human Review 是什麼、什麼時候觸發

`HumanReview`（HR，見 §0.5 Governance）是一個**等待人類決策的關卡**。它由 `Reviewer Agent` 或 `PolicyEngine` 觸發（§0.6 / §0.9），把一個決策交給人類在 UI 上 `approve` / `reject` / `edit`。

觸發時，對應的 `LoopExecution` 進入 `waiting_human`（§0.11），直到人類完成決策才續跑（`approved`/`edited` → 續跑；`rejected` → 回退到指定 stage；`expired` → 走逾時策略，見 K.9）。

**通用原則（§0.9）**：AI 可以「提議」任何事，但**有外部副作用或不可逆**的動作（發佈、改價超門檻、回客戶、刪除、寫入記憶）預設要經 Permission 或 Human Review。

每個 HR 卡片（UI）至少呈現：來源 stage、觸發原因、AI 的主張與信心、可編輯欄位、`approve/reject/edit` 動作、退回目標 stage。

---

## K.2 通用 HR Checklist（所有場景先過這 4 條）

- [ ] **來源可信**：AI 主張所依據的事實（照片 / OCR / 記憶）確實存在且相關。
- [ ] **信心與風險相稱**：低信心 / 高金額 / 高合規風險的項目，人有實際看過而非秒按。
- [ ] **副作用可控**：approve 後會發生的外部動作（發 FB / 改價 / 回客戶）是預期內的。
- [ ] **留痕**：我的 approve/reject/edit 會寫進 `AuditLog`（誰、何時、改了什麼、為什麼）。

---

## K.3 場景 1 · 商品卡補件（gap-check 缺資料）

**觸發**：`[gap-check]` stage 發現 Product 商品卡缺關鍵欄位（品牌 / 品類 / 尺寸 / 瑕疵 / 照片不足），產生 `Task` + `HumanReview`。
**目標 Entity**：`Product`、`ProductPhoto`、`Task`。

| 項目 | 內容 |
|---|---|
| **人要看什麼** | 哪些欄位缺 / 低信心；現有照片是否足以補；OCR/Vision 抽到什麼但沒對上 |
| **通過條件 (approve)** | 關鍵欄位齊備且合理；照片足以支撐後續估價與文案 |
| **退回條件 (reject)** | 照片根本拍錯商品 / 模糊到無法辨識 / 缺件無法補 → 退回 `[assemble]` 或要求重拍（回 `[drive-ingest]`） |
| **可編輯欄位 (edit)** | `Product.brand_id`、`category_id`、屬性（顏色/尺寸/材質）、瑕疵描述、主圖選擇；**不可**在此改價 |

- [ ] 缺的欄位已補齊或明確標記「無此資訊」。
- [ ] 補的值有照片 / OCR 依據，不是憑空填。
- [ ] `edit` 的內容值得回饋給 Vision/OCR Agent（見 K.10）。

---

## K.4 場景 2 · 估價審核（Price Agent 高價 / 低信心）

**觸發**：`[price]` stage，`PriceSuggestion` 金額超過 Policy 門檻，或信心低於閾值（§0.6：高價/低信心 → 需 HR；§0.9：改價超門檻走 PolicyEngine）。
**目標 Entity**：`PriceSuggestion`、`Price`、`PriceHistory`、`Product`、`AgentRun`。

| 項目 | 內容 |
|---|---|
| **人要看什麼** | 建議售價、區間、**理由與信心**；Price Agent 引用的市場記憶 / 可比品；與歷史 `PriceHistory` 是否合理 |
| **通過條件 (approve)** | 價格合理、理由站得住、風險（賣不掉 / 賤賣）可接受 |
| **退回條件 (reject)** | 明顯過高 / 過低、理由引用了錯誤可比品、信心過低且無佐證 → 退回 `[price]` 重估或改走人工定價 |
| **可編輯欄位 (edit)** | 最終 `Price._amount`（整數最小貨幣單位）+ `_currency`；可加人工註記理由 |

- [ ] 金額用整數最小貨幣單位、幣別正確（不是 float，§0.10）。
- [ ] 若 `edit` 覆蓋 AI 建議，理由已記錄（供 Eval 對照 AI vs 人）。
- [ ] approve 不會自動觸發超門檻的其他副作用（只定價，不順便發佈）。

---

## K.5 場景 3 · 文案審核（Marketing Agent 首次上架 / 合規）

**觸發**：`[compose]`/`[review]`，Marketing Agent 產出 `Listing` draft 且為**首次上架**（§0.6：首次上架需 HR），或 Reviewer Agent 標記合規疑慮。
**目標 Entity**：`Listing`（draft）、`Product`。

| 項目 | 內容 |
|---|---|
| **人要看什麼** | 標題 / 內文 / hashtag / 賣點是否誠實（無誇大瑕疵掩蓋）；合規（不涉禁售品、不誤導、真偽聲明）；語氣符合品牌 |
| **通過條件 (approve)** | 文案準確描述商品狀態、無合規風險、可直接發佈 |
| **退回條件 (reject)** | 誇大 / 隱瞞瑕疵 / 可能違反平台規範 / 與商品卡不符 → 退回 `[compose]` 重寫 |
| **可編輯欄位 (edit)** | 標題、內文、hashtag、賣點排序；**不可**在此改價或改商品屬性 |

- [ ] 文案與 `Product` 實際狀態（瑕疵 / 附件）一致。
- [ ] 無合規紅線（禁售、仿冒聲明、誇大療效/功能）。
- [ ] `edit` 後的版本可作為 Marketing Agent 的正向樣本（K.10）。

---

## K.6 場景 4 · 發佈前最終確認（Publisher）

**觸發**：`[human-review]`→`[publish]` 之間，Publisher 準備把 approved `Listing` 送上 FB。因為「發佈」是**外部、不可逆**副作用（§0.9），受 Permission 管。
**目標 Entity**：`Listing`、`Connector`（`facebook`）、`Publisher Agent`。

| 項目 | 內容 |
|---|---|
| **人要看什麼** | 最終將發佈的完整內容（文案+圖+價）；發佈目標（哪個 FB 頁/社團）；發佈時間 |
| **通過條件 (approve)** | 內容 = 已審過的版本、目標正確、價格已定案 → 授權 Publisher 發佈 |
| **退回條件 (reject)** | 內容在審核後又被動過、目標錯、價未定 → 退回 `[review]`/`[compose]` |
| **可編輯欄位 (edit)** | 發佈目標、排程時間；內容本身應在前面關卡定案，這裡以「放行」為主 |

- [ ] 發佈**經 `facebook` Connector**，非裸 fetch（§0.8）。
- [ ] Publisher 動作有 Permission 檢查（§0.9），且**冪等**（重送不重複發，見附錄 I）。
- [ ] approve 後 `listing_status` 依序走 `approved → published`（§0.11）。

---

## K.7 場景 5 · 客訴 / 售後處理升級

**觸發**：`[engage]`/`[aftersale]`，客服（MVP 半自動）遇到退換 / 客訴 / 爭議，超出自動回覆權限（回覆客戶是外部副作用，§0.9）→ 升級人審。
**目標 Entity**：`AfterSale`、`Order`、`Inquiry`、`Listing`。

| 項目 | 內容 |
|---|---|
| **人要看什麼** | 客訴內容、對應 `Order`/`Inquiry` 脈絡、AI 建議的回覆與方案（退款/換貨/補償） |
| **通過條件 (approve)** | 回覆得體、方案在授權範圍（金額 / 政策）內 → 授權送出 |
| **退回條件 (reject)** | 回覆不當 / 方案超授權 / 需老闆親自處理 → 退回或轉人工接手 |
| **可編輯欄位 (edit)** | 回覆文字、補償方案、`AfterSale` 分類與狀態 |

- [ ] 對客戶的回覆**經 Connector**（`facebook`/`line`）送出，且經 Permission。
- [ ] 涉及退款 / 補償金額走整數最小貨幣單位並落 `AuditLog`。
- [ ] 高頻客訴模式值得寫回 Memory（K.10），改善 `[engage]` 自動回覆。

---

## K.8 場景 6 · 記憶寫入審核（避免寫入錯誤事實）

**觸發**：`[remember]`，Memory Agent 從成交 / 詢問 / 售後萃取出**新的一般化事實 / 偏好**（e.g.「Chanel 中古在本社群溢價 X%」），寫入 `Memory` 前需人審——因為錯誤記憶會污染未來所有推理。
**目標 Entity**：`Memory`、`MemoryLink`、`Embedding`。

| 項目 | 內容 |
|---|---|
| **人要看什麼** | 這條記憶的**斷言、來源事件、適用範圍**；是否過度一般化；與既有 `Memory` 是否矛盾 |
| **通過條件 (approve)** | 事實正確、來源充分、範圍限定得當 → 寫入 `Memory`（並建 `MemoryLink`） |
| **退回條件 (reject)** | 以偏概全 / 樣本太少 / 與已知事實衝突 / 是一次性特例 → 不寫入或降級為 `reference` |
| **可編輯欄位 (edit)** | 記憶斷言文字、type（fact/preference/feedback/reference）、適用範圍標籤、關聯 `[[slug]]` |

- [ ] 記憶是可重用的一般事實，不是單筆訂單的雜訊。
- [ ] 與既有記憶無矛盾（有矛盾則先處理衝突再寫）。
- [ ] 標明來源事件，可追溯、可日後撤銷。

---

## K.9 SLA / 逾時策略（`expired`）

`human_review_status` 的 `expired` 對應「人沒在時限內處理」。逐場景定 SLA 與逾時行為：

| 場景 | 建議 SLA | 逾時（`expired`）行為 |
|---|---|---|
| 補件（K.3） | 48h | Task 標 `blocked`，LX 掛起等補件；不自動放行 |
| 估價（K.4） | 24h | **不自動套用**建議價；退回 `[price]` 或維持 draft（保守） |
| 文案（K.5） | 24h | 維持 draft，不發佈 |
| 發佈前（K.6） | 12h | **不自動發佈**（外部不可逆，預設保守） |
| 客訴（K.7） | 4h（時效敏感） | 升級 `line` 推播提醒老闆；不自動回覆 |
| 記憶（K.8） | 72h | 不寫入 `Memory`（保守）；保留為待審 |

原則：**逾時一律往「不執行不可逆副作用」的保守方向 fallback**，並透過 `line` Connector 推播提醒（§0.8）。SLA 逼近時應升級提醒，而非直接 `expired`。

---

## K.10 Audit 與「把人的修改回饋成 Eval / Memory」

### Audit（不可變紀錄）
每一次 HR 決策都寫一條 `AuditLog`（§0.5 Governance，polymorphic）：

- **Who**：`Actor`（human user id）。
- **When**：`created_at`（timestamptz）。
- **What**：target（`HumanReview` + 其 target entity）、動作（`approved`/`rejected`/`edited`）、**edit 的前後值 diff**。
- **Why**：人填的理由（reject / edit 時建議必填）。

`AuditLog` 不可修改、不可刪除；是追責與復盤的唯一事實來源。

### 回饋迴路（讓人審讓 Agent 變好）
人審不只是把關，更是**訓練訊號**：

1. **`edited` → Eval 樣本**：人把 AI 建議改掉的每個欄位，就是一個「AI 錯、人對」的對照。收集成 `EvalRun` 的 case，量化各 Agent 的偏差（估價偏高？文案誇大？）。
2. **`rejected` + 理由 → 負樣本 / prompt 修正**：反覆同類 reject 指向 prompt 或 context 缺陷，回饋到 `docs/07` 的 Agent 契約與 `packages/prompts/*`。
3. **一般化事實 → Memory**：場景 6 approve 的記憶直接進 `Memory`；其他場景中人反覆做的判斷（e.g.「這類瑕疵一律標 B 級」）可萃取成 `Memory`，讓下次 Agent 自帶這個 context。
4. **量測改善**：把「HR 觸發率」「edit 率」「reject 率」當作各 Agent 的 KPI；理想是隨記憶累積而下降（Agent 越來越少需要人）。

> 這正是 Loop Engineering 的閉環：Eval（#10）與 Memory（#9）把人審變成 Agent 的持續改善燃料，而不是永遠的人力瓶頸。

---

## 本章交付物 (Deliverables)
- 6 個人審場景各自的「看什麼 / 通過 / 退回 / 可編輯欄位」checklist（K.3–K.8）。
- 通用 HR checklist 與觸發原則（K.1–K.2）。
- 逐場景 SLA 與 `expired` 逾時保守策略（K.9）。
- Audit 結構與「人審 → Eval / Memory」回饋迴路（K.10）。

## 驗收條件 (Acceptance Criteria)
- [ ] 每個 HR 場景在 UI 上都能呈現：觸發原因、AI 主張+信心、可編輯欄位、approve/reject/edit、退回目標 stage。
- [ ] `human_review_status` 實作與 §0.11（`pending → approved | rejected | edited | expired`）一致。
- [ ] 每次決策寫入不可變 `AuditLog`（who/when/what-diff/why）。
- [ ] 每個場景有 SLA，逾時 fallback 一律不執行不可逆副作用並經 `line` 提醒。
- [ ] `edited`/`rejected` 能被收集為 `EvalRun` case 或 `Memory`，形成 Agent 改善迴路。
