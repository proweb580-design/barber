"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { detectGLTier, type GLTier } from "@/lib/webgl/capabilities";
import { useReducedMotion } from "@/lib/webgl/use-reduced-motion";

export type StageSceneProps = {
  paused: boolean;
  reducedMotion: boolean;
  tier: Exclude<GLTier, "none" | "low">;
  onReady: () => void;
  onContextLost: () => void;
};

type Props = {
  Scene: ComponentType<StageSceneProps>;
  poster: ReactNode;
  className?: string;
  rootMargin?: string;
};

export function ShaderStage({
  Scene,
  poster,
  className = "relative h-full w-full",
  rootMargin = "200px",
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [tier, setTier] = useState<GLTier | null>(null);
  const [shouldMount, setShouldMount] = useState(false);
  const [inView, setInView] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const [ready, setReady] = useState(false);
  const [lost, setLost] = useState(false);

  useEffect(() => {
    // WebGL and device memory are client-only; the poster is the SSR paint.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTier(detectGLTier());
  }, []);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
        if (entry.isIntersecting) setShouldMount(true);
      },
      { rootMargin },
    );
    io.observe(el);
    const onVis = () => setTabHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [rootMargin]);

  const canRender = tier === "high" && shouldMount && !lost;

  return (
    <div ref={hostRef} className={className} style={{ overflow: "hidden" }}>
      <div aria-hidden style={{ position: "absolute", inset: 0 }}>
        {poster}
      </div>
      {canRender ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            opacity: ready ? 1 : 0,
            transition: "opacity var(--dur-reveal, 700ms) var(--ease-out, cubic-bezier(.16,1,.3,1))",
          }}
        >
          <Scene
            paused={!inView || tabHidden}
            reducedMotion={reducedMotion}
            tier="high"
            onReady={() => setReady(true)}
            onContextLost={() => {
              setReady(false);
              setLost(true);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
