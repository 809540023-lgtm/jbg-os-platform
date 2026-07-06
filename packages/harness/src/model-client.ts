/**
 * ModelClient —— 抽象的模型呼叫介面（§0.4 layer 3 Harness）。
 * 正式環境用 Anthropic SDK 實作（AnthropicModelClient）；測試注入 fake。
 * 這讓 harness / agent runtime 在無 API key 下可被單元測試。
 */

export interface ModelMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ModelRequest {
  /** 一律傳 MODELS.* 常數，不硬寫版本字串（§0.3）。 */
  model: string;
  system?: string;
  messages: ModelMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ModelResponse {
  text: string;
  usage: ModelUsage;
}

export interface ModelClient {
  complete(req: ModelRequest): Promise<ModelResponse>;
}
