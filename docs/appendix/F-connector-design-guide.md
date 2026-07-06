# 附錄 F · Connector Design Guide

> 本附錄定義 JBG OS 中 **Connector**（Loop Engineering 第 7 層，見 `docs/00-canonical-model.md` §0.4、§0.8）的設計準則、空白模板與三個真實範例骨架。
> 引用的名詞、Entity（`Connector`）、命名一律以 `docs/00-canonical-model.md` 為準。
> 版本：v1.0 · 最後更新：2026-07-07

---

## F.1 什麼是 Connector (What a Connector Is)

**Connector = 對外部系統讀寫的介面層，是所有外部副作用的唯一出口。**（§0.4 第 7 層；§0.8；§0.5 `Connector` entity，Channel Context。）

> **鐵律（§0.8）：所有對外副作用必須經 Connector 層。Agent 與 Loop 不得直接 `fetch` 外部 API。**

理由：外部系統是系統裡最不可靠、最有副作用、最需要憑證與治理的部分。把它們全部收斂到 `packages/connectors/*`，才能集中處理憑證輪替、rate limit、重試、冪等、錯誤映射、webhook 驗證，並讓 Agent/Loop/Skill 全部可被 mock 測試。

JBG OS 的三個 canonical connector（§0.8）：

| Connector id | 對象 | 唯讀 / 讀寫 |
|---|---|---|
| `drive` | Google Drive | 唯讀為主（監看、下載、metadata） |
| `facebook` | Facebook Graph API | 讀寫（讀留言/互動、發文/回覆） |
| `line` | LINE Messaging / Notify | 唯寫（推播通知給老闆） |

> 載體：`packages/connectors/<connector-id>/`。

---

## F.2 Connector 契約 (The Connector Contract)

每個 Connector **必須**處理以下 8 面向。

| # | 面向 | 規則 |
|---|---|---|
| 1 | **憑證管理 (credentials)** | Token/secret **只存 Supabase**（`connectors` table 的加密欄或 Vault），**永不進 git、永不進 log**。從 `deps.secrets` 讀，不從 `process.env` 直讀散落各處。 |
| 2 | **憑證輪替 (rotation)** | 支援 refresh token / 短期 token 自動換發；換發後寫回 store。過期偵測 → 觸發 refresh，refresh 失敗 → `ConnectorAuthError`（升級人審，不無限重試）。 |
| 3 | **rate limit** | 內建 token-bucket / 佇列，尊重對方 API 的配額與 `Retry-After`。超限不是錯誤，是等待。 |
| 4 | **重試 / 退避 (retry/backoff)** | 只對**暫時性錯誤**（429/5xx/網路）指數退避 + jitter 重試；4xx（除 429）不重試。 |
| 5 | **冪等 (idempotency)** | 寫操作帶冪等鍵（client-generated key 或 external id 去重），確保重試不重複發文/重複推播。 |
| 6 | **錯誤映射 (error mapping)** | 把對方雜亂的 HTTP/SDK 錯誤映射成 typed error：`ConnectorAuthError` / `ConnectorRateLimitError` / `ConnectorTransientError` / `ConnectorFatalError` / `ConnectorNotFoundError`。 |
| 7 | **webhook 驗證** | 有 inbound webhook 者（如 `facebook`）必須驗簽（`X-Hub-Signature-256` 等），驗不過直接拒。 |
| 8 | **唯讀 vs 讀寫分離** | 介面上把 read 與 write 分開；write 方法受 §0.9 Permission 管，且預設對「不可逆動作」要求呼叫方已通過 Permission/HR。 |

### 設計準則 (Design Principles)

1. **薄、笨、可靠**：Connector 不做業務判斷（不決定「這篇文案能不能發」——那是 Reviewer/Policy）。它只負責「安全、正確、可重試地把這個請求送出去」。
2. **介面優先**：先定義 `interface`，實作與 mock 各一份。Agent/Loop/Skill 只依賴 interface。
3. **可觀測**：每次對外呼叫回傳/記錄 `meta`（latencyMs、statusCode、retries、rateLimitRemaining），供 §0.4 第 12 層 trace。
4. **最小權限 scope**：申請的 OAuth scope 只涵蓋實際用到的動作，寫進下方每個 connector 的清單。

---

## F.3 空白模板 (Blank Template)

### F.3.1 共用 interface 與 core（`packages/connectors-core`）

```ts
// packages/connectors-core/index.ts
export interface ConnectorMeta {
  connectorId: string;
  latencyMs: number;
  statusCode?: number;
  retries: number;
  rateLimitRemaining?: number;
}

export interface ConnectorDeps {
  secrets: SecretStore;      // 從 Supabase 讀/寫憑證（§F.2-1/2）
  http: HttpClient;          // 內建 retry/backoff/timeout（§F.2-4）
  rateLimiter: RateLimiter;  // token-bucket（§F.2-3）
  logger: Logger;
  clock?: () => number;      // 注入時鐘，方便測試
}

export class ConnectorAuthError extends Error {}       // 憑證失效 → 不重試、升級
export class ConnectorRateLimitError extends Error {}  // 429 → 等待後重試
export class ConnectorTransientError extends Error {}  // 5xx/網路 → 退避重試
export class ConnectorFatalError extends Error {}      // 4xx（非 429）→ 不重試
export class ConnectorNotFoundError extends Error {}   // 404
```

### F.3.2 單一 Connector 骨架

```ts
// packages/connectors/<connector-id>/index.ts
import { z } from 'zod';
import type { ConnectorDeps, ConnectorMeta } from '@jbg/connectors-core';
import {
  ConnectorAuthError,
  ConnectorTransientError,
  ConnectorRateLimitError,
} from '@jbg/connectors-core';

export const CONNECTOR_ID = '<connector-id>' as const;

/** 需要的 OAuth scope / 權限（文件化，供申請與審計） */
export const REQUIRED_SCOPES = [
  // TODO: e.g. 'https://www.googleapis.com/auth/drive.readonly'
] as const;

/** 需要的環境變數 / secret 鍵名（值不進 git） */
export const REQUIRED_SECRETS = [
  // TODO: e.g. 'GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_REFRESH_TOKEN'
] as const;

/** 對外契約：read 與 write 分離（§F.2-8） */
export interface <PascalName>Connector {
  // --- reads ---
  // list(...): Promise<{ data: ...; meta: ConnectorMeta }>;
  // --- writes（受 Permission 管；帶冪等鍵）---
  // send(input: ..., opts: { idempotencyKey: string }): Promise<{ data: ...; meta: ConnectorMeta }>;
}

/** 實作 */
export function create<PascalName>Connector(deps: ConnectorDeps): <PascalName>Connector {
  async function getAccessToken(): Promise<string> {
    // 讀 secret；過期則 refresh 並寫回（§F.2-1/2）
    // refresh 失敗 → throw new ConnectorAuthError(...)
    return '';
  }

  return {
    // TODO: 實作 read/write 方法
    // 每個方法：await deps.rateLimiter.acquire(CONNECTOR_ID);
    //           用 deps.http（內建 retry/backoff）呼叫；
    //           把錯誤映射成 typed error；回傳 { data, meta }。
  };
}

/** webhook 驗證（若有 inbound）（§F.2-7） */
export function verifyWebhook(rawBody: string, signature: string, secret: string): boolean {
  // TODO: HMAC 驗簽；驗不過回 false
  return false;
}

export default { CONNECTOR_ID, REQUIRED_SCOPES, REQUIRED_SECRETS, create<PascalName>Connector, verifyWebhook };
```

---

## F.4 真實範例骨架

### F.4.1 `drive` — Google Drive（監看 / 下載，唯讀）

- **用途**：SHAP `drive-ingest` loop 的入口（§0.7）。監看指定資料夾、抓新照片、讀 metadata、下載檔案。
- **唯讀 / 讀寫**：**唯讀為主**（§0.8）。無寫回 Drive。
- **需要的 scope**：`https://www.googleapis.com/auth/drive.readonly`（若用 change feed，需 `drive.metadata.readonly`）。
- **需要的 secret / env**：`GOOGLE_DRIVE_CLIENT_ID`、`GOOGLE_DRIVE_CLIENT_SECRET`、`GOOGLE_DRIVE_REFRESH_TOKEN`、`GOOGLE_DRIVE_WATCH_FOLDER_ID`。
- **冪等**：以 Drive `fileId` + `md5Checksum` 去重，同一檔案不重複 ingest。

```ts
// packages/connectors/drive/index.ts
export const CONNECTOR_ID = 'drive' as const;
export const REQUIRED_SCOPES = ['https://www.googleapis.com/auth/drive.readonly'] as const;
export const REQUIRED_SECRETS = [
  'GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET',
  'GOOGLE_DRIVE_REFRESH_TOKEN', 'GOOGLE_DRIVE_WATCH_FOLDER_ID',
] as const;

export interface DriveFile {
  fileId: string; name: string; mimeType: string;
  md5Checksum: string; createdTime: string; sizeBytes: number;
}

export interface DriveConnector {
  listNewFiles(sinceIso: string): Promise<{ data: DriveFile[]; meta: ConnectorMeta }>;
  downloadFile(fileId: string): Promise<{ data: { bytes: Uint8Array; file: DriveFile }; meta: ConnectorMeta }>;
  // 無 write 方法：drive 唯讀
}

export function createDriveConnector(deps: ConnectorDeps): DriveConnector {
  // getAccessToken() 用 refresh token 換短期 token，過期自動 refresh
  // listNewFiles：files.list(q=父資料夾 + modifiedTime > since)，rateLimiter.acquire 後呼叫
  // downloadFile：files.get(alt=media)；404 → ConnectorNotFoundError；5xx → ConnectorTransientError
  return {} as DriveConnector;
}
```

### F.4.2 `facebook` — Facebook Graph API（發文 / 讀留言，讀寫）

- **用途**：`publisher` Agent 發文（§0.6）、`engage` 階段讀留言/互動（§0.7）。
- **唯讀 / 讀寫**：**讀寫**。write（發文、回留言）受 §0.9 Permission 管，且「首次上架發佈」預設需 HR（§0.6 marketing/publisher）。
- **需要的 scope**：`pages_manage_posts`、`pages_read_engagement`、`pages_manage_engagement`（回留言）、`pages_show_list`。
- **需要的 secret / env**：`FB_APP_ID`、`FB_APP_SECRET`、`FB_PAGE_ID`、`FB_PAGE_ACCESS_TOKEN`（長期 page token）、`FB_WEBHOOK_VERIFY_TOKEN`、`FB_WEBHOOK_APP_SECRET`（驗簽）。
- **冪等**：發文帶 client-generated `idempotencyKey`；發文成功回傳的 FB `postId` 寫進 `Listing`（§0.5），重試前先查是否已存在。

```ts
// packages/connectors/facebook/index.ts
export const CONNECTOR_ID = 'facebook' as const;
export const REQUIRED_SCOPES = [
  'pages_manage_posts', 'pages_read_engagement',
  'pages_manage_engagement', 'pages_show_list',
] as const;
export const REQUIRED_SECRETS = [
  'FB_APP_ID', 'FB_APP_SECRET', 'FB_PAGE_ID', 'FB_PAGE_ACCESS_TOKEN',
  'FB_WEBHOOK_VERIFY_TOKEN', 'FB_WEBHOOK_APP_SECRET',
] as const;

export interface FacebookConnector {
  // reads
  listComments(postId: string): Promise<{ data: FbComment[]; meta: ConnectorMeta }>;
  getPostInsights(postId: string): Promise<{ data: FbInsights; meta: ConnectorMeta }>;
  // writes（受 Permission / HR 管；帶冪等鍵）
  publishPost(
    input: { message: string; imageUrls: string[]; },
    opts: { idempotencyKey: string },
  ): Promise<{ data: { postId: string }; meta: ConnectorMeta }>;
  replyComment(
    input: { commentId: string; message: string },
    opts: { idempotencyKey: string },
  ): Promise<{ data: { commentId: string }; meta: ConnectorMeta }>;
}

export function createFacebookConnector(deps: ConnectorDeps): FacebookConnector {
  // token 失效 → ConnectorAuthError（升級，不重試）
  // 429 / code 4,17,32,613 → ConnectorRateLimitError（讀 X-App-Usage / Retry-After 後退避）
  return {} as FacebookConnector;
}

/** webhook 驗簽（§F.2-7）：X-Hub-Signature-256 = HMAC-SHA256(appSecret, rawBody) */
export function verifyWebhook(rawBody: string, signatureHeader: string, appSecret: string): boolean {
  // const expected = 'sha256=' + hmacSha256(appSecret, rawBody);
  // return timingSafeEqual(signatureHeader, expected);
  return false;
}
```

### F.4.3 `line` — LINE Messaging / Notify（推播，唯寫）

- **用途**：推播通知給老闆——HR 待審、成交、異常（§0.8；§0.6 HR）。
- **唯讀 / 讀寫**：**唯寫**（push only）。
- **需要的 scope / 權限**：Messaging API channel（`messages:write`）；或 LINE Notify token（若走 Notify）。
- **需要的 secret / env**：`LINE_CHANNEL_ACCESS_TOKEN`、`LINE_CHANNEL_SECRET`（webhook 驗簽用）、`LINE_BOSS_USER_ID`（推播對象）。
- **冪等**：推播帶 `idempotencyKey`（LINE 支援 `X-Line-Retry-Key`），避免重複推播同一則告警。

```ts
// packages/connectors/line/index.ts
export const CONNECTOR_ID = 'line' as const;
export const REQUIRED_SECRETS = [
  'LINE_CHANNEL_ACCESS_TOKEN', 'LINE_CHANNEL_SECRET', 'LINE_BOSS_USER_ID',
] as const;

export interface LineConnector {
  push(
    input: { to: string; text: string; },
    opts: { idempotencyKey: string },
  ): Promise<{ data: { requestId: string }; meta: ConnectorMeta }>;
  // 無 read 方法
}

export function createLineConnector(deps: ConnectorDeps): LineConnector {
  // 429 → ConnectorRateLimitError；401 → ConnectorAuthError
  // push 帶 X-Line-Retry-Key = opts.idempotencyKey
  return {} as LineConnector;
}
```

---

## F.5 準則：為什麼一律經 Connector

- **Agent/Loop 不得直接 fetch**（§0.8）。若你在 Agent 或 Loop 或 Skill 內看到 `fetch('https://...')` 打外部——那是缺陷，必須改走 connector。
- **好處**：憑證只在一處、rate limit 集中、重試策略一致、錯誤語意統一、可審計（每次對外呼叫都有 trace）、可被 mock 測試。
- **Skill 使用 connector 的方式**（見附錄 E §E.5）：透過注入的 `deps.connectors.<id>.<method>()`，不 `import` 具體實例。

---

## F.6 如何 mock Connector 做測試

每個 connector 提供一份 `create<Name>ConnectorMock`，實作同一 interface，回傳可控的假資料，並可斷言「被呼叫的參數」。

```ts
// packages/connectors/facebook/mock.ts
import type { FacebookConnector } from './index';

export function createFacebookConnectorMock(
  overrides: Partial<FacebookConnector> = {},
): { connector: FacebookConnector; calls: { publishPost: any[] } } {
  const calls = { publishPost: [] as any[] };
  const connector: FacebookConnector = {
    listComments: async () => ({ data: [], meta: baseMeta() }),
    getPostInsights: async () => ({ data: {} as any, meta: baseMeta() }),
    publishPost: async (input, opts) => {
      calls.publishPost.push({ input, opts });
      return { data: { postId: 'mock_post_123' }, meta: baseMeta() };
    },
    replyComment: async () => ({ data: { commentId: 'c1' }, meta: baseMeta() }),
    ...overrides,
  };
  return { connector, calls };
}
```

**測試準則**：

1. **Agent/Loop/Skill 測試一律注入 mock connector**，不打真 API。
2. 斷言**冪等鍵有傳**、**write 方法在未授權時不被呼叫**（Permission 生效）。
3. connector 自身的**單元測試**用 mock `deps.http`，斷言錯誤映射（429→RateLimit、5xx→Transient、401→Auth）、重試次數、rate limiter 有 acquire。
4. **webhook 驗簽**要有測試：合法簽章通過、竄改 body / 錯 secret 一律 false。

---

## 本章交付物 (Deliverables)

- Connector 契約 8 面向（§F.2）。
- 共用 core + 單一 connector 空白模板（§F.3）。
- 三個真實範例骨架 `drive` / `facebook` / `line`，各含 scope、secret、唯讀讀寫、冪等策略（§F.4）。
- Mock 準則與 connector 測試準則（§F.6）。

## 驗收條件 (Acceptance Criteria)

一個 Connector 可合併，當且僅當：

- [ ] 憑證只從 `deps.secrets` 讀，**不進 git、不進 log**；有輪替/refresh 路徑。
- [ ] read 與 write 方法分離；write 帶 `idempotencyKey`。
- [ ] 對暫時性錯誤退避重試，對 4xx（非 429）不重試；錯誤映射成 typed error。
- [ ] 有 rate limiter，尊重 `Retry-After` / API 配額。
- [ ] 有 inbound webhook 者提供 `verifyWebhook` 並驗簽。
- [ ] `REQUIRED_SCOPES` / `REQUIRED_SECRETS` 明列且為最小權限。
- [ ] 提供 mock 實作；自身有 http-mock 單元測試涵蓋錯誤映射與 webhook 驗簽。
- [ ] 全系統無 Agent/Loop/Skill 直接 `fetch` 外部 API（一律經此層）。
