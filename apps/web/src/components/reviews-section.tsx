import { SectionHeading } from "@/components/section-heading";
import { reviews } from "@/data/mock";

export function ReviewsSection() {
  return (
    <section id="reviews" className="border-t border-line py-16 sm:py-20">
      <div className="page-wrap">
        <SectionHeading
          eyebrow="Отзывы"
          title="Что говорят после визита"
          text="Публично показываем отзывы от 4 баллов. Остальные видит только администратор."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {reviews.map((review) => (
            <figure key={review.id} className="rounded-[1.2rem] border border-line bg-surface p-5">
              <div className="flex items-center justify-between gap-3">
                <figcaption className="font-semibold">{review.author}</figcaption>
                <p className="text-sm text-accent" aria-label={`Оценка ${review.rating} из 5`}>
                  {"★".repeat(review.rating)}
                  <span className="text-line">{"★".repeat(5 - review.rating)}</span>
                </p>
              </div>
              <blockquote className="mt-3 text-sm leading-6 text-muted">«{review.comment}»</blockquote>
              <p className="mt-4 text-xs tracking-wide text-muted uppercase">{review.service}</p>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
