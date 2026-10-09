"use client";

import dynamic from "next/dynamic";
import { ShaderStage } from "@/components/webgl/ShaderStage";

const GradientScene = dynamic(() => import("@/components/webgl/GradientScene"), { ssr: false });

export function HeroBackground() {
  return (
    <ShaderStage
      className="absolute inset-0 z-0"
      Scene={GradientScene}
      poster={
        <div className="h-full w-full bg-[radial-gradient(120%_80%_at_18%_12%,#5c3a28,transparent_55%),linear-gradient(#1a1714,#2a211c)]" />
      }
    />
  );
}
