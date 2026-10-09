import { SectionHeading } from "@/components/section-heading";
import { salon } from "@/data/mock";

export function ContactsSection() {
  return (
    <section id="contacts" className="py-16 sm:py-20">
      <div className="page-wrap grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <SectionHeading eyebrow="Контакты" title="Как добраться" />
          <dl className="mt-8 space-y-5 text-sm">
            <div>
              <dt className="text-muted">Адрес</dt>
              <dd className="mt-1 text-base">
                {salon.city}, {salon.address}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Телефон</dt>
              <dd className="mt-1">
                <a href={salon.phoneHref} className="text-base font-semibold">
                  {salon.phone}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-muted">Часы</dt>
              <dd className="mt-1 text-base">{salon.hours}</dd>
            </div>
          </dl>
          <a
            href={salon.mapUrl}
            className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-accent"
            target="_blank"
            rel="noreferrer"
          >
            Открыть в Яндекс Картах
            <span className="sr-only">, откроется в новой вкладке</span>
          </a>
        </div>
        <div className="overflow-hidden rounded-[1.2rem] border border-line bg-surface">
          <iframe
            title={`Карта барбершопа ${salon.name}`}
            src={salon.mapEmbed}
            className="h-80 w-full grayscale lg:h-full lg:min-h-80"
            loading="lazy"
          />
        </div>
      </div>
    </section>
  );
}
