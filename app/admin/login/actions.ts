"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, safeEqual, sanitizeNext, sessionToken } from "@/lib/auth";

export interface LoginState {
  error?: string;
}

/** 後台登入：驗證密碼 → 設簽章 cookie → 導回原頁。 */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  const next = sanitizeNext(String(formData.get("next") ?? "/"));

  const admin = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!admin || !secret) return { error: "系統尚未設定管理密碼（ADMIN_PASSWORD）。" };

  // 常數時間比較
  if (!safeEqual(password, admin)) return { error: "密碼錯誤。" };

  const token = await sessionToken(secret);
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 天
  });
  redirect(next);
}
