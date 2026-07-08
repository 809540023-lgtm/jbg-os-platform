import type { CatalogAttribute } from "./catalog-read";
import type { SupabaseClient } from "./client";

/** Inquiry（客服詢問）讀寫 —— canonical §0.6 v1.1。 */

export interface InquiryRow {
  id: string;
  productId: string | null;
  status: string;
  channel: string;
  customerHandle: string | null;
  message: string | null;
  aiDraft: string | null;
  aiConfidence: number | null;
  aiRequiresHuman: boolean | null;
  answer: string | null;
  answeredAt: string | null;
  createdAt: string;
  // join 進來的商品資訊（列表顯示用）
  productTitle: string | null;
  productPrice: number | null;
  productCurrency: string | null;
  productCondition: string | null;
  productStatus: string | null;
  productAttributes: CatalogAttribute[];
  productDescription: string | null;
}

interface RawRow {
  id: string;
  product_id: string | null;
  status: string;
  channel: string;
  customer_handle: string | null;
  message: string | null;
  ai_draft: string | null;
  ai_confidence: number | null;
  ai_requires_human: boolean | null;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
  products: {
    title: string | null;
    price_amount: number | null;
    price_currency: string | null;
    condition: string | null;
    status: string | null;
    attributes: unknown;
    description: string | null;
  } | null;
}

function toDomain(r: RawRow): InquiryRow {
  // Supabase 對 to-one FK embed 的型別會推成陣列，但執行期為單一物件——兩者都容忍。
  const p = (Array.isArray(r.products) ? r.products[0] : r.products) ?? null;
  const attrs = Array.isArray(p?.attributes) ? (p?.attributes as CatalogAttribute[]) : [];
  return {
    id: r.id,
    productId: r.product_id,
    status: r.status,
    channel: r.channel,
    customerHandle: r.customer_handle,
    message: r.message,
    aiDraft: r.ai_draft,
    aiConfidence: r.ai_confidence,
    aiRequiresHuman: r.ai_requires_human,
    answer: r.answer,
    answeredAt: r.answered_at,
    createdAt: r.created_at,
    productTitle: p?.title ?? null,
    productPrice: p?.price_amount ?? null,
    productCurrency: p?.price_currency ?? null,
    productCondition: p?.condition ?? null,
    productStatus: p?.status ?? null,
    productAttributes: attrs.filter((a) => a && typeof a.key === "string"),
    productDescription: p?.description ?? null,
  };
}

const SELECT =
  "id, product_id, status, channel, customer_handle, message, ai_draft, ai_confidence, ai_requires_human, answer, answered_at, created_at, products ( title, price_amount, price_currency, condition, status, attributes, description )";

export class SupabaseInquiryRepo {
  constructor(private readonly db: SupabaseClient) {}

  /** 建立詢問（來自網站商品頁表單）。回傳 id。 */
  async create(input: {
    productId: string;
    message: string;
    customerHandle: string | null;
    channel?: string;
  }): Promise<string> {
    const { data, error } = await this.db
      .from("inquiries")
      .insert({
        product_id: input.productId,
        message: input.message,
        customer_handle: input.customerHandle,
        channel: input.channel ?? "web",
        status: "new",
      })
      .select("id")
      .single<{ id: string }>();
    if (error) throw new Error(`inquiry.create: ${error.message}`);
    return data.id;
  }

  /** 存 AI 草稿與風險判斷；狀態轉 in_progress。 */
  async saveDraft(
    id: string,
    draft: { reply: string; confidence: number; requiresHuman: boolean },
  ): Promise<void> {
    const { error } = await this.db
      .from("inquiries")
      .update({
        ai_draft: draft.reply,
        ai_confidence: draft.confidence,
        ai_requires_human: draft.requiresHuman,
        status: "in_progress",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw new Error(`inquiry.saveDraft: ${error.message}`);
  }

  /** 客服核定送出：寫入 answer、轉 answered。 */
  async markAnswered(id: string, answer: string): Promise<void> {
    const { error } = await this.db
      .from("inquiries")
      .update({
        answer,
        status: "answered",
        answered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw new Error(`inquiry.markAnswered: ${error.message}`);
  }

  async get(id: string): Promise<InquiryRow | null> {
    const { data, error } = await this.db.from("inquiries").select(SELECT).eq("id", id).maybeSingle();
    if (error) throw new Error(`inquiry.get: ${error.message}`);
    return data ? toDomain(data as unknown as RawRow) : null;
  }

  /** 客服面板：未結案（new/in_progress）優先，最新在前。 */
  async listOpen(limit = 100): Promise<InquiryRow[]> {
    const { data, error } = await this.db
      .from("inquiries")
      .select(SELECT)
      .in("status", ["new", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`inquiry.listOpen: ${error.message}`);
    return ((data ?? []) as unknown as RawRow[]).map(toDomain);
  }

  async listAnswered(limit = 50): Promise<InquiryRow[]> {
    const { data, error } = await this.db
      .from("inquiries")
      .select(SELECT)
      .eq("status", "answered")
      .order("answered_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`inquiry.listAnswered: ${error.message}`);
    return ((data ?? []) as unknown as RawRow[]).map(toDomain);
  }
}
