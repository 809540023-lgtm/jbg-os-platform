import "server-only";
import { getAdminConfig } from "@jbg/persistence";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, isValidSession } from "@/lib/auth";
import { getServerDb } from "@/lib/server-db";

/**
 * 後台守衛：在受保護頁面/版面頂端呼叫。
 * - 無 DB（本地/預覽缺 env）→ 放行（開發便利）。
 * - 尚未設定密碼 → 導去 /login（首次設定）。
 * - 未登入 → 導去 /login。
 */
export async function requireAdmin(): Promise<void> {
  const db = getServerDb();
  if (!db) return;

  let cfg;
  try {
    cfg = await getAdminConfig(db);
  } catch {
    redirect("/login"); // DB 暫時不可用 → fail-closed
  }
  if (!cfg) redirect("/login"); // 尚未設定 → 首次設定流程

  const cookie = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!(await isValidSession(cookie, cfg.sessionSecret))) redirect("/login");
}
