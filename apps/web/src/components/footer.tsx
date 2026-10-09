import { salon } from "@/data/mock";

export function Footer() {
  return (
    <footer className="border-t border-line py-8">
      <div className="page-wrap flex flex-col gap-2 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p className="display text-2xl text-ink" translate="no">
          {salon.name}
        </p>
        <p>
          {salon.city}, {salon.address}
        </p>
        <a href={salon.phoneHref}>{salon.phone}</a>
      </div>
    </footer>
  );
}
