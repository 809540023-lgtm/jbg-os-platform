# 附錄 J · Git Flow

> 本附錄定義 JBG OS 的分支策略、commit 規範、PR 拆分、CI 必過項與 merge / release 流程。
> 對應 §0.10（命名規範）、§0.4（context 名可作為 commit scope）、`docs/12`（Claude Code 開發節奏）。
> 核心節奏：**一個 Todo = 一條分支 = 一個 PR = 一個 squash commit。**

---

## J.1 分支策略 (Branching) — trunk-based，短命分支

只有一條長命分支：**`main`**。`main` 永遠可部署（Vercel 直接上），受保護、不可直接 push。

所有工作在**短命 feature 分支**上進行，做完就 merge、隨即刪除。**不用 develop / release 長命分支**（避免 GitFlow 的合併地獄）。

### 分支命名

`<type>/<context>-<short-slug>`，全 `kebab-case`。`<type>` 與 commit type 同義，`<context>` 用 §0.4 的 Bounded Context / Loop 名。

| Prefix | 用途 | 範例 |
|---|---|---|
| `feat/` | 新功能 | `feat/pricing-price-agent-confidence` |
| `fix/` | 修 bug | `fix/loop-idempotent-publish` |
| `chore/` | 雜項（deps、設定、CI） | `chore/ci-add-migration-check` |
| `docs/` | 文件 | `docs/appendix-k-human-review` |
| `refactor/` | 不改行為的重構 | `refactor/catalog-product-assembler` |
| `test/` | 只加測試 / eval | `test/eval-marketing-compliance` |
| `hotfix/` | 生產緊急修 | `hotfix/facebook-token-refresh` |

- 分支存活**目標 < 2 天**；越久越難 merge。
- 一條分支只做一個 Todo；發現要順手改別的 → 另開分支。

---

## J.2 Commit 規範 (Conventional Commits)

格式：

```
<type>(<scope>): <subject>

<body 選填：為什麼這樣做，不是重述做了什麼>

<footer 選填：BREAKING CHANGE / Closes #123 / Co-Authored-By>
```

### type（與分支 prefix 對齊）
`feat` · `fix` · `chore` · `docs` · `refactor` · `test`
（可選：`perf` · `style` · `build` · `ci`）

### scope（用 context 名，見 §0.4 / §0.10）
`catalog` · `pricing` · `perception` · `loop` · `agent` · `memory` · `channel` · `governance`
或更細的 Loop / Agent 代號：`price` · `marketing` · `reviewer` · `publisher` · `vision` · `ocr` · `drive` · `facebook` · `line`。

### 規則
- subject 用**祈使句、現在式、小寫開頭、不加句號**：`add`, `fix`, `remove`（不是 `added` / `Adds`）。
- subject ≤ 72 字元。
- 破壞性變更（動到 `docs/00` 合約、DB schema 不相容）：footer 加 `BREAKING CHANGE: <說明>`。
- 關聯 issue / Todo：footer `Closes #123`。

### 範例
```
feat(pricing): add confidence threshold to PriceSuggestion

Price Agent 低於 0.6 信心時改走 human-review，避免自動套用高風險定價。
門檻走 Policy 設定，不硬寫。

Closes #142
```
```
fix(loop): make [publish] step idempotent on webhook retry

Publisher 重送時用 listing_id + external_post_id 去重，避免重複發 FB。
```

---

## J.3 PR 大小與拆分原則

- **一個 Todo = 一個 PR**；理想 diff **< ~400 行**（migration / 生成檔可豁免但要標注）。
- PR 只做一件事；**不夾帶無關重構**（重構另開 `refactor/*`）。
- 若一個 Todo 太大 → 拆成「schema/migration PR」→「service/agent PR」→「UI PR」序列，並在 PR 描述標明依賴順序。
- 動到 `docs/00` 合約的變更**單獨成一個 PR**（或至少獨立 commit），讓 reviewer 一眼看到合約異動。
- 每個 PR 都要能獨立通過 CI 且不讓 `main` 壞掉。

---

## J.4 CI 必過項 (Required Checks)

以下**全綠**才可 merge（設為 branch protection 的 required checks）：

| Check | 指令（範例） | 把關什麼 |
|---|---|---|
| **typecheck** | `pnpm typecheck` (`tsc --noEmit`) | TS strict、無 `any` 漏網 |
| **lint** | `pnpm lint` (ESLint + Prettier) | 命名 / 風格 / import 規範 |
| **test** | `pnpm test` | 單元 / 整合測試 |
| **migration check** | 跑 migration up→down→up、檢查與 schema 對齊 | migration 可逆、不破壞資料 |
| **eval（選配）** | `pnpm eval:ci`（只跑受影響 agent） | Agent 輸出品質不退化（§0.4 #10） |
| **build** | `next build` | 生產可建置 |

> 另建議加 **RLS / policy lint**：檢查新 table 是否有 `enable row level security` + 至少一條 policy（呼應 §0.9 「預設 deny」）。

---

## J.5 Merge 策略 (Squash) 與保護規則

- **Merge 方式：Squash and merge**（一個 PR → `main` 上一個 commit）。
  - squash 後的 commit message 用 PR 標題（維持 Conventional Commits 格式），body 引用 PR 編號與 Acceptance。
  - 保持 `main` 線性歷史，好 revert、好讀 changelog。
- **禁止**直接 push `main`；禁止 force-push `main`。
- Branch protection：required checks 全綠 + **至少 1 個 approve**（人或 `reviewer` agent，見附錄 I）。
- merge 後**自動刪除**該 feature 分支。

---

## J.6 版本、Tag、Changelog

- 採 **Semantic Versioning** `vMAJOR.MINOR.PATCH`。
  - `MAJOR`：破壞性合約變更（`docs/00` 不相容 / 不可逆 migration）。
  - `MINOR`：新增功能、向後相容。
  - `PATCH`：修 bug / 文件 / 小改。
- Release 時打 tag：`git tag -a v1.3.0 -m "..."`。
- **Changelog 自動生成**：由 Conventional Commits 聚合（`feat`→Features、`fix`→Fixes、`BREAKING CHANGE`→醒目標注），維護 `CHANGELOG.md`。
- 建議工具：`changesets` 或 `release-please`（依 Conventional Commits 自動開 release PR + 生 changelog + 打 tag）。

---

## J.7 Hotfix 流程

生產出事時：

1. 從 **`main`** 開 `hotfix/<context>-<slug>`（不從別的 feature 分支開）。
2. 最小改動修好；補一個能重現 bug 的測試。
3. 走完整 CI（可標 `priority` 加速 review），至少 1 approve。
4. **Squash merge 回 `main`** → 立即部署。
5. 打 patch tag（`v1.3.1`），更新 changelog。
6. 事後補：在對應章節 / Eval / Memory 記下 root cause，避免復發（見附錄 K「回饋成 Eval/Memory」）。

> 因為是 trunk-based（只有 `main`），hotfix 不需要 cherry-pick 回多條分支——這正是短命分支策略的好處。

---

## J.8 與 Claude Code 開發節奏的銜接（見 docs/12）

`docs/12` 把工作拆成一串 **Todo**。本附錄把每個 Todo 對映到 git 流程：

```
docs/12 Todo
   └─ 開分支  feat/<context>-<slug>          (J.1)
        └─ 多個 commit  <type>(<scope>): ...  (J.2)
             └─ 開 PR，帶出模板              (附錄 I.2)
                  └─ CI 全綠 + reviewer approve (J.4 / 附錄 I.3)
                       └─ Squash merge → main  (J.5)
                            └─ 刪分支、更新 changelog (J.6)
```

給 Claude Code 的操作準則：
- 開工前先開分支，**不要在 `main` 上改**。
- 一個 Todo 做完就開 PR、跑 CI、請 review；**不要攢一堆 Todo 一次 push**。
- commit message 用 Conventional Commits，scope 用該 Todo 所屬 context。
- PR 描述直接引用該 Todo 對應章節的 Acceptance（附錄 I 模板已內建欄位）。
- CI 沒過 / reviewer reject → 在同一分支修，不要開新分支繞過。

---

## 本章交付物 (Deliverables)
- 分支命名表與 trunk-based 策略（J.1）。
- Conventional Commits 規範 + scope 清單 + 範例（J.2）。
- PR 拆分原則、CI required checks、squash merge 與保護規則（J.3–J.5）。
- 版本 / tag / changelog / hotfix 流程（J.6–J.7）。
- Todo → 分支 → PR → merge 的節奏對映（J.8）。

## 驗收條件 (Acceptance Criteria)
- [ ] `main` 已設 branch protection：required checks 全綠 + ≥1 approve + 禁 direct push。
- [ ] repo 有 commitlint / hook 或 CI 檢查 Conventional Commits 格式（type + scope）。
- [ ] CI 至少涵蓋 typecheck / lint / test / migration check 且皆為 required。
- [ ] merge 一律 squash，merge 後自動刪分支；changelog 由 commit 自動生成。
- [ ] 每個 Todo 可追溯到唯一一條分支與一個 PR。
