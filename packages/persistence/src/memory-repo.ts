import type { MemoryDraft, MemoryRepo } from "@jbg/domain";
import type { SupabaseClient } from "./client";

/**
 * memories repo（domain MemoryRepo 的 Supabase 實作）。
 * 映射 MemoryDraft（agent 輸出）→ memories 表：kind→type、sourceRef→source_kind/source_id。
 * links（[[slug]]）對應 memory_links 表，MVP 先略（TODO：寫入 memory_links）。
 */
export class SupabaseMemoryRepo implements MemoryRepo {
  constructor(private readonly db: SupabaseClient) {}

  async save(draft: MemoryDraft): Promise<string> {
    const { data, error } = await this.db
      .from("memories")
      .upsert(
        {
          slug: draft.slug,
          type: draft.kind,
          title: draft.content.slice(0, 60),
          content: draft.content,
          source_kind: draft.sourceRef.type,
          source_id: draft.sourceRef.id,
          confidence: draft.confidence,
        },
        { onConflict: "slug" },
      )
      .select("id")
      .single<{ id: string }>();
    if (error) throw new Error(`save memory: ${error.message}`);
    return data.id;
  }
}
