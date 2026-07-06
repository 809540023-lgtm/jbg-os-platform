# 02 · Business Analysis

> 依循 `docs/00-canonical-model.md`（SSOT）。本章拆解 `SHAP-specific` 的真實工作流程、量化痛點，並導出「為什麼非要 Loop + Agent + Memory 不可」，銜接 `docs/03`（Loop Engineering Architecture）。
> 承接 `docs/01` §1.2 的五大問題，本章把它們**落到真實流程的每一步**並量化。
> 說明：本章所有「時間 / 數量」皆為**合理假設 (assumption)**，用來凸顯瓶頸與量級，實際數字待上線後以 `LoopExecution` 觀測資料校正；凡假設處均標【假設】。

---

## 2.1 現況主流程 (The As-Is Workflow)

`SHAP-specific`：今天一件商品的真實旅程，是一條**全手工、序列化、只跑在老闆一個人身上**的鏈：

```
Google Drive（收照片）
      ↓  老闆手動開資料夾、憑記憶把照片對到「哪一件貨」
商品照片（一堆散圖）
      ↓  老闆逐張看：認品牌、抽型號、看瑕疵、心算估價
FB（上架文案）
      ↓  老闆手打標題+內文+hashtag+價格，手動發佈
詢問（客服）
      ↓  老闆在 FB/私訊逐則回、議價、約交易
成交
      ↓  老闆記出貨、收款
售後
      ↓  老闆處理退換/客訴/回購
Memory（老闆腦中的經驗）
      ↓  這次的教訓「存」進老闆腦子，下次靠他自己想起來
```

對照 SSOT §0.7 的目標流程 `product-lifecycle`：現況這條鏈的**每一格都是老闆本人**，而目標流程把它拆成 `drive-ingest → perceive → assemble → gap-check → price → compose → review → human-review → publish → engage → close → aftersale → remember`，其中大量步驟改由 Agent 執行、只在關鍵處請人審。本章先把「現況每一步的人工動作與耗時」講清楚，才能看出換成 Loop/Agent/Memory 的必然性。

### 逐步拆解：每一步的人工動作與耗時

| # | 現況步驟 | 老闆實際做的動作 | 每件耗時【假設】 | 對應 SSOT 目標階段 |
|---|---|---|---|---|
| 1 | Google Drive 收照片 | 開 Drive、找到今天新資料夾、判斷這幾張是同一件貨、命名/歸類 | 2–4 分 | `drive-ingest` |
| 2 | 看照片認貨 | 逐張看，認品牌、看款式、找吊牌、判斷成色與瑕疵 | 3–6 分 | `perceive`（`vision`+`ocr` 並行） |
| 3 | 查品牌/型號 | 對不確定的型號上網 google、翻對照表、問群組 | 3–8 分（不確定時更久） | `perceive` / `gap-check` |
| 4 | 組商品資訊 | 把品牌+型號+成色+附件+尺寸拼成一份可上架的描述 | 2–3 分 | `assemble` |
| 5 | 估價 | 心算：進價、行情、成色、急不急出、憑感覺定一個數 | 2–5 分 | `price`（→ `PriceSuggestion`） |
| 6 | 寫文案 | 手打吸睛標題、賣點內文、hashtag，套自己習慣的版型 | 5–10 分 | `compose`（→ `Listing` draft） |
| 7 | 自我把關 | 順手檢查有沒有寫錯價、圖對不對、有無違規字眼 | 1–2 分（常略過） | `review` / `human-review` |
| 8 | 上架 FB | 貼文、上圖、排版、發佈 | 2–4 分 | `publish` |
| 9 | 接詢問 | 私訊/留言逐則回、答成色、議價、約時間地點 | 每則 2–5 分，一件可能十幾則 | `engage`（→ `Inquiry`） |
| 10 | 成交 | 確認、收款、記出貨 | 3–6 分 | `close`（→ `Order`） |
| 11 | 售後 | 處理退換、客訴、回購 | 不定，客訴可耗 30 分+ | `aftersale`（→ `AfterSale`） |
| 12 | 沉澱經驗 | （多半沒做）靠腦子記「這型號好不好賣、這客人難不難搞」 | 0 分（＝沒沉澱） | `remember`（→ `Memory`） |

> 關鍵觀察：**步驟 1–8（照片→上架）是產能瓶頸的主戰場，步驟 12 幾乎不存在。** 前者決定「一天能上幾件」，後者決定「明年會不會更聰明」。現況兩頭都輸。

---

## 2.2 痛點總表 (Pain Points)

把 `docs/01` §1.2 的五大問題，落到上面每一步，展開成可攻擊的痛點清單：

| # | 現況做法 | 痛點 | 花多少時間【假設】 | 出錯代價 | JBG OS 之後如何改善 |
|---|---|---|---|---|---|
| P1 | 照片散在 Drive，靠記憶對應到商品 | 照片散亂難對應，多件混拍/同件多圖分不清；漏圖、對錯貨 | 每件 2–4 分找圖歸圖 | 上錯圖→客訴/退貨、好貨漏上架爛在 Drive | `drive` Connector 監看資料夾自動 ingest，`perceive` 用 `Embedding` 把同件照片聚在一起，`assemble` 自動成卡 |
| P2 | 品牌/型號人工查（google、翻表、問群） | 認不出就卡住，一件可耗 5–8 分甚至更久；新人完全不會 | 每件 3–8 分（不確定更久） | 認錯品牌/型號→標錯價、標錯貨、信譽損失 | `vision` Agent 出 `VisionResult`（品牌/品類/瑕疵+信心），`ocr` Agent 出 `OCRResult`（型號/序號/尺寸）；低信心才升級 `HumanReview` |
| P3 | 估價靠感覺，無依據、無紀錄 | 同款不同天不同價；賠了也不知道為什麼；無法檢討 | 每件 2–5 分 | 估太高賣不掉壓資金、估太低直接虧毛利 | `price` Agent 產 `PriceSuggestion`（價、區間、**理由**、**信心**），吃市場 `Memory`；高價/低信心 → `HumanReview`；歷史落 `PriceHistory` |
| P4 | 文案每件重打，重複勞動 | 高度重複但每次從零打；量一大就寫到爛、拖延 | 每件 5–10 分 | 文案差→曝光/轉換低、賣得慢 | `marketing` Agent 依 `Product` 自動生 `Listing` draft（標題/賣點/hashtag），套版型；首次上架進 `HumanReview` |
| P5 | 詢問人工逐則回 | 回覆慢＝流失客；重複問題重複答；漏訊息 | 每則 2–5 分，尖峰塞爆 | 回太慢→客人跑去別家、成交率掉 | `engage` 接住 `Inquiry`（MVP 半自動：AI 擬答、人確認送出）；常見問答沉澱進 `Memory` 重用 |
| P6 | 成交與售後沒系統化 | 散在私訊裡，沒有 `Order`/`AfterSale` 紀錄；退換客訴全靠記 | 成交 3–6 分、客訴 30 分+ | 漏收款、忘出貨、售後失聯、爭議無據 | `close`→`Order`、`aftersale`→`AfterSale` 結構化落庫，狀態機管流轉；異常經 `line` Connector 推播老闆 |
| P7 | 經驗只在腦中，無法沉澱與交接 | 教訓用完即忘、重複踩坑；請人教不會；老闆＝單點故障 | 「沉澱」耗時 0（＝根本沒做） | 知識蒸發、無法擴張、無法交接（`docs/01` 三缺陷） | `remember` 階段由 `memory` Agent 從成交/詢問/售後萃取 `Memory`（含 `Embedding` 語意召回），回饋 `price`/`marketing`/`engage`；判斷寫進 `Policy` |

> 這 7 個痛點，正好一對一覆蓋 `docs/01` §1.2 的五大問題：P1/P2＝人力瓶頸+不可觀測、P3＝決策無依據、P4/P5＝人力瓶頸、P6＝不可觀測+治理、P7＝知識蒸發。

---

## 2.3 量化現況 (Quantifying the Status Quo)

用 §2.1 的逐步耗時，把「一件商品從照片到上架」與「一天產能」量化出來。**以下數字皆為【假設】，目的在標出量級與瓶頸，不是精算。**

### 一件商品「照片 → 上架」平均耗時【假設】

只計 §2.1 步驟 1–8（上架前），不含後續客服/成交/售後：

```
步驟1 找圖歸圖        3 分
步驟2 看照片認貨      4 分
步驟3 查品牌/型號     5 分   ← 不確定時可爆到 15 分+
步驟4 組商品資訊      2.5 分
步驟5 估價            3 分
步驟6 寫文案          7 分   ← 第二大耗時
步驟7 自我把關        1 分
步驟8 上架 FB         3 分
────────────────────────────
單件到上架合計 ≈ 28.5 分/件【假設】（順利情況；卡型號會更久）
```

### 瓶頸在哪

| 瓶頸 | 為什麼是瓶頸 | 佔比【假設】 |
|---|---|---|
| **步驟 3 查品牌/型號** | 變異最大、最不可預測，一卡就是 5–15 分，且新人完全無法分擔 | 順利時約 18%，卡住時可佔一半 |
| **步驟 6 寫文案** | 固定高耗時、高度重複、量一大就拖延 | 約 25% |
| **序列化本身** | 所有步驟都塞在同一個人身上、只能一件接一件做，無法並行 | 結構性上限 |

**最根本的瓶頸不是任何單一步驟，而是「全部塞在一個人身上、且序列執行」。** 老闆同時是步驟 1–12 的唯一資源，感知、生產、把關互相搶時間。

### 一天能處理幾件、天花板在哪【假設】

```
假設老闆一天可投入「上架工作」的有效時間 ≈ 4 小時 = 240 分
（其餘時間被客服、成交、售後、採購、生活佔走）

上架產能 = 240 分 ÷ 28.5 分/件 ≈ 8 件/天【假設】

但這 8 件是「理論值」，實際還會被下列吃掉：
  - 步驟 9 客服插隊（尖峰時完全打斷上架節奏）
  - 步驟 3 卡型號（一件卡住，當天產能腰斬）
  - 步驟 11 客訴（一次 30 分+，直接吃掉一件的量）

→ 實務上「照片變上架」常常 3–6 件/天【假設】，且好貨積壓在 Drive。
```

**天花板 (The Ceiling)：**

> 產能上限 ≈ 老闆一天有效工時 ÷ 單件耗時。這是一個**寫死在「一個人」身上的硬上限**——請不起人（教不會，見 P2/P7）、也無法靠加班突破（人會累）。要突破，只有兩條路：**(a) 壓低單件耗時、(b) 讓步驟可並行且部分無人化。** 而這兩條路，表格/ERP 都給不了（見 `docs/01` §1.4–1.5），只有 Loop + Agent + Memory 做得到。

---

## 2.4 為什麼必然需要 Loop + Agent + Memory (The Inevitability)

從 §2.3 的天花板反推，突破口只有三個方向，而它們**剛好一一對應** SSOT 的三個機制：

**1. 為什麼需要 Agent —— 打散瓶頸、可並行、可分擔**

單件 28.5 分的瓶頸（查型號、寫文案）本質上是「感知」與「生產」工作。把它們拆給**單一職責的 Agent**（SSOT §0.6）承接：

```
現況：老闆一人序列做  [認貨]→[查型號]→[估價]→[寫文案]→[把關]  = 28.5 分/件
JBG OS：Agent 分工並行
        vision  ┐
        ocr     ┘→ 並行 perceive          （步驟2+3 由 AI 秒級完成、低信心才升級人審）
        price   → PriceSuggestion（有理由/信心）
        marketing → Listing draft（自動生文案）
        reviewer  → 自動把關
        publisher → 自動發佈
        老闆只在 human-review 拍板
```

`perceive` 用 `‖`（並行，SSOT §0.7）同時跑 `vision` + `ocr`，直接打掉「序列化」這個結構瓶頸；查型號/寫文案從「老闆的手工」變成「Agent 的輸出 + 老闆的審核」，把老闆從**執行者**變成**審核者**（呼應 `docs/01` 成功定義）。

**2. 為什麼需要 Loop —— 把 12 步串成會自己跑、可觀測、可重試的流水線**

Agent 各自很強還不夠，得有東西把它們**串起來、自動跑、卡住能等人、失敗能重試、每步可觀測**。這正是 `Loop`：

- 整條 `product-lifecycle` 是一個 `Workflow`，每個 `[stage]` 是 `Loop` / `LoopStep`（SSOT §0.7）。
- 每次跑一件貨＝一個 `LoopExecution`，走完狀態機 `queued → running → waiting_human → running → succeeded`（SSOT §0.11）——遇到 `gap-check` 缺料或 `human-review` 就 `waiting_human`，補完再續跑。
- 每步都有 `LoopStep` + `AuditLog` + trace/cost，於是「東西卡在哪、哪步最慢、一天跑了幾件」第一次**可觀測**（解 P6、解 `docs/01` §1.2 問題 4）。

沒有 Loop，Agent 只是一堆散裝功能（`docs/01` §1.3 的 Feature 思維）；有了 Loop，它們才變成一條會自己跑完的產線。

**3. 為什麼需要 Memory —— 讓迴圈愈跑愈準、把經驗留在系統而非人腦**

§2.1 步驟 12（沉澱）現況＝0，這正是「無法擴張/交接」的病根（P7）。`Memory` 補上這一格：

- `remember` 階段由 `memory` Agent 從 `Order`/`Inquiry`/`AfterSale` 萃取可重用事實 → 寫入 `Memory`（含 `Embedding`，SSOT §0.5 Memory Context）。
- 這些記憶回饋 `price`（市場行情）、`marketing`（哪種文案好賣）、`engage`（常見問答），讓下一輪估得更準、寫得更好、答得更快——**迴圈開始學習**（呼應 `docs/01` §1.3 Loop vs Feature 的「學習」欄）。
- 判斷標準寫進 `Policy`＋沉澱進 `Memory`，於是老闆的判斷**離開他的腦子、變成可交接的資產**（解 P7、達成 `docs/01` 三年圖像「可交接」）。

**三者缺一不可：**

```
只有 Agent，沒有 Loop → 一堆散功能，沒人串、沒人管、不可觀測（退回 Feature 思維）
只有 Loop，沒有 Memory → 跑得動但永遠一樣笨，不會進步（退回 ERP 的記錄型）
只有 Memory，沒有 Agent/Loop → 有筆記本，但沒人拿它去做事、去把它變準
Agent + Loop + Memory 三位一體 → 才是「AI 商品生命週期平台」（docs/01 主張）
```

這就是為什麼 JBG OS 的技術棧（SSOT §0.3）非得同時具備 Agent runtime、Loop runtime（Edge Functions/`pg_cron`/`pgmq`）與 Memory（pgvector）——三者對應本節三個必然性。**下一章 `docs/03` 就把這三個必然性落成 Loop Engineering 的 12 層架構。**

---

## 2.5 痛點 → JBG OS 解法對照表 (Pain → Solution Mapping)

把 §2.2 的 7 個痛點，對映到 SSOT 的 Agent / Loop 階段 / Memory / 治理機制（供 `docs/03`、`docs/07`、`docs/08` 逐項落實）：

| 痛點 | 對應 Loop 階段（SSOT §0.7） | 負責 Agent（§0.6） | Memory / 治理機制 | 產出 Entity |
|---|---|---|---|---|
| P1 照片散亂難對應 | `drive-ingest` → `perceive` → `assemble` | — / `vision`+`ocr` | `Embedding` 聚同件照片 | `ProductPhoto` → `Product` |
| P2 品牌/型號人工查 | `perceive` → `gap-check` | `vision`, `ocr` | 低信心 → `HumanReview` | `VisionResult`, `OCRResult` |
| P3 估價靠感覺 | `price` | `price` | 市場 `Memory`；高價/低信心 → `HumanReview` | `PriceSuggestion`, `PriceHistory` |
| P4 文案重複勞動 | `compose` | `marketing` | 首次上架 → `HumanReview`；版型記於 `Memory` | `Listing` draft |
| P5 詢問回覆慢 | `engage` | （MVP 半自動） | 常見問答沉澱 `Memory` | `Inquiry` |
| P6 成交/售後無系統 | `close` → `aftersale` | — | 狀態機 + `AuditLog`；異常經 `line` 推播 | `Order`, `AfterSale` |
| P7 經驗只在腦中 | `remember` | `memory` | 寫入 `Memory`(+`Embedding`)、回饋全鏈；判斷入 `Policy` | `Memory`, `MemoryLink` |
| （橫切）品管把關 | `review` / `human-review` | `reviewer` | `Policy` / `PolicyEngine` / `HumanReview` | `HumanReview`, `EvalRun` |
| （橫切）發佈 | `publish` | `publisher` | 受 Permission 管、`facebook` Connector | `Listing.published` |

---

## 本章交付物 (Deliverables)

1. **As-Is 流程圖與逐步耗時表**（§2.1）：把 `Google Drive → 照片 → FB → 詢問 → 成交 → 售後 → Memory` 每一步的人工動作、耗時【假設】、對應 SSOT §0.7 目標階段釘死，供 `docs/03`/`docs/08` 設計 Loop 時對照現況。
2. **7 條痛點總表**（§2.2）：現況做法 / 痛點 / 耗時 / 出錯代價 / JBG OS 改善，一對一覆蓋 `docs/01` §1.2 五大問題。
3. **現況量化基線**（§2.3）：單件到上架 ≈ 28.5 分【假設】、產能 ≈ 3–8 件/天【假設】、瓶頸＝查型號+寫文案+序列化、天花板＝綁在一個人身上。作為 `docs/11` Roadmap 成效目標的 baseline，待上線後以 `LoopExecution` 數據校正。
4. **Loop + Agent + Memory 必然性論證**（§2.4）：三者各自對應「打散瓶頸/可並行、串成可觀測產線、讓迴圈學習可交接」，直接銜接 `docs/03`。
5. **痛點 → 解法對照表**（§2.5）：每個痛點指到具體 Agent / Loop 階段 / Memory / 治理機制與產出 Entity，供後續章節逐項實作與驗收。

---

## 驗收條件 (Acceptance Criteria)

1. **流程覆蓋**：`docs/08` Workflow 定義的 `product-lifecycle` 階段，能對回本章 §2.1 的每一個現況步驟；不存在「現況有、目標流程漏掉」的步驟。
2. **痛點皆有主**：§2.2 的 P1–P7 每一條，在 `docs/07`（Agent/Permission）或 `docs/08`（Workflow）都能找到明確承接的 Agent + Loop 階段 + Memory/治理機制，無懸空痛點。
3. **基線可量測**：§2.3 的量化項目（單件耗時、日產能、瓶頸佔比）在系統上線後，能由 `LoopExecution` / `LoopStep` 的 trace 與 cost 資料實際量出並取代【假設】值。
4. **必然性成立**：`docs/03` 的架構同時落實 Agent runtime、Loop runtime、Memory 三者；缺任一者即視為未滿足 §2.4 的論證。
5. **改善可驗證**：對映表（§2.5）中每個「JBG OS 之後如何改善」，都有對應可執行的 Loop/Agent/Skill 定義（見 `docs/08` 與附錄 G/H），而非僅止於敘述。
6. **哲學一致**：本章所有解法均符合 `docs/01` 主張——把商品當作「經歷生命週期的動詞」，把老闆從執行者轉為審核者，並將經驗沉澱為可交接資產。
