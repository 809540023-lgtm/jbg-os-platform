import type { LoopExecutionStatus, StepStatus } from "@jbg/db";
import { defineStateMachine } from "../shared/state-machine";

/**
 * LoopExecution 狀態機 —— docs/00 §0.11 權威定義：
 * queued → running → waiting_human → running → succeeded / failed / cancelled
 */
export const loopExecutionMachine = defineStateMachine<LoopExecutionStatus>({
  name: "loop_execution",
  initial: "queued",
  transitions: {
    queued: ["running", "cancelled"],
    running: ["waiting_human", "succeeded", "failed", "cancelled"],
    waiting_human: ["running", "cancelled", "failed"],
    succeeded: [],
    failed: [],
    cancelled: [],
  },
});

/** 單一步驟狀態機（loop_steps.status）。 */
export const loopStepMachine = defineStateMachine<StepStatus>({
  name: "loop_step",
  initial: "pending",
  transitions: {
    pending: ["running", "skipped"],
    running: ["succeeded", "failed"],
    succeeded: [],
    failed: [],
    skipped: [],
  },
});
