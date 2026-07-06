import type { z } from "zod";

export * from "./publish-listing";
export * from "./product-lifecycle-executor";

/**
 * @jbg/skills —— 可被 Agent/Loop 呼叫的能力單元（§0.4 layer6，附錄 E）。
 * Skill id：kebab-case、動詞開頭。skills 可依賴 connectors + domain（附錄 A.1.1）。
 */
export interface Skill<I = unknown, O = unknown> {
  id: string;
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  run: (input: I) => Promise<O>;
}

export const skillRegistry: Record<string, Skill> = {};

export function registerSkill<I, O>(skill: Skill<I, O>): void {
  skillRegistry[skill.id] = skill as unknown as Skill;
}

export function getSkill(id: string): Skill {
  const skill = skillRegistry[id];
  if (!skill) throw new Error(`未知 skillId: ${id}`);
  return skill;
}
