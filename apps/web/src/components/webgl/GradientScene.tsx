"use client";

import { useEffect, useRef } from "react";
import { createShaderCanvas, type ShaderCanvas } from "@/lib/webgl/shader-canvas";
import { DPR_CAP } from "@/lib/webgl/capabilities";
import { WARP_GRADIENT_FRAG } from "@/lib/webgl/shaders";
import type { StageSceneProps } from "./ShaderStage";

export default function GradientScene({
  paused,
  reducedMotion,
  tier,
  onReady,
  onContextLost,
}: StageSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctrl = useRef<ShaderCanvas | null>(null);
  const cb = useRef({ onReady, onContextLost });

  useEffect(() => {
    cb.current = { onReady, onContextLost };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      ctrl.current = createShaderCanvas(canvas, {
        fragmentBody: WARP_GRADIENT_FRAG,
        maxDpr: DPR_CAP[tier],
        speed: 0.35,
        frozen: reducedMotion,
        onFirstFrame: () => cb.current.onReady(),
        onContextLost: () => cb.current.onContextLost(),
      });
    } catch (err) {
      console.error("[GradientScene]", err);
      cb.current.onContextLost();
    }
    return () => {
      ctrl.current?.destroy();
      ctrl.current = null;
    };
  }, [reducedMotion, tier]);

  useEffect(() => {
    ctrl.current?.setPaused(paused);
  }, [paused]);

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />;
}
