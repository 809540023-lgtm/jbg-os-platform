import { createServiceClient, type SupabaseClient } from "@jbg/persistence";

/**
 * server-only Supabase client（service role）。
 * 無 env（例如尚未接 DB 的部署）時回傳 null，讓頁面優雅回退靜態內容。
 */
export function getServerDb(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key);
}
