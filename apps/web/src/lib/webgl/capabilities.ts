export type GLTier = "none" | "low" | "high";

type NavExtras = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };

export function detectGLTier(): GLTier {
  if (typeof window === "undefined") return "none";
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    if (!gl) return "none";
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    const nav = navigator as NavExtras;
    const lowMemory = (nav.deviceMemory ?? 8) <= 4;
    const lowCores = (navigator.hardwareConcurrency ?? 8) <= 4;
    const saveData = nav.connection?.saveData === true;
    const smallTouch = window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 768;
    return lowMemory || lowCores || saveData || smallTouch ? "low" : "high";
  } catch {
    return "none";
  }
}

export const DPR_CAP = { low: 1, high: 1.5 } as const;
