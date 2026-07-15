"use client";

import { useActionState } from "react";
import { loginAction, setupAction, type LoginState } from "./actions";

const initial: LoginState = {};
const field = "w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400";

/** 首次設定或登入，依 needsSetup 切換。 */
export function LoginForm({ needsSetup, next }: { needsSetup: boolean; next: string }) {
  const [state, action, pending] = useActionState(needsSetup ? setupAction : loginAction, initial);

  return (
    <form action={action} className="mt-6 space-y-3">
      {!needsSetup && <input type="hidden" name="next" value={next} />}
      <input name="password" type="password" autoFocus required placeholder={needsSetup ? "設定管理密碼（至少 6 字）" : "管理密碼"} className={field} />
      {needsSetup && <input name="password2" type="password" required placeholder="再輸入一次" className={field} />}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "處理中…" : needsSetup ? "建立密碼並進入後台" : "登入"}
      </button>
      {state.error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
    </form>
  );
}
