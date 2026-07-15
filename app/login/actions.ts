"use server";

import { getAdminConfig, setAdminConfig } from "@jbg/persistence";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, hashPassword, randomHex, safeEqual, sanitizeNext, sessionToken } from "@/lib/auth";
import { getServerDb } from "@/lib/server-db";

export interface LoginState {
  error?: string;
}

async function setSessionCookie(secret: string): Promise<void> {
  const token = await sessionToken(secret);
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

/** 首次設定管理密碼（尚未有設定時）。 */
export async function setupAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const pw = String(formData.get("password") ?? "");
  const pw2 = String(formData.get("password2") ?? "");
  if (pw.length < 6) return { error: "密碼至少 6 個字。" };
  if (pw !== pw2) return { error: "兩次輸入的密碼不一致。" };

  const db = getServerDb();
  if (!db) return { error: "系統未連線資料庫。" };
  if (await getAdminConfig(db)) return { error: "已設定過密碼，請直接登入。" };

  const sessionSecret = randomHex(32);
  const passwordHash = await hashPassword(pw, sessionSecret);
  await setAdminConfig(db, { passwordHash, sessionSecret });
  await setSessionCookie(sessionSecret);
  redirect("/");
}

/** 登入（已設定密碼時）。 */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const pw = String(formData.get("password") ?? "");
  const next = sanitizeNext(String(formData.get("next") ?? "/"));

  const db = getServerDb();
  if (!db) return { error: "系統未連線資料庫。" };
  const cfg = await getAdminConfig(db);
  if (!cfg) return { error: "尚未設定密碼，請先完成首次設定。" };

  const attempt = await hashPassword(pw, cfg.sessionSecret);
  if (!safeEqual(attempt, cfg.passwordHash)) return { error: "密碼錯誤。" };

  await setSessionCookie(cfg.sessionSecret);
  redirect(next);
}
