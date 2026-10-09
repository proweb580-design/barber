"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, Notice, buttonClass, inputClass } from "@/components/admin/admin-ui";
import { errorText, login } from "@/lib/admin-api";

export default function AdminLoginPage() {
  const router = useRouter();
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      await login(loginName.trim(), password);
      router.replace("/admin");
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-10 text-ink">
      <form onSubmit={(event) => void submit(event)} className="w-full max-w-sm">
        <h1 className="font-display text-5xl leading-none">Кромка</h1>
        <p className="mt-3 text-sm text-muted">Вход для владельца барбершопа.</p>
        <div className="mt-8 grid gap-4">
          <Field label="Логин">
            <input className={inputClass} autoComplete="username" value={loginName} onChange={(event) => setLoginName(event.target.value)} required />
          </Field>
          <Field label="Пароль">
            <input className={inputClass} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </Field>
          {message ? <Notice>{message}</Notice> : null}
          <button className={buttonClass} type="submit" disabled={pending}>
            {pending ? "Входим" : "Войти"}
          </button>
        </div>
      </form>
    </main>
  );
}
