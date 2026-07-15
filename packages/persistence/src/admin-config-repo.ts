import type { SupabaseClient } from "./client";

/** 後台認證設定（單列）—— DB-backed admin auth。 */

export interface AdminConfig {
  passwordHash: string;
  sessionSecret: string;
}

export async function getAdminConfig(db: SupabaseClient): Promise<AdminConfig | null> {
  const { data, error } = await db
    .from("admin_config")
    .select("password_hash, session_secret")
    .eq("id", 1)
    .maybeSingle<{ password_hash: string; session_secret: string }>();
  if (error) throw new Error(`getAdminConfig: ${error.message}`);
  return data ? { passwordHash: data.password_hash, sessionSecret: data.session_secret } : null;
}

/** 建立/覆寫設定（首次設定或改密碼）。 */
export async function setAdminConfig(db: SupabaseClient, cfg: AdminConfig): Promise<void> {
  const { error } = await db.from("admin_config").upsert({
    id: 1,
    password_hash: cfg.passwordHash,
    session_secret: cfg.sessionSecret,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`setAdminConfig: ${error.message}`);
}
