import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase service-role client（server-only）。
 * service role 繞過 RLS —— 僅供 worker/loop runtime 使用，絕不曝露到 client（§0.9）。
 */
export function createServiceClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type { SupabaseClient };
