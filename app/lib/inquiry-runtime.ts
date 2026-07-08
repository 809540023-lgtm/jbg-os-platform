import {
  AgentRunner,
  inquiryAgent,
  type InquiryInput,
  type InquiryReply,
} from "@jbg/domain";
import { AnthropicModelClient, MODEL_PRICING, type ModelClient, type ModelRequest } from "@jbg/harness";
import { SupabaseInquiryRepo, createSupabaseAgentRepos, type SupabaseClient } from "@jbg/persistence";
import { formatPrice } from "@/lib/site";

/**
 * Inquiry Agent runtime —— 為一則詢問產生 AI 回覆草稿並存 DB。
 * 有 ANTHROPIC_API_KEY → 真 Claude；否則用規則式 fake（demo 不需 key 也能跑）。
 * 送出動作不在此（守則#4：由客服在 /inquiries 核定送出）。
 */

const HIGH_RISK: { re: RegExp; intent: InquiryReply["intent"] }[] = [
  { re: /(便宜|議價|殺價|少一點|折|優惠價|можно|discount)/i, intent: "price" },
  { re: /(保固|保修|壞掉|故障|維修|退|換貨|不能用)/i, intent: "complaint" },
  { re: /(安裝|到府|保證|一定|包|承諾)/i, intent: "warranty" },
];

/** 規則式 fake：辨識高風險意圖轉人審，否則就商品卡事實作答。 */
function fakeReply(input: InquiryInput): InquiryReply {
  const msg = input.message;
  const hr = HIGH_RISK.find((h) => h.re.test(msg));
  if (hr) {
    return {
      inquiryId: input.inquiryId,
      intent: hr.intent,
      reply: "您好，關於這部分我請專人為您處理，稍後由同仁與您聯繫確認細節，謝謝！",
      confidence: 0.9,
      requiresHumanReview: true,
      handoffNote: `高風險意圖(${hr.intent})：買家訊息「${msg}」需人工回覆。`,
    };
  }
  const pc = input.productCard;
  const attrs = pc.attributes.map((a) => `${a.key}：${a.value}`).join("、");
  const inStock = pc.status === "published";
  return {
    inquiryId: input.inquiryId,
    intent: /現貨|還在|有貨|庫存/.test(msg) ? "availability" : /地區|自取|哪裡|運|送/.test(msg) ? "location" : "spec",
    reply: `您好！這台「${pc.title ?? "設備"}」售價 ${pc.price}，成色${pc.condition}。${attrs ? `規格：${attrs}。` : ""}${inStock ? "目前為現貨，" : "整備中，"}全部經結構化驗機、可到府安裝、款項代管驗收無誤才撥款。需要進一步協助嗎？`,
    confidence: 0.82,
    requiresHumanReview: false,
    handoffNote: null,
  };
}

function fakeClient(): ModelClient {
  return {
    complete: async (req: ModelRequest) => {
      // 從 messages 還原 InquiryInput（buildMessages 塞在 user content 內）
      const text = typeof req.messages[0]?.content === "string" ? req.messages[0].content : "";
      const cardMatch = text.match(/商品卡: (.*)/);
      const msgMatch = text.match(/買家提問: (.*)/);
      const input: InquiryInput = {
        inquiryId: "x",
        message: msgMatch?.[1] ?? "",
        customerHandle: null,
        channel: "web",
        productCard: cardMatch?.[1] ? JSON.parse(cardMatch[1]) : { title: null, price: "價格洽詢", condition: "-", status: "published", attributes: [], description: null },
      };
      return { text: JSON.stringify(fakeReply(input)), usage: { inputTokens: 60, outputTokens: 40 } };
    },
  };
}

/** 為一則詢問跑 Inquiry Agent，存草稿。回傳草稿與是否需人審。 */
export async function draftInquiryReply(
  db: SupabaseClient,
  inquiryId: string,
): Promise<{ reply: string; requiresHumanReview: boolean } | null> {
  const repo = new SupabaseInquiryRepo(db);
  const inq = await repo.get(inquiryId);
  if (!inq || !inq.productId) return null;

  const input: InquiryInput = {
    inquiryId: inq.id,
    message: inq.message ?? "",
    customerHandle: inq.customerHandle,
    channel: (inq.channel as InquiryInput["channel"]) ?? "web",
    productCard: {
      title: inq.productTitle,
      price: formatPrice(inq.productPrice, inq.productCurrency),
      condition: inq.productCondition ?? "-",
      status: inq.productStatus ?? "published",
      attributes: inq.productAttributes,
      description: inq.productDescription,
    },
  };

  const realClient = AnthropicModelClient.fromEnv();
  const runner = new AgentRunner({
    client: realClient ?? fakeClient(),
    repos: createSupabaseAgentRepos(db),
    pricing: realClient ? MODEL_PRICING : undefined,
  });
  const outcome = await runner.run(inquiryAgent, input);
  await repo.saveDraft(inq.id, {
    reply: outcome.output.reply,
    confidence: outcome.output.confidence,
    requiresHuman: outcome.requiresHumanReview,
  });
  return { reply: outcome.output.reply, requiresHumanReview: outcome.requiresHumanReview };
}
