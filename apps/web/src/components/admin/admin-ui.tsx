import type { ReactNode } from "react";

export const inputClass = "mt-1 min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink";
export const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-4 text-sm font-semibold text-accent-ink disabled:cursor-not-allowed disabled:opacity-40";
export const quietButtonClass = "inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-muted">{label}</span>
      {children}
    </label>
  );
}

export function Status({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm" role="status">
      {children}
    </p>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm text-danger" role="alert">
      {children}
    </p>
  );
}

export function Panel({ children }: { children: ReactNode }) {
  return <section className="rounded-[1.2rem] border border-line bg-surface p-4 sm:p-5">{children}</section>;
}
