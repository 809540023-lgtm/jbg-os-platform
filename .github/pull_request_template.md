<!-- 完整版見 docs/appendix/I-pr-review-template.md -->

## 這個 PR 做了什麼
<!-- 一句話。對應哪一章 / 哪個 Todo 的 Acceptance Criteria？ -->
- 對應章節 / Acceptance：`docs/__`
- 對應 Todo（docs/12）：#__

## 動到的東西
- [ ] Entity / domain：
- [ ] DB migration（可逆？seed 是否更新？）：
- [ ] API endpoint（`/api/<context>/<resource>`，遵附錄 C？）：
- [ ] Agent / Loop / Skill：
- [ ] Connector（新增對外副作用？→ 是否過 Permission / Human Review？）：

## 合約一致性（docs/00）
- [ ] 未偏離 §0.5 Entity 名 / §0.6 Agent 代號 / §0.7 Loop 階段 / §0.11 狀態機 enum
- [ ] 命名遵附錄 C（API）/ D（DB）
- [ ] 外部 `fetch` 只在 `packages/connectors/`（§0.8）
- [ ] 未硬寫模型 id（走 `MODELS.*`）/ 金額用整數 `_amount`+`_currency`
- [ ] RLS / PolicyEngine 到位（§0.9）

## 測試與 Eval
- [ ] 單元 / 整合測試
- [ ] Eval（若動到 Agent 輸出品質）
- [ ] 截圖 / 錄影（若動到 UI）

## 風險 & 備註
<!-- 不確定處、後續 TODO、需要人審決策的地方 -->
