import { describe, expect, it } from "vitest";
import { IllegalTransitionError } from "../shared/state-machine";
import { loopExecutionMachine } from "./state";

describe("loopExecutionMachine (§0.11)", () => {
  it("允許合法轉移", () => {
    expect(loopExecutionMachine.canTransition("queued", "running")).toBe(true);
    expect(loopExecutionMachine.canTransition("running", "waiting_human")).toBe(true);
    expect(loopExecutionMachine.canTransition("waiting_human", "running")).toBe(true);
    expect(loopExecutionMachine.canTransition("running", "succeeded")).toBe(true);
    expect(loopExecutionMachine.canTransition("running", "failed")).toBe(true);
  });

  it("擋下非法轉移", () => {
    expect(loopExecutionMachine.canTransition("queued", "succeeded")).toBe(false);
    expect(loopExecutionMachine.canTransition("succeeded", "running")).toBe(false);
    expect(loopExecutionMachine.canTransition("failed", "running")).toBe(false);
    expect(() => loopExecutionMachine.assertTransition("queued", "succeeded")).toThrow(
      IllegalTransitionError,
    );
  });

  it("終態被正確標記", () => {
    expect(loopExecutionMachine.isTerminal("succeeded")).toBe(true);
    expect(loopExecutionMachine.isTerminal("failed")).toBe(true);
    expect(loopExecutionMachine.isTerminal("cancelled")).toBe(true);
    expect(loopExecutionMachine.isTerminal("running")).toBe(false);
  });
});
