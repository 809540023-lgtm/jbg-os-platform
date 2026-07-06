/**
 * @jbg/prompts —— 版本化 prompt 模板（§0.4 layer1）。
 * 每個 canonical Agent（§0.6）一個資料夾；registry: promptId → 版本。
 * 內容在 Todo 5+（各 Agent）逐步填入；此處先提供 registry 骨架。
 */
export interface PromptRegistryEntry {
  id: string;
  version: number;
  template: string;
}

export const promptRegistry: Record<string, PromptRegistryEntry> = {};

export function getPrompt(id: string): PromptRegistryEntry {
  const entry = promptRegistry[id];
  if (!entry) throw new Error(`未知 promptId: ${id}`);
  return entry;
}
