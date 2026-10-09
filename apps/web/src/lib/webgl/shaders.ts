export function glslColor(hex: string): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.pow(v / 255, 2.2).toFixed(4));
  return `vec3(${lin.join(", ")})`;
}

export const COMMON = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
const mat2 OCT_ROT = mat2(0.8, 0.6, -0.6, 0.8);
float fbm(vec2 p) {
  float sum = 0.0, amp = 0.5;
  for (int i = 0; i < 4; i++) { sum += amp * vnoise(p); p = OCT_ROT * p * 2.02; amp *= 0.5; }
  return sum;
}
float grain(vec2 fragCoord, float time) {
  return hash12(floor(fragCoord) + floor(time * 18.0) * 17.13) - 0.5;
}
vec3 encodeSRGB(vec3 linear) { return pow(max(linear, 0.0), vec3(1.0 / 2.2)); }
`;

type WarpOpts = {
  colors: [string, string, string, string];
  scale?: number;
  grainAmount?: number;
  mouseInfluence?: number;
};

export function warpGradientFrag({
  colors,
  scale = 1.1,
  grainAmount = 0.028,
  mouseInfluence = 0.12,
}: WarpOpts): string {
  const [c0, c1, c2, c3] = colors.map(glslColor);
  return /* glsl */ `
${COMMON}
const vec3 C0 = ${c0}; const vec3 C1 = ${c1}; const vec3 C2 = ${c2}; const vec3 C3 = ${c3};
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y * ${scale.toFixed(3)};
  float t = uTime * 0.07;
  vec2 m = (uMouse - 0.5) * ${mouseInfluence.toFixed(3)};
  p.y += uScroll * 0.35;
  vec2 q = vec2(fbm(p + vec2(0.0, 0.0) + t), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p + 3.5 * q + vec2(1.7, 9.2) + 0.6 * t + m),
                fbm(p + 3.5 * q + vec2(8.3, 2.8) - 0.4 * t));
  float f = fbm(p + 3.0 * r);
  vec3 col = mix(C0, C1, clamp(f * f * 2.4, 0.0, 1.0));
  col = mix(col, C2, clamp(length(q) * 0.9, 0.0, 1.0) * 0.75);
  col = mix(col, C3, clamp(r.x * r.x * 1.6, 0.0, 1.0) * 0.55);
  col *= 0.82 + 0.36 * f;
  col += grain(gl_FragCoord.xy, uTime) * ${grainAmount.toFixed(3)};
  fragColor = vec4(encodeSRGB(col), 1.0);
}`;
}

export const WARP_GRADIENT_FRAG = warpGradientFrag({
  colors: ["#1a1714", "#4a3024", "#8d4e24", "#e7d3bc"],
});
