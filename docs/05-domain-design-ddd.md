# 05 · Domain Design (DDD) + State Machine

> 本章把 `docs/00-canonical-model.md` §0.5 的每一個 Canonical Entity 展開成**完整的領域模型**：職責、aggregate 邊界、TypeScript 型別、invariants、domain events、狀態機。
> **合約優先**：本章所有 Entity 名稱、欄位語意、enum 值皆與 §0.5–§0.11 一致；凡本章新增的型別，都是既有 Entity 的**內部結構（Value Object / 屬性型別）**，不新增 canonical Entity。少數建議項會明確標注「**建議加入 canonical model**」，交由 §0.5 決定是否納入。
>
> 版本：v1.0 · 最後更新：2026-07-07 · 對應合約：`docs/00` v1.0

---

## 5.0 本章導讀

領域設計是 JBG OS 的**心臟**。上層（Loop runtime / Agent runtime / UI）之所以能夠「可重複套用」，正是因為底層的領域模型把「一件商品從照片到成交到記憶」的生命週期，切成一組**邊界清楚、invariant 明確、以事件驅動**的 aggregate。

本章回答四個問題：

1. **我們用哪些 DDD 戰術模式？為什麼？**（§5.1）
2. **系統切成哪幾個 Bounded Context？它們怎麼互動？**（§5.2）
3. **每個 Entity 的權威型別、不變條件、事件是什麼？**（§5.3–§5.11）
4. **哪些狀態機是全書權威？轉移的 event / guard / side-effect 是什麼？**（§5.12）

> 記法約定：本章 TypeScript 一律 `strict`、禁 `any`。所有 `Id` 型別為品牌化 UUID string（見 §5.1.6）。金額一律 `Money` value object（整數 minor unit + ISO currency），永不用 `number` 直接存錢（§0.10）。

---

## 5.1 DDD 總覽：本專案採用的戰術模式與取捨

JBG OS 是一個 **event-driven、AI-in-the-loop、human-reviewable** 的系統。DDD 給我們的最大價值不是「畫漂亮的圖」，而是：**讓 AI Agent 的輸出有明確的落點（哪個 aggregate、哪個 invariant、觸發哪個 event）**，讓 Loop runtime 有明確的驅動訊號（domain event）。

### 5.1.1 戰術模式清單與取捨

| 戰術模式 | 定義 | 在 JBG OS 的用法 | 取捨 |
|---|---|---|---|
| **Aggregate** | 一組被視為一致性邊界的 Entity + VO，只能透過 root 修改 | `Product`、`LoopExecution`、`Agent`、`Loop`、`Order`、`Memory` 等為 root | 邊界**小**優先：跨 aggregate 一律用 event + eventual consistency，不做跨 aggregate 交易 |
| **Aggregate Root** | Aggregate 的唯一入口，守護 invariant | 所有外部只能拿到 root 的 id，經 Repository 取回整個 aggregate | 禁止 UI/Agent 直接改子 Entity（如直接改 `ProductPhoto.status`），必須經 root 方法 |
| **Entity** | 有身分（id）、生命週期、可變狀態 | `ProductPhoto`、`LoopStep`、`AgentRun`、`Inquiry` 等 | Entity 不一定是 root；多數是某 root 的內部成員 |
| **Value Object (VO)** | 無身分、以值相等、不可變 | `Money`、`Price`、`Confidence`、`OcrField`、`VisionAttribute`、`SlugRef`、`TokenUsage` | 大量使用；VO 承載領域規則（如 `Money` 不可跨幣別相加） |
| **Domain Event** | 領域中「已發生」的事實，過去式命名 | `PhotoIngested`、`ProductAssembled`、`PriceSuggested`… 見 §5.11 | **這是 Loop 的燃料**：Loop 由 event 觸發，Agent 輸出寫回 aggregate 後 emit event |
| **Repository** | Aggregate 的持久化抽象（存/取整個 aggregate） | 每個 aggregate root 一個 repo interface（§5.13） | Repo 只回傳/接受 aggregate root；查詢投影走獨立 read model（CQRS-lite） |
| **Domain Service** | 不屬於任何單一 aggregate 的領域邏輯 | `PricingPolicyService`、`GapCheckService`、`PolicyEngine`、`MemoryRecallService` | 只在「邏輯橫跨多 aggregate 或需要外部知識」時才用，避免貧血 |
| **Factory** | 複雜 aggregate 的建構 | `Product.assembleFrom(ocr, vision)`、`LoopExecution.start(loop, trigger)` | 以 static factory method 放在 root 上，而非獨立 class |

### 5.1.2 我們**刻意不做**的事（取捨聲明）

- **不做跨 aggregate 的 DB transaction。** 例如「發佈 Listing 並關閉 Task」不在同一交易；`ListingPublished` event 觸發後續。理由：AI 步驟慢、可能 `waiting_human`，長交易不可行。
- **不做 event sourcing（MVP）。** 我們用**狀態存儲 + domain event 發佈（outbox pattern）**。aggregate 的當前狀態直接存 Postgres row；event 寫進 `domain_events` outbox 供 Loop runtime 消費。未來若需回放可升級，但不在 MVP。
- **不追求純粹的六角形。** Repository 與 event bus 是唯一強制抽象；Connector 層（Drive/FB/LINE）已是天然的 anti-corruption layer（§0.8），不再疊多層。
- **貧血模型是被禁止的。** invariant 必須在 aggregate 方法內守護，不能散落在 service / route handler。Reviewer Agent 檢查的是「商品卡完整性」，不是替代 aggregate invariant。

### 5.1.3 Aggregate 一致性邊界一覽（誰守誰）

```
Aggregate Roots（一致性邊界 = 虛線框）
┌────────────────────────────────────────────────────────────────┐
│ Product (root)                                                   │
│   ├─ ProductPhoto[]        (child entity)                        │
│   ├─ Price                 (VO, current)                         │
│   ├─ PriceHistory[]        (child entity, append-only)           │
│   └─ assembly/listing 生命週期狀態                                │
└────────────────────────────────────────────────────────────────┘
┌──────────────────────────┐  ┌──────────────────────────────────┐
│ LoopExecution (root)      │  │ Loop (root, 定義)                 │
│   └─ LoopStep[]           │  │   └─ StepDef[] (VO)               │
└──────────────────────────┘  └──────────────────────────────────┘
┌──────────────────────────┐  ┌──────────────────────────────────┐
│ Agent (root, 定義)        │  │ AgentRun (root, 執行)             │
│   ├─ skill refs           │  │   ├─ ContextSnapshot (child)     │
│   └─ io schema (VO)       │  │   ├─ TokenUsage (VO)             │
└──────────────────────────┘  │   └─ trace ref                    │
                              └──────────────────────────────────┘
┌──────────────────────────┐  ┌──────────────────────────────────┐
│ Listing (root)            │  │ Order (root)                      │
│   └─ status 生命週期       │  │   ├─ line snapshot (VO)          │
│                          │  │   └─ AfterSale[] (child)         │
└──────────────────────────┘  └──────────────────────────────────┘
┌──────────────────────────┐  ┌──────────────────────────────────┐
│ Memory (root)             │  │ HumanReview (root)                │
│   ├─ Embedding (VO ref)   │  │   └─ decision (VO)               │
│   └─ MemoryLink[] (child) │  └──────────────────────────────────┘
└──────────────────────────┘
獨立 root：Inquiry、Task、Workflow、Connector、Policy、AuditLog、EvalRun、
          PriceSuggestion、OCRResult、VisionResult、Actor、Brand、Category
```

> **設計原則：Perception 結果（OCRResult/VisionResult）是獨立 aggregate，不塞進 Product。** 理由：它們由不同 Agent 非同步產生、可重跑、可被多個消費者引用；Product 只持有「已採納的抽取值」快照。這是「事實（perception）」與「主張（product card）」分離的具體落地。

### 5.1.4 一致性策略：aggregate 內強一致 / aggregate 間最終一致

| 場景 | 一致性 | 機制 |
|---|---|---|
| `Product` 加照片 + 更新 assembly 狀態 | 強一致（同交易） | aggregate 方法 + repo.save |
| `PriceSuggested` → `Product` 採納定價 | 最終一致 | event → `PricingPolicyService` → `Product.applyPrice()` |
| `ListingPublished` → 關閉補件 `Task` | 最終一致 | event → handler |
| `OrderClosed` → `Listing` 標記 sold | 最終一致 | event → `Listing.markSold()` |

### 5.1.5 Ubiquitous Language（統一語彙，與 §0.4 對齊）

- **assemble**：把多張照片的 OCR+Vision 合併成一張 Product 商品卡。
- **compose**：Marketing Agent 依 Product 產出 Listing 文案草稿。
- **suggest**：Agent 產生「主張」（PriceSuggestion / draft），**尚未生效**。
- **apply / adopt**：把主張寫回 aggregate 使其生效（受 Policy / HR 管）。
- **publish**：把 approved Listing 送上外部通路（副作用，必經 Connector）。
- **remember**：Memory Agent 把事件萃取成 Memory。

### 5.1.6 共用型別（本章全域引用）

```typescript
// packages/domain/shared/types.ts

/** 品牌化 UUID：避免把 ProductId 誤傳給 OrderId */
type Brand<T, B extends string> = T & { readonly __brand: B };
type Uuid = string;

export type ProductId        = Brand<Uuid, 'ProductId'>;
export type ProductPhotoId   = Brand<Uuid, 'ProductPhotoId'>;
export type BrandId          = Brand<Uuid, 'BrandId'>;
export type CategoryId       = Brand<Uuid, 'CategoryId'>;
export type PriceHistoryId   = Brand<Uuid, 'PriceHistoryId'>;
export type PriceSuggestionId= Brand<Uuid, 'PriceSuggestionId'>;
export type OcrResultId      = Brand<Uuid, 'OcrResultId'>;
export type VisionResultId   = Brand<Uuid, 'VisionResultId'>;
export type EmbeddingId      = Brand<Uuid, 'EmbeddingId'>;
export type LoopId           = Brand<Uuid, 'LoopId'>;
export type LoopExecutionId  = Brand<Uuid, 'LoopExecutionId'>;
export type LoopStepId       = Brand<Uuid, 'LoopStepId'>;
export type WorkflowId       = Brand<Uuid, 'WorkflowId'>;
export type TaskId           = Brand<Uuid, 'TaskId'>;
export type AgentId          = Brand<Uuid, 'AgentId'>;
export type AgentRunId       = Brand<Uuid, 'AgentRunId'>;
export type SkillId          = Brand<Uuid, 'SkillId'>;
export type PromptId         = Brand<Uuid, 'PromptId'>;
export type ContextSnapshotId= Brand<Uuid, 'ContextSnapshotId'>;
export type MemoryId         = Brand<Uuid, 'MemoryId'>;
export type MemoryLinkId     = Brand<Uuid, 'MemoryLinkId'>;
export type ConnectorId      = Brand<Uuid, 'ConnectorId'>;
export type ListingId        = Brand<Uuid, 'ListingId'>;
export type InquiryId        = Brand<Uuid, 'InquiryId'>;
export type OrderId          = Brand<Uuid, 'OrderId'>;
export type AfterSaleId      = Brand<Uuid, 'AfterSaleId'>;
export type HumanReviewId    = Brand<Uuid, 'HumanReviewId'>;
export type PolicyId         = Brand<Uuid, 'PolicyId'>;
export type AuditLogId       = Brand<Uuid, 'AuditLogId'>;
export type EvalRunId        = Brand<Uuid, 'EvalRunId'>;
export type ActorId          = Brand<Uuid, 'ActorId'>;

export type IsoDateTime = Brand<string, 'IsoDateTime'>;  // RFC3339 UTC
export type Slug        = Brand<string, 'Slug'>;          // kebab-case

/** Money：整數 minor unit + ISO 4217；不可跨幣別運算（§0.10 禁 float 存錢） */
export interface Money {
  readonly amount: number;      // 整數，最小貨幣單位（TWD = 元；JPY = 円）
  readonly currency: string;    // ISO 4217, e.g. 'TWD','JPY','USD'
}

/** Confidence：0..1 的信心分數，AI 輸出通用 */
export type Confidence = Brand<number, 'Confidence'>;  // 0.0 – 1.0

/** 每個 aggregate root 共用的稽核欄位 */
export interface AuditFields {
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  readonly createdBy: ActorId;   // human | agent | system actor
}

/** Domain event 基底 */
export interface DomainEvent<TName extends string, TPayload> {
  readonly eventId: Uuid;
  readonly name: TName;
  readonly occurredAt: IsoDateTime;
  readonly actorId: ActorId;
  readonly payload: TPayload;
  /** 觸發此事件的 LoopExecution（若有），供 trace 串聯 */
  readonly loopExecutionId?: LoopExecutionId;
}
```

---

## 5.2 Bounded Contexts（8 個）與 Context Map

依 §0.5，系統切成 8 個 Bounded Context。每個 context 是一個 `packages/domain/<context>` 套件，內部各自的 ubiquitous language 與 model 不外洩；context 之間**只透過 domain event 與明確的 published contract（id + VO）**溝通。

### 5.2.1 各 Context 職責與 Entity

| Context | 職責（單句） | 內含 Entity（§0.5） | 對外主要 event |
|---|---|---|---|
| **Catalog** | 商品目錄：把照片組裝成商品卡並管理其生命週期 | `Product`(root), `ProductPhoto`, `Brand`, `Category` | `PhotoIngested`, `ProductAssembled`, `ProductGapDetected` |
| **Pricing** | 定價：產生/採納售價與其歷史 | `Price`(VO), `PriceHistory`, `PriceSuggestion` | `PriceSuggested`, `PriceApplied` |
| **Perception** | AI 感知：從照片抽取事實（文字/視覺/向量） | `OCRResult`, `VisionResult`, `Embedding` | `OcrExtracted`, `VisionAnalyzed`, `EmbeddingIndexed` |
| **Loop** | 自動化核心：Loop 定義、執行、步驟、業務流程、工作單 | `Loop`, `LoopExecution`, `LoopStep`, `Workflow`, `Task` | `LoopExecutionStarted/Succeeded/Failed`, `TaskOpened/Closed` |
| **Agent** | AI 執行單元：Agent 定義、執行、技能、prompt、context 快照 | `Agent`, `AgentRun`, `Skill`, `Prompt`, `ContextSnapshot` | `AgentRunStarted/Completed/Failed` |
| **Memory** | 記憶：跨執行事實與其關聯 | `Memory`, `MemoryLink` | `MemoryLearned`, `MemoryLinked` |
| **Channel** | 外部通路：連線、刊登、詢問、成交、售後 | `Connector`, `Listing`, `Inquiry`, `Order`, `AfterSale` | `ListingComposed/Published`, `InquiryReceived`, `OrderClosed`, `AfterSaleOpened` |
| **Governance** | 治理：人審、權限、稽核、評測、行動者 | `HumanReview`, `Policy`, `AuditLog`, `EvalRun`, `Actor` | `ReviewRequested`, `ReviewPassed/Rejected`, `PolicyDenied`, `EvalScored` |

### 5.2.2 Context Map（關係圖）

```
                         ┌──────────────────────────────┐
                         │        Governance             │
                         │ Actor · Policy · HumanReview   │
                         │ AuditLog · EvalRun            │
                         └───────▲───────────▲──────────┘
              (Conformist:        │ 全 context │  (審核/權限/稽核
               所有副作用受         │           │   橫切所有 context)
               Policy/HR 管)       │           │
        ┌────────────────┐   ┌────┴─────┐   ┌─┴────────────┐
        │   Perception   │   │   Loop   │◄──┤    Agent      │
        │ OCR/Vision/Emb │   │ LX/Step/ │   │ Agent/Run/    │
        │                │   │ Workflow │──►│ Skill/Prompt  │
        └───────▲────────┘   │ /Task    │   │ /CtxSnapshot  │
   (upstream:   │            └──┬────┬───┘   └───────┬───────┘
    供給事實)    │  publishes    │    │ orchestrates  │ writes
        ┌───────┴────────┐  events│    │              ▼
        │    Catalog     │◄───────┘    │        ┌──────────┐
        │ Product/Photo  │─── events ──┼───────►│  Memory  │
        │ Brand/Category │             │        │ Mem/Link │
        └───────┬────────┘             │        └──────────┘
     (Customer/ │ Product 快照           │
      Supplier) ▼                       ▼
        ┌────────────────┐        ┌──────────────┐
        │    Pricing     │        │   Channel    │
        │ Price/History/ │        │ Connector/   │
        │ Suggestion     │◄──────►│ Listing/     │
        └────────────────┘ Product │ Inquiry/     │
                            id 共享  │ Order/After  │
                                    └──────────────┘

關係圖例：
  ─── events ──►   : 上游發佈 domain event，下游訂閱（Publish/Subscribe）
  Customer/Supplier: 下游依賴上游契約（Catalog 是 Pricing/Channel 的 upstream）
  Conformist       : 下游完全服從上游/橫切規則（Governance 對所有 context）
  Loop 為 orchestrator：本身不含業務規則，只依 Loop 定義呼叫各 context 的 Agent/Skill
```

### 5.2.3 Context 間整合契約（誰依賴誰的什麼）

| 上游 | 下游 | 契約（下游可見的） | 整合模式 |
|---|---|---|---|
| Catalog | Pricing | `ProductId` + Product 快照（brand/category/condition） | Customer/Supplier |
| Catalog | Channel | `ProductId` + Product 快照（title/photos/price） | Customer/Supplier |
| Perception | Catalog | `OcrResultId`/`VisionResultId` + 採納值 VO | Published Language |
| Agent | Loop | `AgentRunId` + output payload（schema 化） | Partnership |
| Loop | 全部 | domain event（觸發各 context 動作） | Orchestrator |
| Governance | 全部 | `Policy` 判定 + `HumanReview` 決策 + `AuditLog` 寫入 | Conformist（橫切） |

> **反腐層落點**：外部世界（Drive/FB/LINE）→ `Connector`（§0.8）→ Channel context。外部資料**永不**直接進入 Catalog；必經 Perception（照片）或 Channel（互動）翻譯成領域 VO。

---

## 5.3 Catalog Context — Entity 完整定義

### 5.3.1 `Product`（Aggregate Root — 本書最核心）

**職責**：代表「一件待售/已售商品」的完整商品卡；守護「一張商品卡從 draft 到 archived」的生命週期與完整性 invariant。是 photos / price / listing 生命週期的**一致性邊界**。

**Aggregate root？** 是。子成員：`ProductPhoto[]`、`Price`(current VO)、`PriceHistory[]`。

```typescript
// packages/domain/catalog/product.ts
import { ProductId, BrandId, CategoryId, Money, Confidence,
         AuditFields, OcrResultId, VisionResultId, Slug } from '../shared/types';
import { ProductPhoto } from './product-photo';
import { Price, PriceHistory } from '../pricing/price';

/** 與 §0.11 listing_status 對齊：商品卡生命週期 = Product/Listing 共用主軸 */
export type ProductStatus =
  | 'draft'        // 剛 assemble，資料未齊
  | 'in_review'    // 送審中（Reviewer Agent 或 HumanReview）
  | 'approved'     // 審核通過，可上架
  | 'published'    // 已在通路刊登
  | 'sold'         // 已成交
  | 'archived';    // 下架/歸檔（終態）

export type ProductCondition =
  | 'new' | 'like_new' | 'good' | 'fair' | 'poor';

/** 已「採納」的抽取屬性快照（來源指向 Perception aggregate，可回溯） */
export interface AdoptedAttribute {
  readonly key: string;              // e.g. 'model_no','size','material'
  readonly value: string;
  readonly confidence: Confidence;
  readonly sourceOcr?: OcrResultId;
  readonly sourceVision?: VisionResultId;
}

export interface Product extends AuditFields {
  readonly id: ProductId;
  readonly sku: Slug;                // 內部唯一料號（kebab）
  status: ProductStatus;

  // 商品卡內容
  title: string | null;
  description: string | null;
  brandId: BrandId | null;
  categoryId: CategoryId | null;
  condition: ProductCondition | null;
  attributes: AdoptedAttribute[];    // 從 OCR/Vision 採納的結構化屬性

  // 生命週期關聯
  photos: ProductPhoto[];            // child entity（≥1 才可離開 draft）
  currentPrice: Price | null;        // VO（採納後才有）
  priceHistory: PriceHistory[];      // append-only child

  // gap-check 用：缺哪些必填欄位
  missingFields: string[];           // e.g. ['brand','price']；empty ⇒ 資料齊

  // 追溯
  primaryPhotoId: ProductPhoto['id'] | null;
  soldOrderId: string | null;        // OrderId（sold 後回填，避免循環 import）
}
```

**Invariants（不變條件，由 root 方法守護）**：

- `INV-P1`：`status` 只能沿 §5.12.2 狀態機合法轉移；非法轉移拋 `IllegalProductTransition`。
- `INV-P2`：離開 `draft`（進 `in_review`）前，`photos.length >= 1` 且 `missingFields` 不含硬性必填（`title`,`brandId`,`categoryId`,`condition`）。
- `INV-P3`：進入 `approved` 前必須 `currentPrice !== null`。
- `INV-P4`：`priceHistory` **append-only**；每次 `applyPrice` 追加一筆並更新 `currentPrice`，不得刪改歷史。
- `INV-P5`：`primaryPhotoId` 若非 null，必存在於 `photos`。
- `INV-P6`：`sold` 時 `soldOrderId !== null`；`archived` 為終態，不可再轉出。
- `INV-P7`：`currentPrice.currency` 全生命週期一致（不可中途換幣別）。

**關鍵方法（factory + 生命週期）**：

```typescript
export class ProductAggregate {
  static assembleFrom(input: AssembleInput): { product: Product; events: DomainEvent[] };
  addPhoto(photo: ProductPhoto): DomainEvent;          // PhotoAttached
  adoptAttributes(attrs: AdoptedAttribute[]): void;    // 更新 attributes/missingFields
  submitForReview(): DomainEvent;                      // draft→in_review (檢 INV-P2)
  approve(by: ActorId): DomainEvent;                   // in_review→approved (檢 INV-P3)
  applyPrice(price: Price, reason: string): DomainEvent; // 追加 PriceHistory
  markPublished(listingId: ListingId): DomainEvent;    // approved→published
  markSold(orderId: OrderId): DomainEvent;             // published→sold
  archive(reason: string): DomainEvent;                // *→archived
}
```

**關鍵 domain events**：`ProductAssembled`、`ProductGapDetected`、`PriceApplied`、`ProductApproved`、`ListingPublished`（跨 context）、`ProductSold`、`ProductArchived`。

### 5.3.2 `ProductPhoto`（Entity，屬 Product aggregate）

**職責**：一張源自 Drive 的商品照片；持有其在 Storage 的位址與感知結果的引用。

**Aggregate root？** 否，屬 `Product`。（例外：ingest 階段照片尚未 assemble 成 Product 時，暫存為「孤兒照片」，見 INV-PP3。）

```typescript
// packages/domain/catalog/product-photo.ts
export type PhotoStatus =
  | 'ingested'     // 已從 Drive 抓入、存 Storage
  | 'perceiving'   // OCR/Vision 進行中
  | 'perceived'    // 感知完成
  | 'attached'     // 已掛到某 Product
  | 'rejected';    // 模糊/重複/非商品，棄用

export interface ProductPhoto extends AuditFields {
  readonly id: ProductPhotoId;
  productId: ProductId | null;       // 未 assemble 前為 null（孤兒）
  status: PhotoStatus;

  // 來源與儲存
  readonly driveFileId: string;      // Google Drive file id（冪等鍵之一）
  readonly driveFolderId: string;
  storagePath: string;               // Supabase Storage path
  readonly contentHash: string;      // sha256，去重用
  width: number | null;
  height: number | null;

  // 感知結果引用（1:1，屬 Perception aggregate）
  ocrResultId: OcrResultId | null;
  visionResultId: VisionResultId | null;

  isPrimary: boolean;
}
```

**Invariants**：
- `INV-PP1`：`(driveFileId)` 或 `(contentHash)` 全域唯一 → **ingest 冪等**，同一 Drive 檔案不重複建立。
- `INV-PP2`：進入 `perceived` 前 `ocrResultId` 與 `visionResultId` 皆非 null（或明確標記 skip）。
- `INV-PP3`：`status='attached'` ⇔ `productId !== null`。
- `INV-PP4`：一個 Product 至多一張 `isPrimary=true`。

**events**：`PhotoIngested`、`PhotoPerceived`、`PhotoAttached`、`PhotoRejected`。

### 5.3.3 `Brand`（Entity / 參照資料）

**職責**：品牌主檔（Chanel/Nike…），供 Product 歸類與 Pricing 參考。**Aggregate root？** 是（小 aggregate，多為讀）。

```typescript
export interface Brand extends AuditFields {
  readonly id: BrandId;
  readonly slug: Slug;               // 'chanel'
  displayName: string;               // 'Chanel'
  aliases: string[];                 // ['CHANEL','香奈兒'] — Vision 對映用
  tier: 'luxury' | 'premium' | 'mass' | 'unknown';
  isActive: boolean;
}
```
**Invariants**：`slug` 全域唯一；`aliases` 去重、不與其他 brand 衝突。
**events**：`BrandRegistered`、`BrandAliasAdded`。

### 5.3.4 `Category`（Entity / 參照資料）

**職責**：品類主檔（包/鞋/家電…），可階層。**Aggregate root？** 是。

```typescript
export interface Category extends AuditFields {
  readonly id: CategoryId;
  readonly slug: Slug;               // 'handbag'
  displayName: string;
  parentId: CategoryId | null;       // 階層
  /** 該品類的必填屬性（驅動 gap-check） */
  requiredAttributes: string[];      // e.g. ['size','material'] for shoes
}
```
**Invariants**：`slug` 唯一；`parentId` 不可成環。
**events**：`CategoryRegistered`。

---

## 5.4 Pricing Context — Entity 完整定義

### 5.4.1 `Price`（Value Object，掛在 Product 上）

**職責**：Product 的當前定價，是**不可變 VO**（改價 = 產生新 Price + 追加 PriceHistory）。**Aggregate root？** 否（VO）。

```typescript
// packages/domain/pricing/price.ts
export interface Price {
  readonly listing: Money;           // 標售價
  readonly floor: Money | null;      // 底價（可議下限）
  readonly currency: string;         // = listing.currency（冗餘便利）
  readonly setAt: IsoDateTime;
  readonly source: 'agent' | 'human' | 'rule';
}
```
**Invariants**：`floor <= listing`（同幣別）；`amount > 0`。作為 VO 以值相等，無 id。

### 5.4.2 `PriceHistory`（Entity，屬 Product aggregate，append-only）

**職責**：一筆定價變更的歷史紀錄，永不刪改。

```typescript
export interface PriceHistory extends AuditFields {
  readonly id: PriceHistoryId;
  readonly productId: ProductId;
  readonly price: Price;             // 該次生效的定價快照
  readonly reason: string;           // 'initial suggestion','markdown -10%'…
  readonly suggestionId: PriceSuggestionId | null; // 來源建議（若有）
  readonly effectiveFrom: IsoDateTime;
}
```
**Invariants**：`INV-PH1` immutable；`INV-PH2` 每個 Product 的 history 依 `effectiveFrom` 單調遞增。
**events**：`PriceApplied`。

### 5.4.3 `PriceSuggestion`（Aggregate Root）

**職責**：Price Agent 的一次「主張」——建議售價、區間、理由、信心。**尚未生效**（採納才進 PriceHistory）。**Aggregate root？** 是（獨立於 Product，可被審核/駁回）。

```typescript
export type PriceSuggestionStatus =
  | 'proposed'     // Agent 已產出
  | 'accepted'     // 已被採納 → applyPrice
  | 'rejected'     // 人審/policy 駁回
  | 'superseded';  // 被更新的建議取代

export interface PriceSuggestion extends AuditFields {
  readonly id: PriceSuggestionId;
  readonly productId: ProductId;
  readonly agentRunId: AgentRunId;   // 產生它的 AgentRun（trace）
  status: PriceSuggestionStatus;

  suggested: Money;
  range: { readonly low: Money; readonly high: Money };
  confidence: Confidence;
  rationale: string;                 // 人類可讀理由
  comparables: Array<{ source: string; price: Money; note: string }>;

  requiresHumanReview: boolean;      // 由 PricingPolicyService 判定
  humanReviewId: HumanReviewId | null;
}
```
**Invariants**：`INV-PS1` `range.low <= suggested <= range.high`（同幣別）；`INV-PS2` `accepted` 前若 `requiresHumanReview` 則 `humanReviewId` 對應之 HR 必為 `approved`。
**events**：`PriceSuggested`、`PriceSuggestionAccepted`、`PriceSuggestionRejected`。

> **Domain Service：`PricingPolicyService`** — 決定一筆 `PriceSuggestion` 是否 `requiresHumanReview`（依 §0.9：高價或低信心 → 需 HR）。橫跨 Pricing 與 Governance，故為 service 而非 aggregate 方法。

---

## 5.5 Perception Context — Entity 完整定義

> Perception 產出**事實**（facts），是 upstream。三者皆獨立 aggregate，可重跑、被多方引用。

### 5.5.1 `OCRResult`（Aggregate Root）

**職責**：一張照片的文字抽取結果（吊牌/型號/序號/尺寸/成分）。**Aggregate root？** 是。

```typescript
// packages/domain/perception/ocr-result.ts
export interface OcrField {
  readonly key: string;              // 'model_no','serial','size','material'
  readonly value: string;
  readonly confidence: Confidence;
  readonly bbox?: [number, number, number, number]; // 可選：座標
}

export interface OCRResult extends AuditFields {
  readonly id: OcrResultId;
  readonly productPhotoId: ProductPhotoId;
  readonly agentRunId: AgentRunId;   // 產生它的 OCR Agent run
  readonly engine: string;           // OCR provider id（§0.7）
  rawText: string;                   // 全文
  fields: OcrField[];                // 結構化抽取
  language: string | null;           // 'ja','zh','en'
  overallConfidence: Confidence;
}
```
**Invariants**：`INV-OCR1` immutable 一經寫入（重跑 = 產生新 id）；`INV-OCR2` `fields[].confidence ∈ [0,1]`。
**events**：`OcrExtracted`。

### 5.5.2 `VisionResult`（Aggregate Root）

**職責**：一張照片的視覺理解（品牌、品類、顏色、瑕疵、附件、可信度）。**Aggregate root？** 是。

```typescript
export interface VisionAttribute {
  readonly key: string;              // 'brand','category','color','defect','accessory'
  readonly value: string;
  readonly confidence: Confidence;
}
export interface VisionDefect {
  readonly kind: string;             // 'scratch','stain','wear'
  readonly severity: 'minor' | 'moderate' | 'severe';
  readonly confidence: Confidence;
}

export interface VisionResult extends AuditFields {
  readonly id: VisionResultId;
  readonly productPhotoId: ProductPhotoId;
  readonly agentRunId: AgentRunId;   // Vision Agent run
  readonly model: string;            // MODELS.VISION 指向的 id（§0.3）
  attributes: VisionAttribute[];
  defects: VisionDefect[];
  brandGuess: { brandId: BrandId | null; label: string; confidence: Confidence } | null;
  categoryGuess: { categoryId: CategoryId | null; label: string; confidence: Confidence } | null;
  overallConfidence: Confidence;
  needsEscalation: boolean;          // 低信心 → 升級 HR/補件（§0.6）
}
```
**Invariants**：`INV-VR1` immutable；`INV-VR2` `needsEscalation = overallConfidence < threshold`（threshold 由 Policy 定）。
**events**：`VisionAnalyzed`、`VisionLowConfidence`。

### 5.5.3 `Embedding`（Aggregate Root，polymorphic）

**職責**：某實體的向量（文字或圖），存 pgvector，供 Memory recall 與相似商品比對。**Aggregate root？** 是（輕量）。

```typescript
export type EmbeddingOwnerType = 'product' | 'memory' | 'product_photo';

export interface Embedding extends AuditFields {
  readonly id: EmbeddingId;
  readonly ownerType: EmbeddingOwnerType;   // polymorphic（§0.5）
  readonly ownerId: string;                 // ProductId|MemoryId|ProductPhotoId
  readonly modelId: string;                 // embedding provider（§0.3，可換）
  readonly dim: number;                     // 向量維度
  vector: number[];                         // 存 pgvector
  readonly sourceText: string;              // 被嵌入的原文（可回放）
}
```
**Invariants**：`INV-E1` `(ownerType,ownerId,modelId)` 唯一（同 owner 同模型只留最新）；`INV-E2` `vector.length === dim`。
**events**：`EmbeddingIndexed`。

---

## 5.6 Loop Context — Entity 完整定義（自動化核心）

### 5.6.1 `Loop`（Aggregate Root — 定義）

**職責**：一個 Loop 的**定義**：步驟圖、觸發方式、終止條件。是「模板」，不含執行狀態。**Aggregate root？** 是。

```typescript
// packages/domain/loop/loop.ts
export type StepKind = 'agent' | 'skill' | 'connector' | 'human_review' | 'branch';

export interface StepDef {                 // VO
  readonly key: Slug;                      // step 代號，e.g. 'perceive'
  readonly kind: StepKind;
  readonly ref: string;                    // agentCode|skillId|connectorId
  readonly parallelGroup: string | null;   // 同組並行（§0.7 的 ‖）
  readonly onSuccess: Slug | null;         // 下一步 key
  readonly onFailure: Slug | null;         // 失敗跳轉（含回退邊）
  readonly guard: string | null;           // guard 表達式（見 §5.12）
}

export type LoopTrigger =
  | { readonly kind: 'cron'; readonly expr: string }
  | { readonly kind: 'webhook'; readonly source: string }
  | { readonly kind: 'event'; readonly eventName: string }
  | { readonly kind: 'manual' };

export interface Loop extends AuditFields {
  readonly id: LoopId;
  readonly code: Slug;                     // 'product-lifecycle','drive-ingest'（§0.10）
  version: number;                         // 定義版本
  displayName: string;
  steps: StepDef[];
  entryStep: Slug;
  triggers: LoopTrigger[];
  terminationRule: string;                 // 終止條件表達式
  isActive: boolean;
}
```
**Invariants**：`INV-L1` `(code,version)` 唯一；`INV-L2` `entryStep` 與所有 `onSuccess/onFailure` 皆指向存在的 step key（DAG 完整性）；`INV-L3` 定義一經有 LX 引用即 immutable（改版 = version+1）。
**events**：`LoopDefined`、`LoopVersionPublished`、`LoopDeactivated`。

### 5.6.2 `LoopExecution`（LX）（Aggregate Root — 執行實例）

**職責**：Loop 的一次執行實例，是**核心狀態機**（§0.11 / §5.12.1）。**Aggregate root？** 是。子成員：`LoopStep[]`。

```typescript
export type LoopExecutionStatus =
  | 'queued' | 'running' | 'waiting_human'
  | 'succeeded' | 'failed' | 'cancelled';  // 與 §0.11 一致

export interface LoopExecution extends AuditFields {
  readonly id: LoopExecutionId;
  readonly loopId: LoopId;
  readonly loopVersion: number;            // 鎖定執行當下的定義版本
  status: LoopExecutionStatus;

  readonly trigger: LoopTrigger;
  readonly rootActorId: ActorId;
  input: Record<string, unknown>;          // 觸發輸入（e.g. { productId })
  output: Record<string, unknown> | null;  // 終態輸出

  steps: LoopStep[];                        // child entities（有序）
  currentStepKey: Slug | null;
  pendingReviewId: HumanReviewId | null;    // waiting_human 時指向 HR

  startedAt: IsoDateTime | null;
  finishedAt: IsoDateTime | null;
  error: { code: string; message: string } | null;
  attempt: number;                          // 重試計數
  readonly workflowId: WorkflowId | null;   // 若隸屬某 Workflow
}
```
**Invariants**：`INV-LX1` 狀態轉移必依 §5.12.1；`INV-LX2` `waiting_human ⇔ pendingReviewId !== null`；`INV-LX3` 終態（succeeded/failed/cancelled）後不可再轉移，`finishedAt` 必填；`INV-LX4` `steps` 的順序與 Loop 定義的路徑一致。
**events**：`LoopExecutionStarted`、`LoopExecutionPausedForHuman`、`LoopExecutionResumed`、`LoopExecutionSucceeded`、`LoopExecutionFailed`、`LoopExecutionCancelled`。

### 5.6.3 `LoopStep`（Entity，屬 LX aggregate）

**職責**：LX 中的一步，對應一次 Agent/Skill/Connector/HR 呼叫。

```typescript
export type LoopStepStatus =
  | 'pending' | 'running' | 'waiting_human'
  | 'succeeded' | 'failed' | 'skipped';

export interface LoopStep extends AuditFields {
  readonly id: LoopStepId;
  readonly loopExecutionId: LoopExecutionId;
  readonly stepKey: Slug;                  // 對應 Loop.steps[].key
  readonly kind: StepKind;
  status: LoopStepStatus;
  agentRunId: AgentRunId | null;           // kind='agent' 時
  humanReviewId: HumanReviewId | null;     // kind='human_review' 時
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  startedAt: IsoDateTime | null;
  finishedAt: IsoDateTime | null;
  error: { code: string; message: string } | null;
}
```
**Invariants**：`INV-STP1` step 終態後不可改；`INV-STP2` `kind='agent' ⇒ 完成時 agentRunId !== null`。
**events**：`LoopStepStarted`、`LoopStepCompleted`、`LoopStepFailed`。

### 5.6.4 `Workflow`（Aggregate Root）

**職責**：多個 Loop 組成的更大業務流程（SHAP 的 `product-lifecycle` 主流程，§0.7）。**Aggregate root？** 是。`SHAP-specific` 的 `product-lifecycle` 是 Workflow 的一個實例定義。

```typescript
export interface WorkflowStageDef {         // VO
  readonly stageKey: Slug;                  // 'perceive','assemble','price'…（§0.7）
  readonly loopCode: Slug;                  // 該 stage 對應的 Loop
  readonly next: Slug[];                    // 後續 stage（可分支）
  readonly onReject: Slug | null;           // 回退邊（§0.7 reject→assemble/compose）
}

export interface Workflow extends AuditFields {
  readonly id: WorkflowId;
  readonly code: Slug;                      // 'product-lifecycle'
  version: number;
  displayName: string;
  stages: WorkflowStageDef[];
  entryStage: Slug;
  isActive: boolean;
}
```
**Invariants**：`INV-WF1` `(code,version)` 唯一；`INV-WF2` stage 圖連通、回退邊指向存在的 stage。
**events**：`WorkflowDefined`、`WorkflowInstanceStarted`。

### 5.6.5 `Task`（Aggregate Root）

**職責**：需要被處理的工作單（補件、覆核、跟進），可指派給 Agent 或人；可 spawn `LoopExecution` / `HumanReview`。**Aggregate root？** 是。狀態機見 §5.12.4。

```typescript
export type TaskStatus =
  | 'open' | 'in_progress' | 'done' | 'blocked' | 'cancelled'; // 與 §0.11 一致
export type TaskKind =
  | 'gap_fill' | 'review' | 'follow_up' | 'ops' | 'custom';

export interface Task extends AuditFields {
  readonly id: TaskId;
  status: TaskStatus;
  kind: TaskKind;
  title: string;
  description: string | null;
  assigneeType: 'human' | 'agent' | null;
  assigneeId: ActorId | null;
  dueAt: IsoDateTime | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';

  // 關聯來源與衍生
  relatedType: string | null;              // 'product','listing','order'…
  relatedId: string | null;
  spawnedLoopExecutionId: LoopExecutionId | null;
  spawnedHumanReviewId: HumanReviewId | null;
  blockedReason: string | null;
}
```
**Invariants**：`INV-T1` 狀態依 §5.12.4；`INV-T2` `blocked ⇒ blockedReason !== null`；`INV-T3` `in_progress ⇒ assigneeId !== null`。
**events**：`TaskOpened`、`TaskAssigned`、`TaskStarted`、`TaskBlocked`、`TaskClosed`（done/cancelled）。

---

## 5.7 Agent Context — Entity 完整定義

### 5.7.1 `Agent`（Aggregate Root — 定義）

**職責**：一個 AI 執行單元的定義（角色、I/O schema、可用 skill/connector）。**Aggregate root？** 是。對應 §0.6 的 7 個 canonical agents。

```typescript
// packages/domain/agent/agent.ts
export type AgentCode =
  | 'vision' | 'ocr' | 'price' | 'marketing'
  | 'reviewer' | 'publisher' | 'memory';   // §0.6 權威清單

export interface IoSchemaRef {              // VO
  readonly inputSchemaId: string;           // JSON schema id
  readonly outputSchemaId: string;
}

export interface Agent extends AuditFields {
  readonly id: AgentId;
  readonly code: AgentCode;                 // 唯一代號（§0.6）
  version: number;
  displayName: string;
  role: string;                             // 系統角色描述
  promptId: PromptId;                       // 綁定 prompt 模板
  modelTier: 'REASONING' | 'VISION' | 'FAST'; // 指向 MODELS.*（§0.3，禁硬寫版本）
  allowedSkillIds: SkillId[];
  allowedConnectorIds: ConnectorId[];
  io: IoSchemaRef;
  defaultRequiresHumanReview: boolean;      // §0.6 「預設需要 HR？」
  isActive: boolean;
}
```
**Invariants**：`INV-A1` `code` 全域唯一且屬 `AgentCode`；`INV-A2` `modelTier` 只能是 `MODELS.*` 的 key，不得硬寫模型 id（§0.3）；`INV-A3` Agent 只能呼叫 `allowedSkillIds`/`allowedConnectorIds` 內的能力（Permission 最小面）。
**events**：`AgentDefined`、`AgentVersionPublished`、`AgentDeactivated`。

### 5.7.2 `AgentRun`（Aggregate Root — 執行）

**職責**：Agent 的一次執行（input/output/cost/trace）。**Aggregate root？** 是。子成員：`ContextSnapshot`。狀態機見 §5.12（附錄）。

```typescript
export type AgentRunStatus =
  | 'started' | 'succeeded' | 'failed' | 'invalid_output';

export interface TokenUsage {               // VO
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costAmount: number;              // 整數 minor unit
  readonly costCurrency: string;
}

export interface AgentRun extends AuditFields {
  readonly id: AgentRunId;
  readonly agentId: AgentId;
  readonly agentCode: AgentCode;            // 冗餘便利
  readonly loopStepId: LoopStepId | null;   // 隸屬哪個 step（§0.5）
  status: AgentRunStatus;

  readonly modelId: string;                 // 執行當下實際模型 id（trace 記錄用）
  input: Record<string, unknown>;           // 已 schema 驗證
  output: Record<string, unknown> | null;
  usage: TokenUsage | null;
  contextSnapshotId: ContextSnapshotId | null;
  traceId: string | null;                   // 觀測（§0.4 L12）
  startedAt: IsoDateTime;
  finishedAt: IsoDateTime | null;
  error: { code: string; message: string } | null;
}
```
**Invariants**：`INV-AR1` `output` 必通過 `Agent.io.outputSchema` 驗證，否則 `status='invalid_output'`；`INV-AR2` 終態必有 `finishedAt`；`INV-AR3` `usage` 於 `succeeded` 時必填（成本記帳，§0.4 L3）。
**events**：`AgentRunStarted`、`AgentRunCompleted`、`AgentRunFailed`、`AgentOutputRejected`。

### 5.7.3 `Skill`（Aggregate Root — 定義）

**職責**：可被 Agent/Loop 呼叫的能力單元定義（純函式或 sub-loop）。**Aggregate root？** 是。

```typescript
export interface Skill extends AuditFields {
  readonly id: SkillId;
  readonly code: Slug;                      // 動詞開頭 'extract-brand'（§0.10）
  version: number;
  displayName: string;
  kind: 'pure_fn' | 'sub_loop';
  inputSchemaId: string;
  outputSchemaId: string;
  implRef: string;                          // packages/skills/* 的實作位址
  isActive: boolean;
}
```
**Invariants**：`INV-SK1` `code` kebab、動詞開頭、唯一；`INV-SK2` `kind='sub_loop' ⇒ implRef` 指向合法 `Loop.code`。
**events**：`SkillDefined`、`SkillVersionPublished`。

### 5.7.4 `Prompt`（Aggregate Root — 版本化模板）

**職責**：版本化的 prompt 模板（角色、任務、輸出契約）。**Aggregate root？** 是。

```typescript
export interface Prompt extends AuditFields {
  readonly id: PromptId;
  readonly code: Slug;                      // 'vision-extract-v'…
  version: number;
  template: string;                         // 含變數插槽 {{var}}
  variables: string[];                      // 宣告的插槽
  outputContract: string;                   // 期望輸出 schema 描述
  isActive: boolean;
}
```
**Invariants**：`INV-PR1` `(code,version)` 唯一、immutable（改 = 新 version）；`INV-PR2` `template` 中出現的插槽 ⊆ `variables`。
**events**：`PromptVersionPublished`。

### 5.7.5 `ContextSnapshot`（Entity，屬 AgentRun aggregate）

**職責**：某次執行實際餵入模型的 context（RAG/memory/entity 快照），供**回放**。**Aggregate root？** 否，屬 AgentRun。

```typescript
export interface ContextSnapshot extends AuditFields {
  readonly id: ContextSnapshotId;
  readonly agentRunId: AgentRunId;
  readonly promptId: PromptId;
  readonly promptVersion: number;
  renderedPrompt: string;                   // 最終送模型的完整字串
  contextItems: Array<{                     // 組成 context 的每一塊
    readonly kind: 'memory' | 'entity' | 'rag' | 'instruction';
    readonly ref: string;                   // MemoryId / ProductId / …
    readonly content: string;
  }>;
  readonly tokenEstimate: number;
}
```
**Invariants**：`INV-CS1` immutable（快照本質）；`INV-CS2` 一個 AgentRun 至多一個 snapshot。
**events**：`ContextSnapshotCaptured`。

---

## 5.8 Memory Context — Entity 完整定義

### 5.8.1 `Memory`（Aggregate Root）

**職責**：一條跨執行的記憶（fact/preference/feedback/reference），有 Embedding、可互聯。**Aggregate root？** 是。子成員：`MemoryLink[]`。

```typescript
// packages/domain/memory/memory.ts
export type MemoryKind = 'fact' | 'preference' | 'feedback' | 'reference';

export interface Memory extends AuditFields {
  readonly id: MemoryId;
  readonly slug: Slug;                      // '[[slug]]' 互聯鍵（§0.5）
  kind: MemoryKind;
  title: string;
  body: string;                             // markdown
  embeddingId: EmbeddingId | null;          // vector recall
  links: MemoryLink[];                      // child entities
  source: {                                 // 來源事件（可溯）
    readonly eventName: string;
    readonly relatedType: string | null;    // 'order','inquiry','aftersale'
    readonly relatedId: string | null;
  };
  confidence: Confidence;
  usageCount: number;                       // 被 recall 採用次數（衰減/加權用）
  isArchived: boolean;
}
```
**Invariants**：`INV-M1` `slug` 全域唯一（互聯基礎）；`INV-M2` `links` 不得指向自身；`INV-M3` `isArchived` 的 memory 不參與 recall。
**events**：`MemoryLearned`、`MemoryUpdated`、`MemoryArchived`。

### 5.8.2 `MemoryLink`（Entity，屬 Memory aggregate）

**職責**：記憶之間的關聯（`[[slug]]`）。**Aggregate root？** 否。

```typescript
export type MemoryLinkKind = 'relates' | 'refines' | 'contradicts' | 'supersedes';
export interface MemoryLink extends AuditFields {
  readonly id: MemoryLinkId;
  readonly fromMemoryId: MemoryId;
  readonly toMemorySlug: Slug;              // 目標以 slug 表示（[[slug]]）
  kind: MemoryLinkKind;
}
```
**Invariants**：`INV-ML1` `(fromMemoryId,toMemorySlug,kind)` 唯一；`INV-ML2` `toMemorySlug` 須為存在的 Memory（或標記 dangling）。
**events**：`MemoryLinked`。

> **Domain Service：`MemoryRecallService`** — 給定 context，用 Embedding 相似度 + `usageCount` 加權，回傳 top-k memories 供 `ContextBuilder`（§0.4 L2）使用。跨 Memory/Perception，故為 service。

---

## 5.9 Channel Context — Entity 完整定義

### 5.9.1 `Connector`（Aggregate Root）

**職責**：對外系統（Drive/FB/LINE）的連線設定與憑證。**Aggregate root？** 是。對應 §0.8。

```typescript
// packages/domain/channel/connector.ts
export type ConnectorProvider = 'drive' | 'facebook' | 'line';  // §0.8
export interface Connector extends AuditFields {
  readonly id: ConnectorId;
  readonly provider: ConnectorProvider;
  displayName: string;
  status: 'connected' | 'expired' | 'revoked' | 'error';
  credentialRef: string;                    // 指向 secret store（不存明文）
  scopes: string[];
  config: Record<string, unknown>;          // e.g. { folderId } for drive
  lastCheckedAt: IsoDateTime | null;
}
```
**Invariants**：`INV-C1` `credentialRef` 永不存明文憑證；`INV-C2` `status='connected'` 才可被 Publisher/ingest 使用（否則升級 HR/Task）。
**events**：`ConnectorConnected`、`ConnectorExpired`、`ConnectorRevoked`。

### 5.9.2 `Listing`（Aggregate Root）

**職責**：商品在某通路（FB）上的刊登。**Aggregate root？** 是。狀態機見 §5.12.2（與 Product 共用 `listing_status` 主軸，§0.11）。

```typescript
export type ListingStatus =
  | 'draft' | 'in_review' | 'approved'
  | 'published' | 'sold' | 'archived';      // 與 §0.11 listing_status 一致

export interface Listing extends AuditFields {
  readonly id: ListingId;
  readonly productId: ProductId;
  readonly connectorId: ConnectorId;        // 通路（facebook）
  status: ListingStatus;

  // 文案（Marketing Agent compose 產出）
  title: string;
  bodyMarkdown: string;
  hashtags: string[];
  sellingPoints: string[];
  composedByRunId: AgentRunId | null;

  // 審核與發佈
  reviewId: HumanReviewId | null;           // in_review 時
  externalPostId: string | null;           // FB post id（published 後）
  externalUrl: string | null;
  publishedAt: IsoDateTime | null;
}
```
**Invariants**：`INV-LS1` 狀態依 §5.12.2；`INV-LS2` 進 `published` 前須 `approved` 且通過 Permission（Publisher 副作用受管，§0.9）；`INV-LS3` `published ⇒ externalPostId !== null`；`INV-LS4` 一個 Product 在同一 connector 至多一個 active（非 archived）Listing。
**events**：`ListingComposed`、`ListingSubmittedForReview`、`ListingApproved`、`ListingPublished`、`ListingSold`、`ListingArchived`。

### 5.9.3 `Inquiry`（Aggregate Root）

**職責**：一則客戶詢問；可轉為 Order。**Aggregate root？** 是。

```typescript
export type InquiryStatus =
  | 'received' | 'answered' | 'negotiating' | 'converted' | 'lost';

export interface Inquiry extends AuditFields {
  readonly id: InquiryId;
  readonly listingId: ListingId;
  readonly connectorId: ConnectorId;
  status: InquiryStatus;
  externalThreadId: string;                 // FB/LINE 對話 id
  customerHandle: string;
  messages: Array<{                          // 對話快照（半自動客服）
    readonly at: IsoDateTime;
    readonly from: 'customer' | 'agent' | 'human';
    readonly text: string;
  }>;
  convertedOrderId: OrderId | null;
}
```
**Invariants**：`INV-IQ1` `converted ⇒ convertedOrderId !== null`；`INV-IQ2` 回覆客戶（外部副作用）須經 Permission/HR（§0.9）。
**events**：`InquiryReceived`、`InquiryAnswered`、`InquiryConverted`、`InquiryLost`。

### 5.9.4 `Order`（Aggregate Root）

**職責**：一筆成交。**Aggregate root？** 是。子成員：`AfterSale[]`。狀態機見 §5.12.5。

```typescript
export type OrderStatus =
  | 'pending' | 'paid' | 'shipped' | 'completed' | 'cancelled' | 'refunded';

export interface Order extends AuditFields {
  readonly id: OrderId;
  readonly productId: ProductId;
  readonly inquiryId: InquiryId | null;     // 來源詢問（可能直購）
  status: OrderStatus;
  amount: Money;                            // 成交金額（Money VO）
  buyerHandle: string;
  channel: ConnectorProvider;
  paidAt: IsoDateTime | null;
  shippedAt: IsoDateTime | null;
  completedAt: IsoDateTime | null;
  afterSales: AfterSale[];                  // child entities
  note: string | null;
}
```
**Invariants**：`INV-O1` 狀態依 §5.12.5；`INV-O2` `paid ⇒ paidAt`、`shipped ⇒ shippedAt`、`completed ⇒ completedAt`；`INV-O3` `amount.amount > 0`；`INV-O4` `completed`/`cancelled`/`refunded` 為終態。
**events**：`OrderCreated`、`OrderPaid`、`OrderShipped`、`OrderClosed`（completed）、`OrderCancelled`、`OrderRefunded`。

### 5.9.5 `AfterSale`（Entity，屬 Order aggregate）

**職責**：售後事件（退換/客訴/回購）。**Aggregate root？** 否，屬 Order。狀態機見 §5.12.5。

```typescript
export type AfterSaleKind = 'return' | 'exchange' | 'complaint' | 'repurchase';
export type AfterSaleStatus = 'open' | 'in_progress' | 'resolved' | 'rejected';

export interface AfterSale extends AuditFields {
  readonly id: AfterSaleId;
  readonly orderId: OrderId;
  kind: AfterSaleKind;
  status: AfterSaleStatus;
  reason: string;
  resolution: string | null;
  refundAmount: Money | null;
  resolvedAt: IsoDateTime | null;
}
```
**Invariants**：`INV-AS1` `resolved ⇒ resolvedAt`；`INV-AS2` `kind='return'` 且核准退款 ⇒ 反映到 Order（`refunded`，最終一致）；`INV-AS3` `refundAmount.currency === order.amount.currency`。
**events**：`AfterSaleOpened`、`AfterSaleResolved`、`AfterSaleRejected`。

---

## 5.10 Governance Context — Entity 完整定義

### 5.10.1 `HumanReview`（HR）（Aggregate Root，polymorphic）

**職責**：一個等待人類決策的關卡（§0.6 明確：HR 是關卡不是 Agent）。**Aggregate root？** 是。狀態機見 §5.12.3（與 §0.11 `human_review_status` 一致）。

```typescript
// packages/domain/governance/human-review.ts
export type HumanReviewStatus =
  | 'pending' | 'approved' | 'rejected' | 'edited' | 'expired'; // §0.11

export interface HumanReview extends AuditFields {
  readonly id: HumanReviewId;
  status: HumanReviewStatus;
  readonly targetType: string;              // polymorphic：'listing','price_suggestion','product'…
  readonly targetId: string;
  readonly reason: string;                  // 為何需要人審（policy/agent 觸發）
  readonly triggeredBy: 'reviewer_agent' | 'policy' | 'manual';
  readonly loopExecutionId: LoopExecutionId | null; // 卡住的 LX（§5.6.2）

  // 決策結果
  decision: {                               // VO；null until decided
    readonly by: ActorId;                   // human
    readonly at: IsoDateTime;
    readonly verdict: 'approved' | 'rejected' | 'edited';
    readonly comment: string | null;
    readonly editedPayload: Record<string, unknown> | null; // 'edited' 時的修改
  } | null;
  expiresAt: IsoDateTime | null;
}
```
**Invariants**：`INV-HR1` 狀態依 §5.12.3；`INV-HR2` 非 `pending` 時 `decision !== null`（`expired` 除外，其 decision 可為 null 但 status='expired'）；`INV-HR3` decided 後 resume 對應 `loopExecutionId`（最終一致）；`INV-HR4` `expiresAt` 過期未決 → `expired`。
**events**：`ReviewRequested`、`ReviewPassed`（approved）、`ReviewRejected`、`ReviewEdited`、`ReviewExpired`。

### 5.10.2 `Policy`（Aggregate Root）

**職責**：一條權限規則，由 `PolicyEngine` 評估（§0.9 第二道防線）。**Aggregate root？** 是。

```typescript
export interface Policy extends AuditFields {
  readonly id: PolicyId;
  readonly code: Slug;                      // 'publish-requires-review'
  displayName: string;
  effect: 'allow' | 'deny' | 'require_review';
  // 條件（who / action / resource / guard）
  subjectType: 'human' | 'agent' | 'any';
  subjectRef: string | null;                // AgentCode / role / null=any
  action: string;                           // 'publish','apply_price','reply','delete'
  resourceType: string;                     // 'listing','product','inquiry'…
  condition: string | null;                 // guard 表達式（e.g. 'amount > 50000')
  priority: number;                         // 高者先評
  isActive: boolean;
}
```
**Invariants**：`INV-POL1` `code` 唯一；`INV-POL2` 同 action/resource 多條時依 `priority` 決議，`deny` 優先於 `allow`（fail-safe，§0.9 預設 deny）。
**events**：`PolicyDefined`、`PolicyEvaluated`（含 `PolicyDenied`）。

> **Domain Service：`PolicyEngine`** — 對「動作級」授權判定（§0.9）。輸入 `(Actor, action, resource, ctx)`，回傳 `allow | deny | require_review`。是所有外部副作用的閘門，橫切全 context，故為 service。

### 5.10.3 `AuditLog`（Aggregate Root，polymorphic，immutable）

**職責**：一條不可變的動作紀錄。**Aggregate root？** 是（append-only）。

```typescript
export interface AuditLog extends AuditFields {
  readonly id: AuditLogId;
  readonly actorId: ActorId;
  readonly action: string;                  // 'listing.published','price.applied'
  readonly targetType: string;              // polymorphic
  readonly targetId: string;
  readonly before: Record<string, unknown> | null;
  readonly after: Record<string, unknown> | null;
  readonly loopExecutionId: LoopExecutionId | null;
  readonly ip: string | null;
}
```
**Invariants**：`INV-AL1` **immutable**（只 insert，永不 update/delete）；`INV-AL2` 每個「有外部副作用或不可逆」的動作必寫一筆（§0.9）。
**events**：`ActionAudited`（本身即事件化的紀錄）。

### 5.10.4 `EvalRun`（Aggregate Root）

**職責**：對某輸出的一次評分（自動或人工，§0.4 L10）。**Aggregate root？** 是。

```typescript
export interface EvalRun extends AuditFields {
  readonly id: EvalRunId;
  readonly targetType: 'agent_run' | 'loop_execution';
  readonly targetId: string;                // AgentRunId | LoopExecutionId
  readonly evaluator: 'auto' | 'human';
  readonly rubricCode: Slug;                // 評分規則代號
  scores: Array<{ readonly dimension: string; readonly score: number; readonly max: number }>;
  passed: boolean;
  comment: string | null;
}
```
**Invariants**：`INV-EV1` `scores[].score <= max`；`INV-EV2` `passed` 由 rubric 門檻決定，不可手動與 scores 矛盾。
**events**：`EvalScored`、`EvalFailed`。

### 5.10.5 `Actor`（Aggregate Root）

**職責**：動作的發起者（human user / agent / system，§0.9 兩種 Actor + system）。**Aggregate root？** 是。所有 `AuditFields.createdBy`、event `actorId` 皆指向 Actor。

```typescript
export type ActorType = 'human' | 'agent' | 'system';
export interface Actor extends AuditFields {
  readonly id: ActorId;
  readonly type: ActorType;
  displayName: string;
  // human：對應 Supabase Auth user；agent：對應 AgentCode
  authUserId: string | null;                // type='human'
  agentCode: AgentCode | null;              // type='agent'
  isActive: boolean;
}
```
**Invariants**：`INV-ACT1` `type='human' ⇔ authUserId !== null`；`INV-ACT2` `type='agent' ⇔ agentCode !== null`；`INV-ACT3` `type='system'` 為單例（平台身分）。
**events**：`ActorRegistered`、`ActorDeactivated`。

---

## 5.11 Domain Events 清單（Loop 的燃料）

事件以**過去式**命名，代表「已發生的事實」。Loop runtime 訂閱這些事件驅動下一步（§0.4 L4/L5）。下表為權威清單（含 §0.7 主流程對映）。

| Event | 發佈者 (context) | 主要 payload | 觸發的下游（訂閱者） | §0.7 stage |
|---|---|---|---|---|
| `PhotoIngested` | Catalog | `{ productPhotoId, driveFileId }` | Perception（起 OCR+Vision） | drive-ingest |
| `OcrExtracted` | Perception | `{ ocrResultId, productPhotoId }` | Catalog（assemble） | perceive |
| `VisionAnalyzed` | Perception | `{ visionResultId, productPhotoId }` | Catalog（assemble） | perceive |
| `VisionLowConfidence` | Perception | `{ productPhotoId, confidence }` | Loop（起 gap Task / HR） | gap-check |
| `EmbeddingIndexed` | Perception | `{ embeddingId, ownerType, ownerId }` | Memory（recall 索引） | — |
| `ProductAssembled` | Catalog | `{ productId }` | Loop（gap-check→price） | assemble |
| `ProductGapDetected` | Catalog | `{ productId, missingFields }` | Loop（spawn Task/HR） | gap-check |
| `PriceSuggested` | Pricing | `{ priceSuggestionId, productId, confidence }` | Pricing/Governance（policy→HR? / apply） | price |
| `PriceApplied` | Pricing/Catalog | `{ productId, priceHistoryId }` | Channel（compose） | price |
| `ListingComposed` | Channel | `{ listingId, productId }` | Governance（reviewer/HR） | compose |
| `ReviewRequested` | Governance | `{ humanReviewId, targetType, targetId }` | UI（人審佇列）+ LX pause | human-review |
| `ReviewPassed` | Governance | `{ humanReviewId, targetId }` | Loop（resume→publish） | review/human-review |
| `ReviewRejected` | Governance | `{ humanReviewId, targetId, comment }` | Loop（回退 assemble/compose） | review |
| `ReviewEdited` | Governance | `{ humanReviewId, targetId, editedPayload }` | Loop（採用修改→resume） | human-review |
| `ListingPublished` | Channel | `{ listingId, productId, externalPostId }` | Catalog（markPublished）+ Task close | publish |
| `InquiryReceived` | Channel | `{ inquiryId, listingId }` | Loop（engage 半自動客服） | engage |
| `OrderClosed` | Channel | `{ orderId, productId }` | Catalog（markSold）+ Memory | close |
| `AfterSaleOpened` | Channel | `{ afterSaleId, orderId }` | Loop（follow-up Task） | aftersale |
| `MemoryLearned` | Memory | `{ memoryId, kind }` | ContextBuilder（未來 recall） | remember |
| `AgentRunCompleted` | Agent | `{ agentRunId, agentCode }` | Loop（推進 step）+ Eval | 各 stage |
| `PolicyDenied` | Governance | `{ policyId, actorId, action }` | Loop（阻斷副作用→HR/fail） | 橫切 |

> **命名規範**：事件名 PascalCase 過去式；payload 只放 **id + 判斷用的最小值**（如 confidence），完整資料由訂閱者用 id 經 Repository 取回（避免事件肥大、避免資料不一致）。

---

## 5.12 State Machines（權威狀態機）

以下狀態機為全書權威，與 §0.11 一致並補全「事件 / guard / side-effect」。凡他章的狀態圖須引用本節。

### 5.12.1 `LoopExecution` 狀態機（核心，對應 §0.11）

```
            start
   ┌───────────────────┐
   ▼                   │
[queued] ──dispatch──► [running] ──all_steps_ok──► [succeeded] ●終
   │                    │  ▲                                    
   │cancel              │  │resume(review decided)              
   ▼                    │  │                                    
[cancelled]●終    need_human│  │                                
   ▲                    ▼  │                                    
   │            [waiting_human]                                 
   │cancel           │   │                                      
   └─────────────────┘   │review_expired/step_error            
                         ▼                                      
                     [running] ──step_error(no_retry)──► [failed]●終
                                                          ●終
（● = 終態：succeeded / failed / cancelled）
```

**轉移表（event / guard / side-effect）**

| From | Event | Guard | To | Side-effect |
|---|---|---|---|---|
| `queued` | `dispatch` | worker 取件成功 | `running` | 建首個 `LoopStep`；`startedAt=now`；emit `LoopExecutionStarted` |
| `queued` | `cancel` | actor 有權 | `cancelled` | `finishedAt=now`；emit `LoopExecutionCancelled` |
| `running` | `step_completed` | 還有後續 step | `running` | 建下一 `LoopStep`（依 Loop 定義） |
| `running` | `need_human` | step.kind=`human_review` 或 policy=require_review | `waiting_human` | 建 `HumanReview`；`pendingReviewId` set；emit `ReviewRequested` |
| `running` | `all_steps_ok` | termination rule 達成 | `succeeded` | `output` set；`finishedAt=now`；emit `LoopExecutionSucceeded` |
| `running` | `step_error` | 不可重試 或 `attempt>=max` | `failed` | `error` set；`finishedAt=now`；emit `LoopExecutionFailed` |
| `running` | `step_error` | 可重試 且 `attempt<max` | `running` | `attempt++`；重建該 step |
| `waiting_human` | `review_decided(approved/edited)` | HR.status∈{approved,edited} | `running` | 清 `pendingReviewId`；採用 editedPayload；emit `LoopExecutionResumed` |
| `waiting_human` | `review_decided(rejected)` | HR.status=rejected | `running` | 走 `onReject` 回退邊（§0.7）；emit `LoopExecutionResumed` |
| `waiting_human` | `review_expired` | now>expiresAt | `failed`(或依 policy 回 `running`) | emit `ReviewExpired`；依 policy 決定 fail 或降級 |
| `waiting_human` | `cancel` | actor 有權 | `cancelled` | 關聯 HR 標 `expired`；emit `LoopExecutionCancelled` |

### 5.12.2 `Product` / `Listing` 狀態機（對應 §0.11）

> **R1 定案（2026-07-07）**：`Product` 使用**獨立**的 `product_status`（`ingested → assembled → gap → priced → composed → reviewing → published → sold → archived`），**不與 `Listing` 共用** `listing_status`。下方共用圖僅適用 `Listing`；`Product` 的細階段映射見 `docs/06` 與 `@jbg/db` 的 `PRODUCT_STATUS`。原「共用」敘述已作廢。

```
[draft] ──submit(gap_clear & price_set)──► [in_review] ──approve──► [approved]
   ▲                                          │                        │
   │reopen(reject)                            │reject                  │publish
   └──────────────────────────────────────────┘                        ▼
                                                                   [published]
                                                                        │sold
                                                                        ▼
   [archived] ●終 ◄──archive(from any non-sold)──                   [sold]
        ▲                                                               │archive
        └───────────────────────────────────────────────────────────────┘
（listing_status = draft→in_review→approved→published→sold→archived，§0.11）
```

**轉移表**

| From | Event | Guard | To | Side-effect |
|---|---|---|---|---|
| `draft` | `submit` | INV-P2 齊全 且 `currentPrice!=null`(INV-P3) | `in_review` | emit `ListingSubmittedForReview` |
| `in_review` | `approve` | Reviewer pass 或 HR approved | `approved` | emit `ProductApproved`/`ListingApproved` |
| `in_review` | `reject` | Reviewer/HR reject | `draft` | 回退（§0.7 assemble/compose）；spawn fix Task |
| `approved` | `publish` | Permission allow（Publisher，§0.9）| `published` | 經 Connector 發 FB；set `externalPostId`；emit `ListingPublished` |
| `published` | `sold` | `OrderClosed` 到達 | `sold` | set `soldOrderId`；emit `ListingSold`/`ProductSold` |
| any(≠sold) | `archive` | actor 有權 | `archived` | 若已 published 則下架通路；emit `ListingArchived` |
| `sold` | `archive` | — | `archived` | 歸檔；emit `ProductArchived` |

### 5.12.3 `HumanReview` 狀態機（對應 §0.11 `human_review_status`）

```
[pending] ──approve──► [approved] ●終
   │  │  │
   │  │  └──edit─────► [edited]   ●終
   │  └─────reject───► [rejected] ●終
   └────────expire───► [expired]  ●終
（pending → approved | rejected | edited | expired，§0.11）
```

**轉移表**

| From | Event | Guard | To | Side-effect |
|---|---|---|---|---|
| `pending` | `approve` | reviewer 有權 | `approved` | `decision` set；emit `ReviewPassed`；resume LX |
| `pending` | `reject` | reviewer 有權 | `rejected` | `decision` set；emit `ReviewRejected`；LX 走回退邊 |
| `pending` | `edit` | reviewer 有權且提供 editedPayload | `edited` | `decision.editedPayload` set；emit `ReviewEdited`；LX 採用修改後 resume |
| `pending` | `expire` | now>expiresAt | `expired` | emit `ReviewExpired`；依 policy fail/降級 LX |

### 5.12.4 `Task` 狀態機（對應 §0.11 `task_status`）

```
[open] ──assign+start──► [in_progress] ──finish──► [done] ●終
  │  │                       │  │
  │  │                       │  └──block───► [blocked] ──unblock──► [in_progress]
  │  └──────cancel───────────┼─────────────────► [cancelled] ●終
  └──────block──────────────►[blocked]
（open → in_progress → done | blocked | cancelled，§0.11）
```

**轉移表**

| From | Event | Guard | To | Side-effect |
|---|---|---|---|---|
| `open` | `start` | `assigneeId!=null`(INV-T3) | `in_progress` | emit `TaskStarted` |
| `open`/`in_progress` | `block` | 提供 `blockedReason`(INV-T2) | `blocked` | emit `TaskBlocked` |
| `blocked` | `unblock` | 阻因解除 | `in_progress` | 清 `blockedReason` |
| `in_progress` | `finish` | 完成條件達成 | `done` | 關聯 spawn 物件收束；emit `TaskClosed` |
| `open`/`in_progress`/`blocked` | `cancel` | actor 有權 | `cancelled` | emit `TaskClosed` |

### 5.12.5 `Order` / `AfterSale` 生命週期

**Order**
```
[pending] ──pay──► [paid] ──ship──► [shipped] ──confirm──► [completed] ●終
   │                 │                                          │
   │cancel           │refund(after_sale)                        │refund(after_sale)
   ▼                 ▼                                          ▼
[cancelled]●終    [refunded] ●終 ◄───────────────────────────────┘
```

| From | Event | Guard | To | Side-effect |
|---|---|---|---|---|
| `pending` | `pay` | 收款確認 | `paid` | `paidAt=now`；emit `OrderPaid` |
| `pending` | `cancel` | 未付款 | `cancelled` | Listing 回 `published`；emit `OrderCancelled` |
| `paid` | `ship` | 出貨 | `shipped` | `shippedAt=now`；emit `OrderShipped` |
| `shipped` | `confirm` | 買家確認/超時自動 | `completed` | `completedAt=now`；`Listing→sold`；emit `OrderClosed` |
| `paid`/`shipped`/`completed` | `refund` | AfterSale 核准退款(INV-AS2) | `refunded` | 退款；emit `OrderRefunded`；記 `AuditLog` |

**AfterSale**
```
[open] ──take──► [in_progress] ──resolve──► [resolved] ●終
   │                  │
   │reject            └──reject──► [rejected] ●終
   └────────────────► [rejected]
（open → in_progress → resolved | rejected）
```

| From | Event | Guard | To | Side-effect |
|---|---|---|---|---|
| `open` | `take` | assignee set | `in_progress` | emit（内部） |
| `in_progress` | `resolve` | 提供 resolution（退款則 refundAmount，INV-AS3） | `resolved` | `resolvedAt=now`；若退款→觸發 `Order.refund`；emit `AfterSaleResolved` |
| `open`/`in_progress` | `reject` | 不受理 | `rejected` | emit `AfterSaleRejected` |

### 5.12.6 `AgentRun` 狀態機（輔助）

```
[started] ──output_valid──► [succeeded] ●終
   │  │
   │  └──schema_fail──► [invalid_output] ●終
   └──────exception───► [failed] ●終
```

| From | Event | Guard | To | Side-effect |
|---|---|---|---|---|
| `started` | `complete` | output 通過 `Agent.io.outputSchema`(INV-AR1) | `succeeded` | 記 `usage`(INV-AR3)；emit `AgentRunCompleted` |
| `started` | `complete` | schema 驗證失敗 | `invalid_output` | emit `AgentOutputRejected`；step 依 retry policy |
| `started` | `error` | 例外/逾時 | `failed` | `error` set；emit `AgentRunFailed` |

---

## 5.13 Repository 介面範例（關鍵 aggregate）

Repository 只操作 **aggregate root**（存/取整個 aggregate）；查詢投影走獨立 read model（CQRS-lite，§5.1.1）。所有 repo 皆回傳 `Promise`，並在 save 時將 aggregate 內累積的 domain events 交給 outbox（`EventOutbox`）。

```typescript
// packages/domain/shared/repository.ts
export interface Repository<TRoot, TId> {
  findById(id: TId): Promise<TRoot | null>;
  save(root: TRoot): Promise<void>;          // upsert root+children，flush events 到 outbox
  nextId(): TId;
}

// packages/domain/catalog/product.repository.ts
export interface ProductRepository extends Repository<Product, ProductId> {
  findBySku(sku: Slug): Promise<Product | null>;
  findByStatus(status: ProductStatus, limit: number): Promise<Product[]>;
  /** gap-check 用：找出缺料的 draft 商品 */
  findDraftsWithMissingFields(): Promise<Product[]>;
}

// packages/domain/loop/loop-execution.repository.ts
export interface LoopExecutionRepository
  extends Repository<LoopExecution, LoopExecutionId> {
  findByStatus(status: LoopExecutionStatus): Promise<LoopExecution[]>;
  findWaitingOnReview(reviewId: HumanReviewId): Promise<LoopExecution | null>;
  /** worker 取件：撈 queued 並鎖定（SELECT ... FOR UPDATE SKIP LOCKED） */
  claimNextQueued(workerId: string): Promise<LoopExecution | null>;
}

// packages/domain/agent/agent-run.repository.ts
export interface AgentRunRepository extends Repository<AgentRun, AgentRunId> {
  findByLoopStep(stepId: LoopStepId): Promise<AgentRun | null>;
  /** 成本觀測：某時段某 agent 的用量 */
  sumUsageByAgent(agentCode: AgentCode, from: IsoDateTime, to: IsoDateTime):
    Promise<TokenUsage>;
}

// packages/domain/channel/listing.repository.ts
export interface ListingRepository extends Repository<Listing, ListingId> {
  findByProduct(productId: ProductId): Promise<Listing[]>;
  findActiveByProductAndConnector(
    productId: ProductId, connectorId: ConnectorId): Promise<Listing | null>; // INV-LS4
}

// packages/domain/memory/memory.repository.ts
export interface MemoryRepository extends Repository<Memory, MemoryId> {
  findBySlug(slug: Slug): Promise<Memory | null>;
  /** vector recall：交給 MemoryRecallService 用，回 top-k */
  searchByEmbedding(vector: number[], topK: number): Promise<Memory[]>;
}

// packages/domain/governance/human-review.repository.ts
export interface HumanReviewRepository extends Repository<HumanReview, HumanReviewId> {
  findPending(limit: number): Promise<HumanReview[]>;
  findByTarget(targetType: string, targetId: string): Promise<HumanReview[]>;
  /** 過期掃描（pg_cron 定時呼叫，觸發 expire 轉移） */
  findExpired(now: IsoDateTime): Promise<HumanReview[]>;
}
```

> **Outbox 慣例**：`save()` 在同一 DB 交易內寫入 aggregate row 與 `domain_events`（outbox）；Loop runtime 的 dispatcher poll outbox → 發佈 → 標記已處理，保證「狀態變更」與「事件發佈」原子一致（§5.1.2 不做 event sourcing 的替代方案）。

---

## 5.14 建議加入 canonical model 的項目（供 §0.5 裁決）

以下為本章展開時發現、**目前以 VO/內部型別承載但可能值得升為 canonical**的候選；在 §0.5 批准前，一律**僅作為既有 Entity 的內部結構**，不作為獨立 canonical Entity 使用：

1. **`DomainEvent` / `EventOutbox`（建議加入 canonical model）** — 事件是 Loop 的燃料（§5.11），且需持久化（outbox）。建議在 §0.5 的 Loop 或 Governance context 正式登錄 `DomainEvent`（table `domain_events`）為 canonical Entity，讓 §06 schema 與 §08 runtime 有明確落點。
2. **`Actor` 已在 §0.5**，但 `AuditFields.createdBy` 全書引用它，建議 §0.5 明確標注 Actor 為「跨 context 共用參照」。
3. 其餘（`Price`、`AdoptedAttribute`、`TokenUsage`、`StepDef`、`VisionDefect` 等）維持為 **VO**，不建議升為 canonical Entity。

> 除上述第 1 項提出「建議加入 canonical model」外，本章未私自發明任何 canonical Entity（遵 §0.5 規則）。

---

## 本章交付物 (Deliverables)

1. **DDD 戰術模式與取捨聲明**（§5.1）：Aggregate/Entity/VO/Event/Repository/Service 的用法與明確不做的事（無跨 aggregate 交易、outbox 取代 event sourcing）。
2. **8 個 Bounded Context 的職責、Entity 歸屬、Context Map 與整合契約**（§5.2）。
3. **§0.5 全部 30 個 Entity 的完整定義**（§5.3–§5.10）：每個含職責、是否 aggregate root、TypeScript interface、invariants（編號 INV-*）、關鍵 domain events；核心（Product/ProductPhoto/Price 系列/OCR/Vision/Loop 系列/Agent 系列/Memory/Channel 系列/Governance 系列）深入展開。
4. **Domain Events 權威清單**（§5.11）：含發佈者、payload、訂閱者、對映 §0.7 主流程 stage。
5. **6 組權威狀態機**（§5.12）：LoopExecution、Product/Listing、HumanReview、Task、Order/AfterSale、AgentRun，各含 ASCII 圖 + event/guard/side-effect 轉移表，與 §0.11 完全一致。
6. **關鍵 aggregate 的 Repository 介面**（§5.13）+ outbox 慣例。
7. **canonical model 增補建議**（§5.14）：明確標注 `DomainEvent/EventOutbox` 為「建議加入 canonical model」。

## 驗收條件 (Acceptance Criteria)

- [ ] **AC-1 名稱零衝突**：本章所有 Entity 名稱與 §0.5 一字不差；未私自發明 canonical Entity（唯一例外 §5.14 已明確標注「建議加入」）。
- [ ] **AC-2 enum 一致**：`LoopExecutionStatus`、`ProductStatus/ListingStatus`、`HumanReviewStatus`、`TaskStatus`、`OrderStatus` 的值與 §0.11 完全相同。
- [ ] **AC-3 全 Entity 覆蓋**：§0.5 表列 30 個 Entity 每個都有 TS interface + 是否 root + invariants + events。
- [ ] **AC-4 狀態機權威**：§0.11 列的 4 條狀態機（LX/listing/HR/task）在 §5.12 皆有圖 + 轉移表，且補全 Order/AfterSale。
- [ ] **AC-5 事件驅動可追**：§5.11 每個事件都能對映到 §0.7 的至少一個 stage 或標「橫切」。
- [ ] **AC-6 型別可編譯**：所有 interface 為合法 TypeScript strict（品牌化 Id、Money VO、無 `any`），可直接落到 `packages/domain/*`。
- [ ] **AC-7 邊界正確**：Perception 結果為獨立 aggregate（不塞進 Product）；所有外部副作用經 Connector + Policy/HR 閘門（§0.9），本章 invariants 有反映（INV-LS2/INV-IQ2/INV-C2）。
- [ ] **AC-8 可實作**：§5.13 Repository 介面 + outbox 慣例足以讓 §06（schema）與 §08（runtime）直接接續，無需回頭補領域定義。

— 第 05 章結束。狀態機與 Entity 定義以本章為權威；schema 落地見 `docs/06`，runtime 驅動見 `docs/08`。
