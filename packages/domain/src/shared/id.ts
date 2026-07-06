import { randomUUID } from "node:crypto";

/** Branded UUID —— 讓不同實體的 id 型別不可互換誤用。 */
export type Id<Brand extends string> = string & { readonly __brand: Brand };

export const newId = <Brand extends string>(): Id<Brand> =>
  randomUUID() as Id<Brand>;

export const asId = <Brand extends string>(value: string): Id<Brand> =>
  value as Id<Brand>;

export type LoopId = Id<"Loop">;
export type LoopExecutionId = Id<"LoopExecution">;
export type LoopStepId = Id<"LoopStep">;
export type AgentId = Id<"Agent">;
export type AgentRunId = Id<"AgentRun">;
export type ProductId = Id<"Product">;
export type ProductPhotoId = Id<"ProductPhoto">;
export type ActorId = Id<"Actor">;
export type HumanReviewId = Id<"HumanReview">;
