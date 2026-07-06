# 01 · Vision & Product Philosophy

> 依循 `docs/00-canonical-model.md`（SSOT）。本章不新增任何 Entity/Agent/Loop，只確立**產品哲學與世界觀**，供 `docs/02`（Business Analysis）與 `docs/03`（Loop Engineering Architecture）承接。
> 核心主張（全章圍繞它）：**這不是商品管理系統，而是 AI 商品生命週期平台 (AI Product Lifecycle Platform)。**

---

## 1.1 為什麼要做這個系統 (Why This Exists)

今天整個生意跑在**一個人的腦子裡**。

`SHAP-specific`：老闆一個人同時是採購、鑑定師、估價師、文案、客服、出貨、售後與「經驗資料庫」。一件二手/代購商品從一張 Google Drive 照片，到 FB 上成交、售後、變成下次判斷的依據，中間**每一個決策都發生在他腦中，而且只發生在他腦中**：

- 這張照片是哪一件商品？→ 靠他記得。
- 這是什麼品牌、什麼型號？→ 靠他認得。
- 這件值多少、能賣多少、底價多少？→ 靠他「感覺」。
- 文案怎麼寫最好賣？→ 靠他手感。
- 這個客人問的問題怎麼回、要不要讓價？→ 靠他經驗。
- 上次這型號賣得好不好、退貨多不多？→ 靠他記憶。

這套「腦內作業系統」很強，但它有三個**結構性缺陷**，決定了生意的天花板：

| 缺陷 | 具體現象 | 後果 |
|---|---|---|
| **無法外化 (Not Externalizable)** | 知識與判斷只存在腦中，沒有一處可讀、可查、可版本化的載體 | 沒人能複製他的判斷；他不在＝生意停擺 |
| **無法擴張 (Not Scalable)** | 處理量＝老闆一個人一天的體力與清醒時數 | 商品一多就塞車，好貨爛在 Drive 裡沒上架 |
| **無法交接 (Not Transferable)** | 請人也教不會，因為「怎麼判斷」說不清楚 | 請不起也留不住人，生意鎖死在創辦人身上 |

一句話：**這門生意的產能上限，等於老闆一個人的腦力與時間上限。** JBG OS 存在的理由，就是把「老闆腦中那台一直在跑的作業系統」外化成一套**真的作業系統**——可被 AI Agent 執行、可被人類審核、可被記憶累積、可被觀測。

> 對照 SSOT §0.1：JBG OS 把「一個人腦中的生意流程」外化成 `可執行 / 可審核 / 可累積 / 可觀測` 的系統。本章是這句話的「為什麼」。

---

## 1.2 要解決什麼問題 (The Problem)

把上面三個缺陷拆成可被系統攻擊的具體問題：

1. **知識蒸發 (Knowledge Evaporation)**
   每次成交、每次被客訴、每次「這型號其實不好賣」的教訓，用完即忘。經驗沒有沉澱，錯誤重複發生。
   → 對應 SSOT 的 `Memory` Context（`Memory` / `MemoryLink`）與 `memory` Agent。

2. **決策無依據 (Ungrounded Decisions)**
   估價、文案、讓價都靠「感覺」，沒有可追溯的理由與信心值，好壞無法檢討、無法改進。
   → 對應 `Price Agent`（`price`）產出的 `PriceSuggestion`（含理由、信心）、以及 `EvalRun` 的評分機制。

3. **人力瓶頸 (Human Bottleneck)**
   感知（看照片、認品牌、抽型號）、生產（寫文案）、把關（審合規/價格）全塞在同一個人身上，序列化執行，彼此搶時間。
   → 對應把工作拆成 7 個單一職責 Agent（SSOT §0.6）＋並行的 `product-lifecycle` Workflow（SSOT §0.7）。

4. **流程不可觀測 (No Observability)**
   東西卡在哪、為什麼沒上架、哪一步最慢，全憑印象，無法管理也無法優化。
   → 對應 `LoopExecution` / `LoopStep` / `AuditLog` 與 trace（SSOT §0.4 第 12 層 Observability）。

5. **治理靠自律 (Governance by Willpower)**
   「這價不能亂降」「這種貨不能上」只存在老闆的自我約束裡，換人或交給 AI 就失控。
   → 對應 `Policy` / `PolicyEngine` / `HumanReview`（SSOT §0.9）。

JBG OS 的設計，就是把這 5 個問題各自指派給一個 SSOT 已定義的機制去承接。本章只點出「必然性」，機制細節分別在 `docs/03`、`docs/07`、`docs/08` 展開。

---

## 1.3 Loop Engineering 思想：為什麼把生意寫成「迴圈」而不是「功能」

大多數軟體的世界觀是**功能 (Features)**：使用者按一個按鈕，系統做一件事，然後結束。功能是**被動的、離散的、一次性的**——它等人來觸發，做完就停。

但一門生意不是一堆按鈕，而是一條**不斷循環、會學習的流水線**：貨進來 → 判斷 → 上架 → 賣掉 → 記住 → 下次判斷得更準。這是一個**迴圈 (Loop)**，不是一組功能。

Loop Engineering 就是主張：**把生意的每一段，寫成一個有明確輸入、明確輸出、明確終止條件、且會把結果餵回記憶的迴圈**，而不是一個等人點的功能。

| 面向 | 功能思維 (Feature) | 迴圈思維 (Loop) |
|---|---|---|
| 觸發 | 人手動點 | `Automation`：cron / webhook / 事件（SSOT §0.4 第 5 層） |
| 邊界 | 做完一件事 | 有終止條件的多步驟串接（`Loop` → `LoopStep`） |
| 狀態 | 大多無狀態 | 每次執行是 `LoopExecution`，走完整狀態機（SSOT §0.11） |
| 學習 | 不學習 | 結果經 `memory` Agent 沉澱成 `Memory`，回饋下一輪 |
| 觀測 | 難追 | 每步都有 trace / cost / status（`AuditLog`） |

在 JBG OS 中，Loop Engineering 有一套**權威的 12 層堆疊**（SSOT §0.4），從最底層的 `Prompt` 一路往上疊到 `Observability`：

```
Prompt → Context → Harness → Loop → Automation → Skill
   → Connector → Sub-agent → Memory → Eval → Permission → Observability
```

這 12 層的順序即依賴順序：沒有穩定的 `Prompt` 與 `Context`，`Harness` 就不可靠；沒有 `Harness`，`Loop` 就無法安全重試；沒有 `Memory`，迴圈就不會愈跑愈準；沒有 `Permission` 與 `Observability`，你就不敢把有副作用的動作交給 AI。**功能思維只做到第 1～3 層就交差；Loop Engineering 把 12 層都當成第一等公民。**

> `SHAP-specific`：二手商品的「一件貨從照片到記憶」正好是一條天然的生命週期迴圈，所以 SHAP 的主 Workflow 直接叫 `product-lifecycle`（SSOT §0.7）。這不是巧合——生意本來就是迴圈，我們只是照實把它寫下來。

---

## 1.4 為什麼不用 ERP 思維：記錄 vs 驅動

有人會問：這不就是個進銷存 / ERP 嗎？**不是。而且方向相反。**

ERP（Enterprise Resource Planning）的世界觀是**記錄已經發生的交易**。它是一本精密的帳：這件貨進了、那筆款收了、庫存少一件了。ERP 的價值在「事後把帳記對」，它是**過去式**的。

JBG OS 的世界觀是**驅動尚未發生的決策**。它不是問「剛剛發生了什麼、幫我記下來」，而是問「**接下來該做什麼、幫我把它做掉或提議給我審**」：這張新照片是什麼、該估多少、文案怎麼寫、現在能不能發、要不要讓價。它是**未來式**的。

| 維度 | ERP（記錄型） | JBG OS（驅動型） |
|---|---|---|
| 時態 | 過去式：記已發生的交易 | 未來式：驅動尚未發生的決策 |
| 核心動作 | 登錄、對帳、報表 | 感知、推理、提議、把關、執行、沉澱 |
| 主體 | 人輸入資料，系統存 | Agent 產出主張，人審核 |
| 資料的意義 | 事實的**紀錄** | 決策的**輸入與產物** |
| 成功指標 | 帳有沒有記對 | 決策有沒有變快、變準、能不能交接 |

一句話：**ERP 幫你把「已經賺到/花掉的錢」記清楚；JBG OS 幫你把「還沒發生的那件事」做出更好、更快、可交接的決定。** JBG OS 當然也會落下交易紀錄（`Order`、`AfterSale`、`AuditLog`），但那是副產品，不是目的。目的是**驅動**，不是**記錄**。

---

## 1.5 為什麼不用 Airtable：表格思維 vs 迴圈/代理思維

第二個常見替代方案是 Airtable（或 Notion database、Google Sheets）。它們很好用，但**世界觀是「表格」**：一切都是一列一列的 row，你手動填、手動改、手動看。

表格思維的天花板，正好卡在 JBG OS 最在意的三件事上：

| JBG OS 需要的 | Airtable 表格思維 | 差在哪 |
|---|---|---|
| **Loop runtime**（自動跑完多步驟、能重試、有狀態機） | 沒有真正的執行引擎；automation 是淺層 if-this-then-that | 無法承載 `LoopExecution` 狀態機（SSOT §0.11）、無法安全重試、無法並行 `perceive` |
| **Memory**（跨執行累積、可向量召回的記憶） | 只有 row，沒有會學習的記憶層；無 embedding / 語意召回 | 無法實作 `Memory` + `Embedding`（pgvector）＋ `memory` Agent 的沉澱—召回迴圈 |
| **Agent 治理**（誰/哪個 Agent 能對哪個資源做什麼） | 只有欄位權限，沒有「動作級」授權與 Human Review 關卡 | 無法實作 `Policy` / `PolicyEngine` / `HumanReview`（SSOT §0.9） |

更根本地說：**在 Airtable 裡，商品是一列被人維護的資料；在 JBG OS 裡，商品是一個被 Agent 推著走完生命週期的主體。** 表格是「你伺候資料」，迴圈/代理是「系統替你把資料伺候好、只在關鍵處請你拍板」。

所以 JBG OS 的技術棧（SSOT §0.3）刻意選了能承載這三件事的底座：Supabase Postgres（狀態與 RLS）＋ pgvector（memory 召回）＋ Edge Functions/`pg_cron`/`pgmq`（loop runtime）＋ Anthropic Claude（Agent 推理）。這不是「加強版 Airtable」，是**另一種東西**。

---

## 1.6 為什麼不是商品資料庫：名詞 vs 動詞

第三個要撇清的是：**JBG OS 不是一個商品資料庫。**

資料庫的本質是**名詞**：它存「商品」「品牌」「價格」這些**靜態的東西**。你查得到一件商品現在長什麼樣，但資料庫本身不會讓那件商品「發生任何事」。

JBG OS 的本質是**動詞**：它讓一件商品**經歷生命週期 (undergo a lifecycle)**。同一件 `Product`，在 JBG OS 裡不是一筆躺著的紀錄，而是一個沿著 `product-lifecycle` 一路被推進的主體：

```
被抓進來(ingest) → 被看懂(perceive) → 被組成商品卡(assemble)
  → 被估價(price) → 被寫文案(compose) → 被審核(review / human-review)
  → 被發佈(publish) → 被詢問(engage) → 被賣掉(close)
  → 被售後(aftersale) → 被記住(remember)
```

（階段名一律引用 SSOT §0.7，狀態流轉見 `listing_status`：`draft → in_review → approved → published → sold → archived`。）

資料庫回答「這件商品**是**什麼」；JBG OS 回答「這件商品**正在經歷**什麼、**下一步該**發生什麼」。前者是名詞，後者是動詞。這正是「**商品管理系統**」與「**商品生命週期平台**」的分野：

- 商品**管理**系統：幫你把商品這個**名詞**存好、改好、查好。
- 商品**生命週期**平台：幫這個名詞**經歷所有動詞**，並在每個動詞之間插入 AI 感知/推理、人類把關、記憶沉澱。

> 這就是全章主張的落點：**這不是商品管理系統，而是 AI 商品生命週期平台。** JBG OS 底下當然有資料庫（Supabase Postgres），但資料庫是它的**器官**，不是它的**定義**。

---

## 1.7 Product Vision（願景聲明）

**願景聲明 (Vision Statement)：**

> JBG OS 是一套 **AI 商品生命週期作業系統**：它把「一個人腦中的生意」外化成可被 AI Agent 執行、可被人類在關鍵處把關、可被記憶持續變聰明、可被完整觀測的迴圈。讓一件商品從一張照片自己走到成交與沉澱，讓創辦人的判斷第一次變得**可複製、可擴張、可交接**。

**三年圖像 (The 3-Year Picture)：**

- **第 1 年 — 外化 (Externalize)。** `SHAP-specific`：`product-lifecycle` 的 `drive-ingest → perceive → assemble → price → compose → review → publish` 跑通，老闆從「每件親手做」變成「批次審核 AI 的提議」。商品從照片到上架的時間與人工大幅下降，好貨不再爛在 Drive。老闆的判斷開始以 `PriceSuggestion` 的理由、`Prompt` 版本、`Policy` 規則的形式**離開他的腦子、落到系統裡**。
- **第 2 年 — 變聰明 (Get Smarter)。** `Memory` 開始回饋：`memory` Agent 從成交/詢問/售後萃取事實，估價與文案愈跑愈準；`EvalRun` 讓「哪種文案好賣、哪種估價會賠」變成可量測、可迭代的指標。系統從「替老闆做」進化到「比老闆上次做得更好」。
- **第 3 年 — 可交接、可複製 (Transferable & Replicable)。** 新進員工靠系統的 `HumanReview` 佇列就能上手，因為判斷標準已寫在 `Policy` 與 `Memory` 裡，不再鎖在創辦人腦中。同時證明 JBG OS 是**OS 而非單一 app**：第二個 vertical 可以套用同一套 Loop/Agent/Memory/Permission 骨架，SHAP 只是它跑出來的第一個實例。

**成功長什麼樣 (What Success Looks Like)：**

1. 老闆的角色從「執行者」變成「審核者」——大部分時間花在 `HumanReview` 拍板，而不是逐件手做。
2. 產能不再等於老闆一個人的時間；一天能處理的商品量隨 Agent 並行與 Loop 自動化而放大。
3. 每一個決策都**有理由、有信心、有紀錄**（`PriceSuggestion` / `AgentRun` / `AuditLog`），好壞可檢討、可用 `EvalRun` 改進。
4. 經驗**留在系統裡**：換人、擴點、開第二條產品線時，判斷力可以帶著走。

**Tagline：**

> **JBG OS — 讓商品自己走完它的一生，讓判斷離開老闆的腦子。**

---

## 本章交付物 (Deliverables)

本章為後續章節確立以下**共識與詞彙**（不新增 Entity/Agent/Loop，全部沿用 SSOT）：

1. **產品定性**：JBG OS = AI **商品生命週期平台**（動詞、驅動型），而**非**商品管理系統 / ERP / Airtable / 商品資料庫。此定性是 `docs/02`～`docs/12` 判斷「一個設計是否符合產品哲學」的準繩。
2. **五大問題清單**（§1.2）：知識蒸發、決策無依據、人力瓶頸、不可觀測、治理靠自律——並各自指到 SSOT 的承接機制（`Memory`、`PriceSuggestion`/`EvalRun`、7 Agents+並行 Workflow、`LoopExecution`/`AuditLog`、`Policy`/`HumanReview`）。供 `docs/02` 逐項量化、`docs/03` 逐項落成架構。
3. **Loop vs Feature 世界觀**（§1.3）：確立「把生意寫成迴圈」的原則與 12 層堆疊的引用方式，作為 `docs/03` Loop Engineering Architecture 的思想前提。
4. **三個「不是什麼」的判準**（§1.4–1.6）：ERP（記錄 vs 驅動）、Airtable（表格 vs 迴圈/代理，缺 loop runtime/memory/agent 治理）、商品資料庫（名詞 vs 動詞）。作為技術選型（SSOT §0.3）與設計評審的反面基準。
5. **Vision / 3 年圖像 / 成功定義 / Tagline**（§1.7）：供 `docs/11` Roadmap 對齊階段目標（外化 → 變聰明 → 可交接）。

---

## 驗收條件 (Acceptance Criteria)

當以下條件全部成立，本章主張即視為「被實作滿足」：

1. **定性一致性**：`docs/02`～`docs/12` 及附錄中，凡描述 JBG OS 本質之處，用語與本章一致——稱其為「AI 商品生命週期平台 / AI Business Operating System」，不得退回稱其為「商品管理系統 / 進銷存 / ERP」。
2. **動詞性可驗證**：任一 `Product` 在系統中的狀態，可對映到 SSOT §0.7 的某個 `[stage]` 與 §0.11 的 `listing_status`（`draft → … → archived`）；不存在「只被記錄、從不被推進」的商品。
3. **五問題可追溯**：§1.2 的五個問題，各能在後續章節找到明確的承接實作（Loop/Agent/Memory/Policy/Observability），無任一問題懸空。
4. **反模式守得住**：系統設計未退化為表格維護（有真正的 `LoopExecution` runtime）、未退化為純紀錄（有 Agent 產出主張並由人審核）、未把記憶留在人腦（`Memory` 有實際寫入與召回）。
5. **可交接性可展示**：存在可交接的載體——判斷標準寫在 `Policy` / `Prompt` / `Memory`，而非僅存於創辦人腦中；新使用者可僅憑 `HumanReview` 佇列參與生產。
6. **Roadmap 對齊**：`docs/11` 的階段目標可回溯到本章「外化 → 變聰明 → 可交接」三年圖像。
