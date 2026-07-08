import { describe, expect, it } from "vitest";
import { inquiryAgent, INQUIRY_CONFIDENCE_FLOOR } from "./agent";
import { inquiryReplySchema, type InquiryReply } from "./schema";

const base: InquiryReply = {
  inquiryId: "i1",
  intent: "spec",
  reply: "這台是萬利多 500 磅製冰機，220V。",
  confidence: 0.9,
  requiresHumanReview: false,
  handoffNote: null,
};

describe("inquiryAgent（canonical §0.6 客服）", () => {
  it("低風險 + 高信心 → 可自動回（不需人審）", () => {
    expect(inquiryAgent.requiresHumanReview?.(base, {} as never)).toBe(false);
  });

  it("守則#4：議價/保固承諾/客訴 → 強制人審，即使 agent 說不用", () => {
    for (const intent of ["price", "warranty", "complaint"] as const) {
      const out = { ...base, intent, requiresHumanReview: false, confidence: 0.95 };
      expect(inquiryAgent.requiresHumanReview?.(out, {} as never)).toBe(true);
    }
  });

  it("低信心（< 門檻）→ 人審", () => {
    const out = { ...base, confidence: INQUIRY_CONFIDENCE_FLOOR - 0.01 };
    expect(inquiryAgent.requiresHumanReview?.(out, {} as never)).toBe(true);
  });

  it("agent 自評需人審 → 人審", () => {
    expect(inquiryAgent.requiresHumanReview?.({ ...base, requiresHumanReview: true }, {} as never)).toBe(true);
  });

  it("schema 驗證：reply 不可空、confidence 0..1", () => {
    expect(inquiryReplySchema.safeParse(base).success).toBe(true);
    expect(inquiryReplySchema.safeParse({ ...base, reply: "" }).success).toBe(false);
    expect(inquiryReplySchema.safeParse({ ...base, confidence: 1.5 }).success).toBe(false);
  });

  it("code 為 canonical inquiry、用 FAST 模型", () => {
    expect(inquiryAgent.code).toBe("inquiry");
    expect(inquiryAgent.model).toBeTruthy();
  });
});
