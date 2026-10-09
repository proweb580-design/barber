"use client";

import Image from "next/image";
import { useRef } from "react";
import { BookLink } from "@/components/book-link";
import { HeroBackground } from "@/components/hero/HeroBackground";
import { LineReveal } from "@/components/text/LineReveal";
import { salon } from "@/data/mock";
import { gsap, useGSAP } from "@/lib/gsap";

const STEPS = ["Услуга и мастер", "Дата и свободное время", "Имя, телефон и подтверждение"];

export function Hero() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        { motion: "(prefers-reduced-motion: no-preference)", small: "(max-width: 767px)" },
        (ctx) => {
          const { motion, small } = ctx.conditions as { motion: boolean; small: boolean };
          if (!motion) return;
          const endClip = small ? "inset(14% 5% 18% 5% round 0px)" : "inset(10% 16% 14% 16% round 0px)";
          gsap
            .timeline({
              defaults: { ease: "none" },
              scrollTrigger: {
                trigger: root.current,
                start: "top top",
                end: "+=120%",
                pin: true,
                pinType: "transform",
                scrub: true,
                anticipatePin: 1,
                refreshPriority: 1,
              },
            })
            .fromTo(".hero__frame", { clipPath: "inset(0% 0% 0% 0% round 0px)" }, { clipPath: endClip }, 0)
            .fromTo(".hero__media", { scale: 1 }, { scale: 1.08 }, 0)
            .to(".hero__title", { yPercent: -40, autoAlpha: 0, duration: 0.55 }, 0.15)
            .fromTo(".hero__caption", { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.35 }, 0.55);
        },
      );
    },
    { scope: root },
  );

  return (
    <>
      <section ref={root} className="relative h-svh overflow-clip bg-[#1a1714]">
        <HeroBackground />
        <div className="hero__frame absolute inset-0 z-[1] overflow-clip">
          <Image
            className="hero__media object-cover will-change-transform"
            src="/photos/hall.jpg"
            alt="Зал барбершопа: два кожаных кресла напротив зеркал"
            fill
            preload
            sizes="100vw"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#100e0c]/80 via-[#100e0c]/30 to-[#100e0c]/45" />
        </div>
        <div className="hero__title relative z-10 flex h-full items-end">
          <div className="page-wrap pb-16 sm:pb-20">
            <p className="text-xs font-semibold tracking-[0.18em] text-[#e7d3bc] uppercase">
              Барбершоп · {salon.city}
            </p>
            <LineReveal
              as="h1"
              onScroll={false}
              className="display mt-4 max-w-3xl text-5xl leading-[0.95] text-[#f6f1ea] sm:text-7xl"
            >
              Стрижка без очереди и без случайной формы
            </LineReveal>
            <p className="mt-6 max-w-lg text-base leading-7 text-[#f6f1ea]/80 sm:text-lg">
              Выбираете услугу, мастера и время. Приходите к своему слоту: {salon.address}, {salon.hours}.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <BookLink className="px-6" />
              <a
                href="#services"
                className="inline-flex min-h-11 items-center justify-center border border-white/40 px-6 text-sm font-semibold text-[#f6f1ea]"
              >
                Смотреть услуги
              </a>
            </div>
          </div>
        </div>
        <p className="hero__caption absolute inset-x-0 bottom-[6svh] z-10 text-center text-sm text-[#f6f1ea]">
          Зал на {salon.address}
        </p>
      </section>

      <section className="page-wrap grid gap-10 py-16 sm:py-20 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
        <aside>
          <p className="text-sm text-muted">Как проходит запись</p>
          <ol className="mt-4 space-y-4">
            {STEPS.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="display text-2xl leading-none text-accent">0{index + 1}</span>
                <span className="pt-1">{step}</span>
              </li>
            ))}
          </ol>
        </aside>
        <div className="grid grid-cols-2 gap-3">
          <div className="relative aspect-[4/3] overflow-hidden border border-line">
            <Image
              src="/photos/chair.jpg"
              alt="Кожаное кресло у тёмной стены"
              fill
              sizes="(min-width: 1120px) 420px, 50vw"
              className="object-cover"
            />
          </div>
          <div className="relative aspect-[4/3] overflow-hidden border border-line">
            <Image
              src="/photos/station.jpg"
              alt="Рабочий стол: машинки, ножницы и зеркало"
              fill
              sizes="(min-width: 1120px) 420px, 50vw"
              className="object-cover"
            />
          </div>
        </div>
      </section>
    </>
  );
}
