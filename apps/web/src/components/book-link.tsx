"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type BookLinkProps = {
  className?: string;
  children?: React.ReactNode;
  serviceId?: string;
};

export function BookLink({ className, children = "Записаться", serviceId }: BookLinkProps) {
  const pathname = usePathname();
  const href = serviceId ? `/book?service=${serviceId}` : "/book";

  return (
    <Link
      href={href}
      transitionTypes={pathname.startsWith("/book") ? undefined : ["nav-forward"]}
      className={`inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink ${className ?? ""}`}
    >
      {children}
    </Link>
  );
}
