import { defineStateMachine } from "../shared/state-machine";

/**
 * 款項代管（escrow）狀態機 —— 規劃書 §5.1 履約保障：
 * 買家付款 → 平台代管 → 送達驗收 → 無誤才撥付賣家；有爭議走爭議流程。
 * 對應 DB enum `escrow_status`（migration 20260708090000）。
 */
export const ESCROW_STATUS = [
  "pending_payment",
  "funds_held",
  "delivered",
  "released",
  "disputed",
  "refunded",
] as const;
export type EscrowStatus = (typeof ESCROW_STATUS)[number];

export const escrowMachine = defineStateMachine<EscrowStatus>({
  name: "escrow",
  initial: "pending_payment",
  transitions: {
    pending_payment: ["funds_held"],           // 買家付款 → 平台代管
    funds_held: ["delivered", "refunded"],     // 出貨送達；或出貨前取消退款
    delivered: ["released", "disputed"],       // 驗收無誤撥付；或提出爭議
    disputed: ["released", "refunded"],        // 爭議裁決：撥付賣家 或 退款買家
    released: [],                              // 終態：交易完成
    refunded: [],                              // 終態：已退款
  },
});

/** 商品來源（規劃書混合制）：own=自有現貨、brokered=撮合直送。 */
export const PRODUCT_SOURCE = ["own", "brokered"] as const;
export type ProductSource = (typeof PRODUCT_SOURCE)[number];
