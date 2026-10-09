import { BookLink } from "@/components/book-link";

export function BookBand() {
  return (
    <section className="page-wrap pb-4">
      <div className="flex flex-col items-start justify-between gap-5 rounded-[1.4rem] bg-ink px-6 py-8 text-bg sm:flex-row sm:items-center sm:px-8">
        <div>
          <h2 className="display text-4xl text-bg">Свободное кресло можно занять сейчас</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-bg/75">
            Запись занимает несколько шагов. Пока это учебный интерфейс: слоты тестовые, в базу ничего не пишется.
          </p>
        </div>
        <BookLink>Записаться</BookLink>
      </div>
    </section>
  );
}
