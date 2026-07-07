import type { MemoryDraft } from "./schema";

/** Memory repository 介面（Supabase 實作在 @jbg/persistence）。 */
export interface MemoryRepo {
  /** 寫入一條萃取出的記憶（memory agent 輸出）。回傳寫入的 memory id。 */
  save(draft: MemoryDraft): Promise<string>;
}
