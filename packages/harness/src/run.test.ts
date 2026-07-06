import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ModelClient, ModelResponse } from "./model-client";
import { ModelOutputInvalidError, runModel } from "./run";

const schema = z.object({ brand: z.string(), confidence: z.number().min(0).max(1) });

function clientReturning(...texts: string[]): ModelClient {
  let i = 0;
  return {
    complete: vi.fn(async (): Promise<ModelResponse> => {
      const text = texts[Math.min(i, texts.length - 1)]!;
      i += 1;
      return { text, usage: { inputTokens: 100, outputTokens: 20 } };
    }),
  };
}

describe("runModel (harness §0.4 layer3)", () => {
  it("有效輸出：一次通過、回傳解析後的值並記帳", async () => {
    const client = clientReturning('{"brand":"Chanel","confidence":0.9}');
    const res = await runModel({
      client,
      model: "test-model",
      messages: [{ role: "user", content: "看這張圖" }],
      schema,
      pricing: { "test-model": { inputPerMillionUsd: 3, outputPerMillionUsd: 15 } },
    });
    expect(res.value.brand).toBe("Chanel");
    expect(res.attempts).toBe(1);
    expect(res.usage.inputTokens).toBe(100);
    expect(res.cost.costUsd).toBeCloseTo((100 / 1e6) * 3 + (20 / 1e6) * 15, 10);
    expect(res.cost.pricingMissing).toBe(false);
  });

  it("容忍 ```json 包裹與雜訊", async () => {
    const client = clientReturning('這是結果:\n```json\n{"brand":"Nike","confidence":0.7}\n```');
    const res = await runModel({
      client,
      model: "m",
      messages: [{ role: "user", content: "x" }],
      schema,
    });
    expect(res.value.brand).toBe("Nike");
  });

  it("壞輸出先被擋、重試後轉好 → 成功且累計 usage", async () => {
    const client = clientReturning(
      '{"brand":"X"}', // 缺 confidence
      '{"brand":"Gucci","confidence":0.8}',
    );
    const res = await runModel({
      client,
      model: "m",
      messages: [{ role: "user", content: "x" }],
      schema,
      maxRetries: 2,
    });
    expect(res.value.brand).toBe("Gucci");
    expect(res.attempts).toBe(2);
    expect(res.usage.outputTokens).toBe(40); // 兩次呼叫累計
    expect(client.complete).toHaveBeenCalledTimes(2);
  });

  it("持續壞輸出 → 用盡重試後拋 ModelOutputInvalidError", async () => {
    const client = clientReturning('{"nope":true}');
    await expect(
      runModel({
        client,
        model: "m",
        messages: [{ role: "user", content: "x" }],
        schema,
        maxRetries: 1,
      }),
    ).rejects.toBeInstanceOf(ModelOutputInvalidError);
    expect(client.complete).toHaveBeenCalledTimes(2); // 1 + 1 retry
  });

  it("未知 model 定價缺失 → pricingMissing=true、成本以 0 計", async () => {
    const client = clientReturning('{"brand":"A","confidence":0.5}');
    const res = await runModel({
      client,
      model: "unknown",
      messages: [{ role: "user", content: "x" }],
      schema,
    });
    expect(res.cost.pricingMissing).toBe(true);
    expect(res.cost.costUsd).toBe(0);
  });
});
