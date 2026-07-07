import Anthropic from "@anthropic-ai/sdk";
import type { PricingTable } from "./cost";
import { MODELS } from "./models";
import type {
  ModelClient,
  ModelContentBlock,
  ModelMessage,
  ModelRequest,
  ModelResponse,
} from "./model-client";

/**
 * AnthropicModelClient —— 真 Claude 實作（§0.4 layer3 的 ModelClient）。
 * 取代 fake client 後 7 個 agent 就跑真模型。用 @anthropic-ai/sdk。
 *
 * 注意（依 claude-api）：
 * - Sonnet 5 / Opus 4.8 等會拒絕 temperature/top_p/top_k（400）→ 一律不送。
 * - thinking 省略即可（這些抽取/推理任務不需 extended thinking）。
 * - model id 一律走 MODELS.*，不硬寫。
 */
export class AnthropicModelClient implements ModelClient {
  private readonly client: Anthropic;
  private readonly maxTokens: number;

  constructor(opts?: { apiKey?: string; maxTokens?: number; client?: Anthropic }) {
    this.client = opts?.client ?? new Anthropic(opts?.apiKey ? { apiKey: opts.apiKey } : {});
    this.maxTokens = opts?.maxTokens ?? 4096;
  }

  /** 有 ANTHROPIC_API_KEY 才建立；否則回 null（讓上層回退 fake）。 */
  static fromEnv(maxTokens?: number): AnthropicModelClient | null {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    return new AnthropicModelClient({ maxTokens });
  }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    const message = await this.client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens ?? this.maxTokens,
      ...(req.system ? { system: req.system } : {}),
      messages: req.messages.map(toAnthropicMessage),
      // 不送 temperature/top_p/top_k：Sonnet 5 / Opus 4.8 會 400。
    });

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    return {
      text,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      },
    };
  }
}

function toAnthropicMessage(m: ModelMessage): Anthropic.MessageParam {
  if (typeof m.content === "string") {
    return { role: m.role, content: m.content };
  }
  return { role: m.role, content: m.content.map(toAnthropicBlock) };
}

function toAnthropicBlock(b: ModelContentBlock): Anthropic.ContentBlockParam {
  if (b.type === "text") return { type: "text", text: b.text };
  if (b.source.type === "url") {
    return { type: "image", source: { type: "url", url: b.source.url } };
  }
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: b.source.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
      data: b.source.data,
    },
  };
}

/**
 * MODEL_PRICING —— USD / 1M tokens。**上線前用 `claude-api` skill 覆核當前定價**（會變動）。
 * 值取自 claude-api（含 Sonnet 5 介紹價）。用於 agent_runs 成本記帳。
 */
export const MODEL_PRICING: PricingTable = {
  [MODELS.REASONING]: { inputPerMillionUsd: 3, outputPerMillionUsd: 15 },
  [MODELS.VISION]: { inputPerMillionUsd: 3, outputPerMillionUsd: 15 },
  [MODELS.FAST]: { inputPerMillionUsd: 1, outputPerMillionUsd: 5 },
};
