"use client";

import Image from "next/image";
import { useRef, type CSSProperties } from "react";
import { BookLink } from "@/components/book-link";
import { CatalogFallback } from "@/components/catalog-fallback";
import { SectionHeading } from "@/components/section-heading";
import type { Service } from "@/lib/catalog";
import { gsap, useGSAP } from "@/lib/gsap";
import { formatDuration, formatPrice } from "@/lib/format";

const PHOTOS = ["/photos/hall.jpg", "/photos/chair.jpg", "/photos/station.jpg"] as const;

export function StackedServices({ services, failed }: { services: Service[]; failed: boolean }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const els = gsap.utils.toArray<HTMLElement>(".stack__card");
        const last = els[els.length - 1];
        if (!last) return;
        els.forEach((card, i) => {
          if (i === els.length - 1) return;
          const depth = els.length - 1 - i;
          gsap
            .timeline({
              defaults: { ease: "none" },
              scrollTrigger: {
                trigger: els[i + 1],
                start: "top bottom",
                endTrigger: last,
                end: () => `top ${parseFloat(getComputedStyle(last).top)}px`,
                scrub: true,
                invalidateOnRefresh: true,
              },
            })
            .to(card.querySelector(".stack__inner"), { scale: 1 - depth * 0.04 }, 0)
            .to(card.querySelector(".stack__shade"), { opacity: Math.min(0.12 * depth, 0.5) }, 0);
        });
      });
    },
    { scope: root, dependencies: [services.length], revertOnUpdate: true },
  );

  return (
    <section id="services" className="border-t border-line">
      <div className="page-wrap pt-16 sm:pt-20">
        <SectionHeading
          eyebrow="Услуги"
          title="Цены и время известны до записи"
          text="Длительность нужна, чтобы слот не заканчивался посреди стрижки. Цена на сайте — та, которую подтверждает мастер."
        />
      </div>
      {failed ? (
        <div className="page-wrap py-16">
          <CatalogFallback what="услуги" />
        </div>
      ) : (
      <div ref={root} className="stack">
        {services.map((service, i) => (
          <article key={service.id} className="stack__card" style={{ "--i": i } as CSSProperties}>
            <div className="stack__inner">
              <Image
                src={PHOTOS[i % PHOTOS.length]}
                alt=""
                fill
                sizes="(min-width: 1120px) 1040px, 92vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#100e0c]/80 via-[#100e0c]/25 to-[#100e0c]/10" />
              <div className="relative z-[1] flex h-full flex-col justify-end p-[clamp(1.25rem,4vw,3rem)] text-[#f6f1ea]">
                <p className="text-xs font-semibold tracking-[0.18em] uppercase">0{i + 1}</p>
                <h3 className="display mt-3 text-[clamp(2rem,4vw,3.5rem)] leading-none">{service.name}</h3>
                <p className="mt-3 max-w-md text-sm leading-6 text-[#f6f1ea]/80">{service.description}</p>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  <p className="price text-sm">
                    {formatPrice(service.price)} · {formatDuration(service.durationMin)}
                  </p>
                  <BookLink serviceId={service.id} className="px-4">
                    Выбрать
                  </BookLink>
                </div>
              </div>
              <div className="stack__shade" aria-hidden="true" />
            </div>
          </article>
        ))}
      </div>
      )}
    </section>
  );
}
