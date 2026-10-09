"use client";

import { useLenis } from "lenis/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BookLink } from "@/components/book-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { salon } from "@/data/mock";

const NAV = [
  { href: "/#services", label: "Услуги" },
  { href: "/#barbers", label: "Барберы" },
  { href: "/#reviews", label: "Отзывы" },
  { href: "/#contacts", label: "Контакты" },
];

export function Header() {
  const pathname = usePathname();
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const open = menuPath === pathname;
  const lenis = useLenis();

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open || !lenis) return;
    lenis.stop();
    return () => lenis.start();
  }, [open, lenis]);

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="page-wrap flex h-16 items-center justify-between gap-3">
        <Link
          href="/"
          translate="no"
          transitionTypes={pathname === "/" ? undefined : ["nav-back"]}
          className="display text-2xl leading-none tracking-normal"
        >
          {salon.name}
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-muted md:flex" aria-label="Разделы сайта">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="transition-colors hover:text-ink">
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <BookLink className="hidden sm:inline-flex" />
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-full border border-line bg-surface md:hidden"
            aria-expanded={open}
            aria-label={open ? "Закрыть меню" : "Открыть меню"}
            onClick={() => setMenuPath(open ? null : pathname)}
          >
            <span className="sr-only">{open ? "Закрыть" : "Меню"}</span>
            <MenuIcon open={open} />
          </button>
        </div>
      </div>

      {open ? (
        <nav
          className="border-t border-line bg-bg md:hidden"
          aria-label="Мобильное меню"
          data-lenis-prevent
        >
          <div className="page-wrap flex flex-col gap-1 py-3">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="flex min-h-11 items-center text-base"
                onClick={() => setMenuPath(null)}
              >
                {item.label}
              </a>
            ))}
            <BookLink className="mt-2 w-full" />
          </div>
        </nav>
      ) : null}
    </header>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
      {open ? (
        <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      ) : (
        <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      )}
    </svg>
  );
}
