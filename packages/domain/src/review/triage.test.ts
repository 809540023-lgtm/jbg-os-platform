import { describe, expect, it } from "vitest";
import { triageReview } from "./triage";

describe("triageReview（規劃書 §5.2 人審智能分流）", () => {
  it("高信心 + 低金額的估價 → 建議自動放行", () => {
    const r = triageReview({ targetKind: "price_suggestion", confidence: 0.9, amount: 18000 });
    expect(r.recommendation).toBe("auto_pass");
  });

  it("低信心估價 → 需人工", () => {
    const r = triageReview({ targetKind: "price_suggestion", confidence: 0.7, amount: 18000 });
    expect(r.recommendation).toBe("needs_human");
    expect(r.reasons[0]).toContain("信心");
  });

  it("高價估價（超上限）→ 需人工，即使信心高", () => {
    const r = triageReview({ targetKind: "price_suggestion", confidence: 0.95, amount: 55000 });
    expect(r.recommendation).toBe("needs_human");
    expect(r.reasons.some((x) => x.includes("高價"))).toBe(true);
  });

  it("首次上架文案 → 一律人工（合規）", () => {
    expect(triageReview({ targetKind: "listing", confidence: 0.99, amount: null }).recommendation).toBe("needs_human");
  });

  it("無信心資料 → 保守人工", () => {
    expect(triageReview({ targetKind: "price_suggestion", confidence: null, amount: 10000 }).recommendation).toBe("needs_human");
  });
});
