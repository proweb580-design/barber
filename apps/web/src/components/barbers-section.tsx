import { CatalogFallback } from "@/components/catalog-fallback";
import { SectionHeading } from "@/components/section-heading";
import { barberInitials, barberTone, type Barber } from "@/lib/catalog";

export function BarbersSection({ barbers, failed }: { barbers: Barber[]; failed: boolean }) {
  return (
    <section id="barbers" className="py-16 sm:py-20">
      <div className="page-wrap">
        <SectionHeading
          eyebrow="Барберы"
          title="Три мастера, разные руки"
          text="Можно выбрать конкретного барбера или оставить «любой свободный» уже на странице записи."
        />
        {failed ? (
          <div className="mt-10">
            <CatalogFallback what="барберов" />
          </div>
        ) : (
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {barbers.map((barber, index) => (
              <article key={barber.id} className="overflow-hidden rounded-[1.2rem] border border-line bg-surface">
                <div
                  className="flex h-40 items-end p-5 text-white"
                  style={{ background: `linear-gradient(160deg, ${barberTone(index)}, #1a1714 80%)` }}
                >
                  <span className="display text-5xl">{barberInitials(barber.name)}</span>
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-semibold">{barber.name}</h3>
                    {barber.rating != null ? (
                      <p className="text-sm font-semibold text-accent">{barber.rating.toFixed(1)}</p>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted">{barber.experienceYears} лет в кресле</p>
                  <p className="mt-3 text-sm leading-6 text-muted">{barber.bio}</p>
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {barber.specialties.map((item) => (
                      <li key={item} className="rounded-full border border-line px-3 py-1 text-xs">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
