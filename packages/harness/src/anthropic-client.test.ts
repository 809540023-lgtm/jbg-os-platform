import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { AnthropicModelClient } from "./anthropic-client";

describe("AnthropicModelClient", () => {
  it("映射 request→Anthropic、抽文字與 usage，且不送 temperature", async () => {
    const create = vi.fn(async (_req: unknown) => ({
      content: [
        { type: "thinking", thinking: "…" },
        { type: "text", text: '{"ok":true}' },
      ],
      usage: { input_tokens: 123, output_tokens: 45 },
    }));
    const fakeSdk = { messages: { create } } as unknown as Anthropic;

    const client = new AnthropicModelClient({ client: fakeSdk, maxTokens: 2048 });
    const res = await client.complete({
      model: "test-model",
      system: "sys",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: "https://x/p.jpg" } },
            { type: "text", text: "看圖" },
          ],
        },
      ],
    });

    expect(res.text).toBe('{"ok":true}'); // 只取 text 區塊
    expect(res.usage).toEqual({ inputTokens: 123, outputTokens: 45 });

    const arg = create.mock.calls[0]![0] as unknown as Record<string, unknown>;
    expect(arg.model).toBe("test-model");
    expect(arg.max_tokens).toBe(2048);
    expect(arg.system).toBe("sys");
    expect("temperature" in arg).toBe(false); // Sonnet5/Opus4.8 會 400
    // image block 映射
    const msg = (arg.messages as { content: unknown[] }[])[0]!;
    expect(msg.content[0]).toEqual({ type: "image", source: { type: "url", url: "https://x/p.jpg" } });
  });

  it("字串 content 直接透傳", async () => {
    const create = vi.fn(async (_req: unknown) => ({ content: [{ type: "text", text: "hi" }], usage: { input_tokens: 1, output_tokens: 1 } }));
    const client = new AnthropicModelClient({ client: { messages: { create } } as unknown as Anthropic });
    await client.complete({ model: "m", messages: [{ role: "user", content: "hello" }] });
    const arg = create.mock.calls[0]![0] as unknown as { messages: { content: unknown }[] };
    expect(arg.messages[0]!.content).toBe("hello");
  });

  it("fromEnv：無 ANTHROPIC_API_KEY 回 null", () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(AnthropicModelClient.fromEnv()).toBeNull();
    if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
  });
});
