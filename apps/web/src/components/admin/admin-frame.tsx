"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { errorText, logout, session } from "@/lib/admin-api";
import { quietButtonClass } from "@/components/admin/admin-ui";

const LINKS = [
  { href: "/admin", label: "Сегодня" },
  { href: "/admin/bookings", label: "Записи" },
  { href: "/admin/services", label: "Услуги" },
  { href: "/admin/barbers", label: "Барберы" },
  { href: "/admin/schedule", label: "График" },
  { href: "/admin/time-off", label: "Исключения" },
  { href: "/admin/reviews", label: "Отзывы" },
  { href: "/admin/analytics", label: "Аналитика" },
  { href: "/admin/settings", label: "Настройки" },
];

function activeLink(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const loginPage = pathname === "/admin/login";
  const [ready, setReady] = useState(false);
  const [loginName, setLoginName] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    session()
      .then((result) => {
        if (cancelled) return;
        if (loginPage) {
          router.replace("/admin");
          return;
        }
        setLoginName(result.login);
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        if (!loginPage) router.replace("/admin/login");
        else setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loginPage, router]);

  if (loginPage) {
    return <div id="content">{ready ? children : null}</div>;
  }

  async function signOut() {
    setMessage("");
    try {
      await logout();
      router.replace("/admin/login");
    } catch (error) {
      setMessage(errorText(error));
    }
  }

  return (
    <div id="content" className="min-h-dvh bg-bg text-ink md:grid md:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="border-b border-line md:min-h-dvh md:border-b-0 md:border-r">
        <div className="flex items-end justify-between gap-3 px-4 py-4 md:block md:px-5 md:py-6">
          <div>
            <p className="font-display text-3xl leading-none">Кромка</p>
            <p className="mt-1 text-sm text-muted">{loginName || "Админка"}</p>
          </div>
          <button type="button" className={`${quietButtonClass} md:mt-4`} onClick={() => void signOut()}>
            Выйти
          </button>
        </div>
        <nav className="flex gap-2 overflow-x-auto px-3 pb-3 md:flex-col md:px-3 md:pb-6">
          {LINKS.map((link) => {
            const active = activeLink(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold ${active ? "bg-ink text-bg" : "text-ink"}`}
              >
                {link.label}
              </Link>
            );
          })}
          <Link href="/" className="inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm text-muted">
            На сайт
          </Link>
        </nav>
        {message ? <p className="px-5 pb-4 text-sm text-danger">{message}</p> : null}
      </aside>
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 md:py-8">{ready ? children : <p className="text-sm text-muted">Проверяем вход</p>}</main>
    </div>
  );
}
