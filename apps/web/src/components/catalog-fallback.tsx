export function CatalogFallback({ what }: { what: string }) {
  return (
    <div className="rounded-[1.1rem] border border-line bg-surface p-5" role="alert">
      <p className="font-semibold">Не удалось загрузить {what}</p>
      <p className="mt-2 text-sm leading-6 text-muted">
        Список берётся из API. Запустите сервер и проверьте DATABASE_URL в .env.
      </p>
    </div>
  );
}
