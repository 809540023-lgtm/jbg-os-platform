/**
 * 後台認證原語（DB-backed，免 Render env）。
 * 密碼以 PBKDF2 雜湊存資料庫；session cookie 為 HMAC(session_secret) 簽章。
 * 純 Web Crypto，無 next/DB 依賴，可被 server 端任意 import。
 */

export const ADMIN_COOKIE = "jbg_admin";
const SESSION_MSG = "jbg-admin-session-v1";
const PBKDF2_ITERS = 100_000;

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 產生隨機 hex（session_secret / salt 用）。 */
export function randomHex(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 密碼雜湊：PBKDF2-SHA256，salt = session_secret。 */
export async function hashPassword(password: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(saltHex), iterations: PBKDF2_ITERS, hash: "SHA-256" },
    key,
    256,
  );
  return toHex(bits);
}

/** 由 session_secret 算出穩定的 session token。 */
export async function sessionToken(secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(SESSION_MSG));
  return toHex(sig);
}

/** 常數時間比較。 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isValidSession(cookieValue: string | undefined, secret: string): Promise<boolean> {
  if (!cookieValue) return false;
  return safeEqual(cookieValue, await sessionToken(secret));
}

/** 開放重導保護：只允許站內相對路徑。 */
export function sanitizeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}
