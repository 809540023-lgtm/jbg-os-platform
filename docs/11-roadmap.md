# 11 · Roadmap (MVP → Beta → Production → Enterprise)

> 本章定義 JBG OS 從「能動」到「可規模化」的四個階段。每階段給：**目標 / 範圍 / scope-in / scope-out / 成功指標 / 風險**。
> 所有 Loop、Agent、Entity、狀態機名稱一律引用 `docs/00-canonical-model.md`（合約），與 §0.5–0.11 完全一致。
> 開發**怎麼做**（每天怎麼推、Todo/Eval/Review 循環）在 `docs/12`；本章只講**做什麼、做到什麼程度**。
>
> 版本：v1.0 · 最後更新：2026-07-07

---

## 11.0 讀本章的方式 (How to Read This)

- 四階段是**能力成熟度**的遞進，不是純時間軸。判斷「可以進下一階段」的依據是**成功指標達標 + Eval 通過門檻**（見 §11.6），不是「時間到了」。
- 每階段的核心動作，是把 §0.7 主流程的某些 `[stage]` 從 **manual → assisted → auto** 往上推一格（成熟度表見 §11.5）。
- 每階段皆繼承前一階段的全部能力；下表只列「該階段**新增/升級**」的部分。
- 本 Roadmap 描述的第一 vertical 是 **SHAP**；OS 層能力（Loop runtime / Agent runtime / Memory / Permission / Observability）在每階段同步增厚，凡只對二手業務成立者標 `SHAP-specific`。

```
成熟度階梯（每個 Loop/Agent 各自沿此爬）
 manual  ──►  assisted  ──►  auto
 人做      AI 產草稿、人審核放行   AI 自動放行、人只看例外
（MVP 目標把主線推到 assisted；Beta/Prod 逐格升 auto）
```

---

## 11.1 MVP — 「一張照片 → FB 上架草稿 → 人審 → 發佈」打通

### 目標 (Goal)
把 §0.7 `product-lifecycle` 主流程的**前半段核心**端到端打通到可用：**一張 Google Drive 照片，半自動變成一則 FB 上架草稿，經人類審核後真的發佈到 FB**。此階段證明「Loop Engineering 這套外化流程能跑」，而不是追求品質或自動化率。

一句話驗收：**老闆把照片丟進 Drive 資料夾 → 幾分鐘後在後台看到一張商品卡 + 文案草稿 + 建議售價 → 按「發佈」→ FB 出現貼文。**

### 範圍：哪些 Loop / Agent / 畫面上線

**Loop / Workflow（§0.7 階段的最小版）**

| Stage | MVP 狀態 | 說明 |
|---|---|---|
| `drive-ingest` | assisted | `drive` Connector 監看單一 Drive 資料夾、抓新照片、建 `ProductPhoto`。輪詢即可（不需 webhook）。 |
| `perceive` | assisted | `ocr` + `vision` 並行跑一次；低信心不阻斷，只標記。 |
| `assemble` | assisted | 合併 OCR+Vision 產出 `Product` 商品卡（單張照片＝單一 Product 可接受）。 |
| `gap-check` | **manual** | 缺欄位只**標記**並開 `Task` / `HumanReview`，由人補；不做自動補件。 |
| `price` | assisted | `price` Agent 產 `PriceSuggestion`（含區間、理由、信心）。市場記憶可為空，先靠模型常識 + 少量手輸比價。 |
| `compose` | assisted | `marketing` Agent 產 `Listing` draft（標題/內文/hashtag）。 |
| `review` | assisted | `reviewer` Agent 自動審商品卡完整性/文案/價格合理性，pass/reject + 理由。 |
| `human-review` | **manual（強制）** | MVP **每一則發佈前都進人審**（不是只有高風險）。人可 approve / reject / edit。 |
| `publish` | assisted | `publisher` Agent 把 approved `Listing` 發上 FB，寫回 `Listing.published` + FB post id。 |
| `remember` | **manual/半自動** | `memory` Agent 最小版：成交/人審 edit 內容寫入一條 `Memory`（純文字，pgvector 可延後到 Beta）。 |

> `engage` / `close` / `aftersale` **scope-out**（見下）。MVP 到 `publish` + 最小 `remember` 為止。

**Agent（§0.6，最小可用版）**：`vision`、`ocr`、`price`、`marketing`、`reviewer`、`publisher`、`memory` 全部上線，但都以「產草稿 + 需人審」形式運作（assisted）。

**最小 Entity / table（§0.5、§0.10）**
- Catalog：`products`、`product_photos`、`brands`、`categories`
- Perception：`ocr_results`、`vision_results`（`embeddings` 可延後）
- Pricing：`prices`、`price_suggestions`（`price_histories` 可延後）
- Loop：`loops`、`loop_executions`、`loop_steps`、`tasks`（`workflows` 可先用常數定義 product-lifecycle，不必進 DB）
- Agent：`agents`、`agent_runs`、`prompts`、`context_snapshots`（`skills` 可先用 code 常數）
- Channel：`connectors`、`listings`（`inquiries`/`orders`/`after_sales` 延後）
- Governance：`human_reviews`、`audit_logs`、`actors`（`policies` 用最小 hardcode 規則、`eval_runs` 延後到 Beta）
- Memory：`memories`（`memory_links`、`embeddings` 延後）

**最小畫面 (UI，見 `docs/09`)**
1. **收件匣 / Product 列表**：新進商品卡、狀態（`listing_status`：draft→in_review→…）。
2. **商品卡詳情**：照片、OCR/Vision 結果、Product 欄位、`PriceSuggestion`、`Listing` draft。可編輯。
3. **Human Review 面板**：待審隊列、approve / reject / edit、理由欄。
4. **發佈結果**：FB post 連結、狀態。
5. **一頁 LoopExecution trace（最小 Observability）**：一條 LX 的步驟、耗時、cost、status。

### Scope-in（MVP 一定要有）
- 單一 Drive 資料夾 → 單商品端到端到 FB。
- 7 個 Agent 的最小 I/O 契約（`docs/07`）跑得起來、有 `agent_runs` 記帳。
- **強制人審**每一則發佈（安全優先）。
- `publisher` 的外部副作用**必須**走 `facebook` Connector + 過一次 Permission 檢查（§0.9）。
- 每次執行留下 `loop_executions` / `loop_steps` / `audit_logs`（可追溯）。
- `line` Connector 最小版：有待審 / 發佈成功 → 推播通知老闆。

### Scope-out（MVP 明確不做）
- ❌ 客服 `engage`、成交 `close`、售後 `aftersale`（Beta 起）。
- ❌ 自動放行（任何 auto 級發佈）；MVP 一律人審。
- ❌ pgvector 記憶回饋迴圈、Memory recall 進 price context（Beta）。
- ❌ 多商品批次、多資料夾、多帳號（Beta）。
- ❌ `EvalRun` 自動評分制度（Beta）；MVP 只做人工抽查。
- ❌ `PolicyEngine` 完整版；MVP 用最小 hardcode policy（「publish 一律需 HR」）。
- ❌ 多租戶 / 白標 / Connector 市集（Enterprise）。

### 成功指標 (可量測)
| 指標 | 目標 |
|---|---|
| 端到端成功率 | 丟 20 張照片，≥ 80% 能不改 code 走到「可發佈草稿」 |
| 人審後可發佈率 | 產出草稿中 ≥ 70% 經人審 edit ≤ 2 個欄位即可發佈 |
| 端到端時間 | 照片進 Drive → 出現可審草稿 ≤ 5 分鐘（p50） |
| 可追溯性 | 100% 發佈動作可在 `audit_logs` + LX trace 回放 |
| 每商品 AI 成本 | 有數字（$/product 記錄在 `agent_runs`），不設硬門檻 |

### 風險 (Risks)
- **感知品質不穩**：OCR/Vision 對二手商品吊牌/瑕疵辨識可能差 → 緩解：低信心不阻斷、走 `gap-check` 開 Task 讓人補。
- **FB 發佈政策/API 變動**：Graph API 權限、貼文限制 → 緩解：Connector 層隔離、失敗有明確錯誤與重試（附錄 F）。
- **範圍蔓延**：想順手把客服/批次做進來 → 緩解：嚴守 scope-out，用本表當守門。
- **Prompt 漂移**：改 prompt 讓某類商品變好卻讓另一類變差 → 緩解：Beta 前先建最小人工抽查集，Beta 正式上 Eval。

---

## 11.2 Beta — 品質、回饋迴圈、客服半自動、Eval 上線

### 目標 (Goal)
從「能動」到「越用越準」。導入 **Memory 回饋迴圈**讓估價/文案品質隨成交資料提升；把**客服 `engage` 半自動化**；正式上線 **Eval 制度**做為升級 auto 的依據；支援**多商品批次**與**觀測儀表板**。

### 範圍（新增 / 升級）
- **Memory 回饋迴圈（SHAP-specific 資料，OS 機制通用）**：`embeddings` + pgvector 上線；成交價、人審 edit、詢問轉換寫入 `memories` + `memory_links`；`price` / `marketing` 的 `ContextBuilder` 開始 recall 相關記憶（§0.4 layer 2/9）。
- **客服 `engage` 半自動**：`facebook` Connector 讀留言/私訊 → 建 `Inquiry`；新增 engage 回覆草稿能力（可由 `marketing` 或新 skill 產草稿），**人審後送出**（assisted）。`close` → `Order` 最小版上線。
- **Eval 上線**：`packages/eval` + `eval_runs`；對 `vision`/`price`/`marketing`/`reviewer` 建 golden set，每次 prompt/model 變更跑回歸；分數進儀表板。
- **多商品批次**：`drive-ingest` 支援多資料夾/整批；`loop_executions` 併發；批次審核 UI。
- **觀測儀表板 (Observability)**：跨 LX 的成功率、耗時、cost、各 Agent Eval 分數、人審通過率、reject 原因分佈。
- **`PolicyEngine` v1**：把 MVP 的 hardcode 規則改成資料庫 `policies`（如「price 建議 ≤ 門檻且信心 ≥ X 可免 HR」）。

### Scope-in
- Memory recall 實際改善 `price`/`compose` 輸出（可用 Eval 前後對比證明）。
- `engage` 產草稿 + 人審送出、`Inquiry`→`Order` 打通。
- 每個 Agent 有 golden set + 回歸 Eval + 儀表板分數。
- 至少一個 Loop/Agent 依 §11.6 標準從 assisted **試點升 auto**（建議 `ocr` 或低風險 `perceive`）。

### Scope-out
- ❌ `aftersale` 全自動、退換貨流程自動化（Production）。
- ❌ 多租戶、角色權限矩陣、白標（Enterprise）。
- ❌ 成本硬性 SLA / 稽核合規報表（Production）。
- ❌ 未經人審的客服自動回覆（回覆客戶屬 §0.9「外部副作用」，Beta 一律人審）。

### 成功指標
| 指標 | 目標 |
|---|---|
| 估價品質 | 導入 Memory 後 `price` Eval 分數 vs MVP baseline 提升 ≥ 15% |
| 文案人審 edit 率 | `compose` 需人工大改（>2 欄）比例 < 30% |
| 客服首回覆時間 | `Inquiry` 進來 → 草稿就緒 ≤ 2 分鐘（p50） |
| Eval 覆蓋 | 5 個推理型 Agent（vision/ocr/price/marketing/reviewer）皆有 golden set + 回歸 |
| 首個 auto 升級 | ≥ 1 個 Loop/Agent 通過升 auto 門檻並穩定運行 2 週 |

### 風險
- **Memory 汙染**：把壞成交/離群值當事實記憶 → 緩解：Memory 寫入前過 `reviewer` 或信心門檻、可標記淘汰。
- **Eval golden set 偏誤**：樣本不代表真實分佈 → 緩解：從真實 `agent_runs` 抽樣、定期更新。
- **客服語氣/合規**：AI 回覆得罪客戶或亂承諾 → 緩解：全程人審、話術受 Policy 約束。
- **過早 auto**：Eval 分數好但長尾出包 → 緩解：升 auto 需「Eval 達標 + 觀測期無重大事故」雙條件（§11.6）。

---

## 11.3 Production — 可靠性、權限、稽核、成本控管、SLA

### 目標 (Goal)
從「越用越準」到「可以放心讓它多做」。把**可靠性、權限、稽核、成本控管**做完備，把已驗證的 Loop/Agent 從 assisted 升到 auto，訂出並達成 **SLA**。

### 範圍（新增 / 升級）
- **可靠性**：Loop runtime 具冪等、重試、死信、斷點續跑；`loop_execution_status` 全狀態（含 `waiting_human`/`failed`/`cancelled`）都有處置；Connector 全走附錄 F（rate limit、退避、冪等 key）。
- **權限完備**：Supabase RLS 全表 `deny`-first + 逐表 policy；`PolicyEngine` 覆蓋所有「外部副作用/不可逆」動作（發佈、改價超門檻、回客戶、刪除）。兩種 `Actor`（human/agent）分權。
- **稽核**：`audit_logs` 不可變、可回放到 `ContextSnapshot` 級；合規/交易報表可匯出。
- **成本控管**：per-Loop / per-Agent token 預算與告警；`MODELS.*` 分級（REASONING/VISION/FAST）成本最佳化；超預算自動降級或轉人審。
- **自動化提高**：多個低風險階段升 auto（`perceive`、`assemble`、低價低風險 `price`/`publish`）；人只審**例外**（低信心、高價、Policy 命中）。
- **SLA**：定義並監控可用性、端到端時延、發佈成功率、事故 MTTR。

### Scope-in / Scope-out
- Scope-in：全狀態機健全、RLS+PolicyEngine 全覆蓋、成本告警、SLA 儀表板與告警、`aftersale` 半自動、災難復原/備援演練。
- Scope-out：❌ 多租戶隔離、第二 vertical、Connector 市集、白標、團隊角色矩陣（皆 Enterprise）。

### 成功指標
| 指標 | 目標 |
|---|---|
| 發佈成功率（SLA） | ≥ 99%（失敗可自動重試或明確落人審） |
| 端到端可用性 | ≥ 99.5% |
| 自動放行占比 | 低風險商品 ≥ 60% 全自動發佈（不進人審） |
| 人審負載 | 人只需審 ≤ 30% 的商品（其餘 auto） |
| 成本可控 | 每商品 AI 成本有預算上限、100% 有告警；月成本可預測 |
| 稽核 | 100% 副作用動作可回放到當時 context/policy 判斷 |

### 風險
- **Auto 出包放大**：自動放行讓錯誤直達 FB → 緩解：分級升 auto、金額/風險門檻、隨時可一鍵回退 auto→assisted。
- **權限漏洞**：RLS/Policy 有洞讓 agent 越權 → 緩解：deny-first、安全審查、附錄 K 人審 checklist 覆蓋高風險動作。
- **成本失控**：批次+auto 讓 token 暴衝 → 緩解：預算閘、模型分級、超額降級。

---

## 11.4 Enterprise — 多租戶、第二 Vertical、Connector 市集、白標

### 目標 (Goal)
從「一個老闆的二手生意」到「一套可賣的 AI Business OS」。支援**多租戶**、把 JBG OS 開給**第二個 vertical（不只二手）**、提供 **Connector 市集**、**團隊協作與角色權限**、**白標**。

### 範圍（新增 / 升級）
- **多租戶 (multi-tenant)**：`tenant_id` 貫穿所有 table；RLS 依租戶隔離；資料/成本/Eval 分租戶統計。
- **第二 vertical**：證明 OS 層可重用——把 SHAP-specific 部分抽成可替換的 Loop/Agent/Prompt 套件；上線一個非二手 vertical（例：全新品代購 / 其他品類）驗證抽象。
- **Connector 市集**：`Connector` 成為可插拔套件（附錄 F 標準介面），第三方可依規範新增 Drive/FB/LINE 以外通路。
- **團隊協作與角色權限**：`Actor` 擴為多 human 角色（owner/reviewer/operator/viewer）；`PolicyEngine` 支援角色矩陣；`HumanReview` 可指派/轉派。
- **白標 (white-label)**：品牌、網域、UI 主題可依租戶客製。

### Scope-in / Scope-out
- Scope-in：租戶隔離與計量、第二 vertical 上線、Connector SDK + 市集、RBAC、白標主題、租戶級 Eval/Observability。
- Scope-out（本 Roadmap 邊界外，另立版本）：❌ 跨租戶資料共享的 marketplace、AI 模型自訓、開放 API 平台計費（v2 Roadmap）。

### 成功指標
| 指標 | 目標 |
|---|---|
| 租戶隔離 | 0 起跨租戶資料外洩（安全測試 + RLS 驗證） |
| 第二 vertical 上線 | 不改 OS 核心、僅換 Loop/Agent/Prompt 套件即可跑通主流程 |
| Connector 擴充 | 依 SDK 新增 1 個新 Connector 的工時 ≤ 既有 Connector 首版的 50% |
| 角色權限 | RBAC 覆蓋所有動作；越權嘗試 100% 被 Policy 擋下並記 `audit_logs` |
| 白標 | ≥ 2 個租戶以不同品牌/網域同時運行 |

### 風險
- **抽象滲漏**：SHAP-specific 邏輯滲進 OS 核心，第二 vertical 難接 → 緩解：從 MVP 起就標 `SHAP-specific`、Enterprise 前做一次抽象審查。
- **租戶隔離缺陷**：多租戶最大風險是資料外洩 → 緩解：RLS+租戶 scope 測試套件、安全審查列為 gate。
- **市集治理**：第三方 Connector 品質/安全 → 緩解：Connector 需過附錄 F 檢核 + Permission 沙箱。

---

## 11.5 能力成熟度總表 (Capability Maturity — manual → assisted → auto)

每個 Loop 階段 / Agent 在各階段的**自動化程度**。`M`=manual、`A`=assisted（AI 草稿+人審）、`⚡`=auto（AI 自動放行，人看例外）。

| §0.7 Stage / §0.6 Agent | MVP | Beta | Production | Enterprise |
|---|:---:|:---:|:---:|:---:|
| `drive-ingest` | A | A | ⚡ | ⚡ |
| `perceive` (`ocr`) | A | ⚡ | ⚡ | ⚡ |
| `perceive` (`vision`) | A | A | ⚡ | ⚡ |
| `assemble` | A | A | ⚡ | ⚡ |
| `gap-check` | M | A | A | ⚡ |
| `price` | A | A | ⚡（低價/高信心） | ⚡ |
| `compose` (`marketing`) | A | A | A→⚡（低風險） | ⚡ |
| `review` (`reviewer`) | A | A | ⚡ | ⚡ |
| `human-review` | M（強制全審） | M（高風險） | M（僅例外） | M（角色分派+例外） |
| `publish` (`publisher`) | A（必人審） | A | ⚡（低風險+Policy） | ⚡ |
| `engage` | — | A | A | ⚡（低風險） |
| `close` (`Order`) | — | A | A | ⚡ |
| `aftersale` | — | — | A | A |
| `remember` (`memory`) | 半自動 | A | ⚡ | ⚡ |
| **Memory recall 進 context** | ✗ | ✓ | ✓ | ✓（分租戶） |
| **Eval 制度** | 人工抽查 | ✓ golden set | ✓ 回歸+門檻 | ✓ 分租戶 |
| **PolicyEngine** | hardcode | v1（DB policy） | 全覆蓋 | RBAC 角色矩陣 |
| **Multi-tenant** | ✗ | ✗ | ✗ | ✓ |

> 規則：`human-review` 永遠保留 manual 關卡的**存在**，只是**觸發範圍**隨階段收窄（全審 → 高風險 → 僅例外）。「回覆客戶 / 發佈 / 改價超門檻 / 刪除」等 §0.9 不可逆動作，升 auto 一律需 Policy 明文放行。

---

## 11.6 從 assisted 升 auto 的判準 (Promotion Gate)

一個 Loop/Agent 要從 `assisted` 升到 `auto`，**必須同時滿足**（詳細操作見 `docs/12` §12.7）：

1. **Eval 達標**：該 Agent 在最新 golden set 上分數 ≥ 設定門檻（例：≥ 0.9），且近 N 次無回歸。
2. **觀測期無事故**：assisted 模式下連續運行 ≥ 2 週、樣本 ≥ 設定數量，人審 **override / reject 率低於門檻**（代表人幾乎都同意 AI）。
3. **Policy 明文放行**：`PolicyEngine` 有一條規則界定「什麼條件下此動作免 HR」（含金額/風險/信心門檻）。
4. **可回退**：一個開關能立即把該階段從 auto 打回 assisted（不需改 code / 重部署）。
5. **例外仍落人審**：低信心、超門檻、Policy 命中者，auto 模式下仍自動轉 `waiting_human`。

> 反向亦然：Observability 偵測到 auto 階段事故率上升，應自動或一鍵降級回 assisted，並開 `Task` 調查。

---

## 11.7 依賴順序 (Dependency Order — 什麼要先做)

```
Gantt 風格（→ = 必須先於；同列 = 可並行）

階段0 · 地基 (MVP 前置)
  [合約 docs/00]───►[Schema docs/06]───►[Connector 骨架 drive/facebook/line]
                        │                       │
                        └──►[Loop runtime]      └──►[Permission 最小版 RLS+hardcode policy]
                                 │
                                 └──►[Agent runtime + agent_runs 記帳]

階段1 · MVP 端到端 (依序，前段 assemble 產物餵後段)
  drive-ingest ─► perceive(ocr‖vision) ─► assemble ─► gap-check
                                                         │
                                     price ─► compose ─► review ─► human-review ─► publish ─► remember(min)

階段2 · Beta (可並行三線，皆依賴 MVP 打通)
  A) Memory 迴圈:  embeddings/pgvector ─► memories/links ─► ContextBuilder recall ─► price/compose 提升
  B) 客服:         facebook 讀 ─► Inquiry ─► engage 草稿 ─► human-review ─► Order(close)
  C) 品質基建:     Eval golden set ─► eval_runs ─► Observability 儀表板 ─► 首個 auto 升級(§11.6)

階段3 · Production (先可靠與權限，後提升 auto)
  可靠性(冪等/重試/續跑) ┐
  RLS 全覆蓋 + PolicyEngine 全覆蓋 ├─► 成本控管/告警 ─► 升 auto(低風險階段) ─► SLA 監控
  稽核(audit_logs 可回放) ┘

階段4 · Enterprise (先抽象，後多租戶與生態)
  抽象審查(標記/抽出 SHAP-specific) ─► multi-tenant(tenant_id+RLS) ─┐
                                                                    ├─► 第二 vertical
  Connector SDK ─► Connector 市集                                   │
  RBAC(角色矩陣) + HumanReview 指派 ─► 白標 ────────────────────────┘
```

**硬性先後（不可跳）**
1. `docs/00` 合約 → 任何 code。
2. Schema（`docs/06`）→ Loop/Agent runtime → 各階段實作。
3. Connector 層 → 任何外部副作用（Agent 不得直接 fetch）。
4. Permission 最小版 → `publish`（第一個真正的外部副作用）。
5. MVP 全線打通 → 才動 Beta 三線。
6. Eval + Observability → 才允許任何 auto 升級。
7. 可靠性 + 權限完備 → 才進 Production 級 auto。
8. 抽象審查（分離 SHAP-specific）→ 才進 multi-tenant / 第二 vertical。

---

## 本章交付物 (Deliverables)

- [ ] 四階段（MVP/Beta/Production/Enterprise）各自的目標、範圍、scope-in/out、成功指標、風險（§11.1–11.4）。
- [ ] 跨階段能力成熟度總表：每個 Loop/Agent 在四階段的 manual/assisted/auto 位置（§11.5）。
- [ ] assisted→auto 升級判準（Promotion Gate，§11.6）。
- [ ] 依賴順序圖（Gantt 風格，含硬性先後清單，§11.7）。
- [ ] 全章 Loop/Agent/Entity/狀態名稱與 `docs/00` §0.5–0.11 一致。

## 驗收條件 (Acceptance Criteria)

- [ ] 每一階段都能回答：「上線哪些 Loop/Agent/畫面？哪些明確不做？怎麼量測成功？」——無空泛描述。
- [ ] MVP 明確列出最小 Entity/table/Agent/畫面清單，且標明哪些階段可先 manual/半自動。
- [ ] 成熟度表覆蓋 §0.7 全部 stage 與 §0.6 全部 7 個 Agent，無遺漏。
- [ ] 升 auto 判準可被 `docs/12` §12.7 直接引用執行（有可檢核條件，非口號）。
- [ ] 依賴圖的硬性先後與 §0.7 主流程、§0.9 Permission 原則不衝突。
- [ ] 任何 §0.5–0.11 未定義的新 Entity/Agent/狀態，本章**未擅自發明**（若需要，已回填 `docs/00`）。
