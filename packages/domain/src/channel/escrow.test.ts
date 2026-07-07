import { describe, expect, it } from "vitest";
import { IllegalTransitionError } from "../shared/state-machine";
import { escrowMachine } from "./escrow";

describe("escrowMachine（規劃書 §5.1 款項代管）", () => {
  it("正常流程：付款→代管→送達→驗收撥付", () => {
    expect(escrowMachine.canTransition("pending_payment", "funds_held")).toBe(true);
    expect(escrowMachine.canTransition("funds_held", "delivered")).toBe(true);
    expect(escrowMachine.canTransition("delivered", "released")).toBe(true);
    expect(escrowMachine.isTerminal("released")).toBe(true);
  });

  it("爭議流程：送達→爭議→裁決（撥付或退款）", () => {
    expect(escrowMachine.canTransition("delivered", "disputed")).toBe(true);
    expect(escrowMachine.canTransition("disputed", "released")).toBe(true);
    expect(escrowMachine.canTransition("disputed", "refunded")).toBe(true);
    expect(escrowMachine.isTerminal("refunded")).toBe(true);
  });

  it("關鍵保護：未送達不得撥付、未代管不得出貨", () => {
    expect(escrowMachine.canTransition("funds_held", "released")).toBe(false); // 沒驗收不能撥款
    expect(escrowMachine.canTransition("pending_payment", "delivered")).toBe(false); // 沒付款不出貨
    expect(escrowMachine.canTransition("pending_payment", "released")).toBe(false);
    expect(() => escrowMachine.assertTransition("funds_held", "released")).toThrow(IllegalTransitionError);
  });

  it("終態不可再轉移", () => {
    expect(escrowMachine.canTransition("released", "refunded")).toBe(false);
    expect(escrowMachine.canTransition("refunded", "funds_held")).toBe(false);
  });
});
