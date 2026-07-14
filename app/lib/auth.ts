/**
 * 後台認證（單一營運者密碼閘）—— P0 資安。
 * 設計：共享密碼 + HMAC 簽章 cookie（cookie 不含密碼本身，無法偽造）。
 * Edge/Node 皆用 Web Crypto，故 middleware 與 server action 共用此檔。
 * 未來可升級為 Supabase Auth 多使用者（見 docs/00 §0.3）。
 */

export const ADMIN_COOKIE = "jbg_admin";
const SESSION_MSG = "jbg-admin-session-v1";

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 由 secret 算出穩定的 session token（每次登入相同；登出即清 cookie）。 */
export async function sessionToken(secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(SESSION_MSG));
  return toHex(sig);
}

/** 常數時間比較，避免時序側漏。 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** cookie 是否為合法的已登入 session。 */
export async function isValidSession(cookieValue: string | undefined, secret: string): Promise<boolean> {
  if (!cookieValue) return false;
  const expected = await sessionToken(secret);
  return safeEqual(cookieValue, expected);
}

/** 開放重導保護：只允許站內相對路徑。 */
export function sanitizeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}
