import type { z } from "zod";
import { computeCost, type CostRecord, type PricingTable } from "./cost";
import type { ModelClient, ModelMessage, ModelUsage } from "./model-client";

/**
 * runModel —— Harness 的核心（§0.4 layer 3）：
 * 呼叫模型 → 解析 JSON → 用 zod schema 驗證 → 失敗自動重試（帶糾正訊息）→ 記帳。
 * 模型呼叫透過注入的 ModelClient，讓上層在無 API key 下可測。
 */

export interface RunModelParams<T> {
  client: ModelClient;
  /** 一律傳 MODELS.* 常數。 */
  model: string;
  system?: string;
  messages: ModelMessage[];
  /** 輸出契約；模型回傳必須通過此 schema 才算成功。 */
  schema: z.ZodType<T>;
  maxRetries?: number;
  maxTokens?: number;
  temperature?: number;
  pricing?: PricingTable;
}

export interface RunModelResult<T> {
  value: T;
  attempts: number;
  usage: ModelUsage;
  cost: CostRecord;
  raw: string;
}

export class ModelOutputInvalidError extends Error {
  constructor(
    public readonly attempts: number,
    public readonly lastRaw: string,
    public readonly issues: string,
  ) {
    super(`模型輸出在 ${attempts} 次嘗試後仍不符 schema：${issues}`);
    this.name = "ModelOutputInvalidError";
  }
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // 容忍 ```json ... ``` 包裹或前後雜訊：取第一個 { 到最後一個 }。
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1]! : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  const slice = start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate;
  return JSON.parse(slice);
}

export async function runModel<T>(params: RunModelParams<T>): Promise<RunModelResult<T>> {
  const { client, model, system, schema, maxTokens, temperature } = params;
  const maxRetries = params.maxRetries ?? 2;
  const pricing = params.pricing ?? {};

  const messages: ModelMessage[] = [...params.messages];
  const totalUsage: ModelUsage = { inputTokens: 0, outputTokens: 0 };
  let lastRaw = "";
  let lastIssues = "";

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    const res = await client.complete({ model, system, messages, maxTokens, temperature });
    totalUsage.inputTokens += res.usage.inputTokens;
    totalUsage.outputTokens += res.usage.outputTokens;
    lastRaw = res.text;

    let parsed: unknown;
    try {
      parsed = extractJson(res.text);
    } catch {
      lastIssues = "回傳非合法 JSON";
      messages.push({ role: "assistant", content: res.text });
      messages.push({
        role: "user",
        content: "你的回覆不是合法 JSON。請只回傳符合契約的 JSON，不要任何額外文字。",
      });
      continue;
    }

    const check = schema.safeParse(parsed);
    if (check.success) {
      return {
        value: check.data,
        attempts: attempt,
        usage: totalUsage,
        cost: computeCost(model, totalUsage, pricing),
        raw: res.text,
      };
    }

    lastIssues = check.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    messages.push({ role: "assistant", content: res.text });
    messages.push({
      role: "user",
      content: `你的輸出不符 schema：${lastIssues}。請修正後只回傳合法 JSON。`,
    });
  }

  throw new ModelOutputInvalidError(maxRetries + 1, lastRaw, lastIssues);
}
