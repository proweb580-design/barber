"use client";

import { useRef, type ElementType, type ReactNode, type Ref } from "react";
import { gsap, SplitText, useGSAP } from "@/lib/gsap";

type Props = {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  delay?: number;
  onScroll?: boolean;
};

export function LineReveal({ children, as: Tag = "h2", className, delay = 0, onScroll = true }: Props) {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        SplitText.create(el, {
          type: "lines",
          mask: "lines",
          linesClass: "line",
          autoSplit: true,
          aria: "auto",
          onSplit(self) {
            return gsap.from(self.lines, {
              yPercent: 110,
              duration: 1.2,
              ease: "expo.out",
              stagger: 0.12,
              delay,
              scrollTrigger: onScroll ? { trigger: el, start: "top 85%", once: true } : undefined,
            });
          },
        });
      });
    },
    { scope: ref },
  );

  return (
    <Tag ref={ref as Ref<HTMLElement>} className={`line-reveal ${className ?? ""}`.trim()}>
      {children}
    </Tag>
  );
}
