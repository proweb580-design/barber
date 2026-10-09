const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

export const FRAG_HEADER = `#version 300 es
precision highp float;
uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMouse;
uniform float uScroll;
out vec4 fragColor;
`;

export type ShaderCanvasOptions = {
  fragmentBody: string;
  maxDpr?: number;
  speed?: number;
  frozen?: boolean;
  frozenTime?: number;
  onFirstFrame?: () => void;
  onContextLost?: () => void;
};

export type ShaderCanvas = { setPaused: (p: boolean) => void; destroy: () => void };

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("createShader failed");
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(log || "Shader compile error");
  }
  return shader;
}

export function createShaderCanvas(canvas: HTMLCanvasElement, o: ShaderCanvasOptions): ShaderCanvas {
  const { maxDpr = 1.5, speed = 1, frozen = false, frozenTime = 8 } = o;
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    premultipliedAlpha: true,
    powerPreference: "low-power",
  });
  if (!gl || gl.isContextLost()) throw new Error("WebGL2 unavailable");
  const program = gl.createProgram();
  if (!program) throw new Error("createProgram failed");
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG_HEADER + o.fragmentBody));
  gl.bindAttribLocation(program, 0, "aPos");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "link error");
  }
  gl.useProgram(program);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const loc = {
    time: gl.getUniformLocation(program, "uTime"),
    res: gl.getUniformLocation(program, "uResolution"),
    mouse: gl.getUniformLocation(program, "uMouse"),
    scroll: gl.getUniformLocation(program, "uScroll"),
  };

  const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
  let raf = 0;
  let paused = false;
  let last = performance.now();
  let t = frozen ? frozenTime : 0;
  let firstDone = false;

  const draw = () => {
    gl.uniform1f(loc.time, t);
    gl.uniform2f(loc.res, canvas.width, canvas.height);
    gl.uniform2f(loc.mouse, mouse.x, mouse.y);
    const max = document.documentElement.scrollHeight - innerHeight;
    gl.uniform1f(loc.scroll, max > 0 ? scrollY / max : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!firstDone) {
      firstDone = true;
      o.onFirstFrame?.();
    }
  };

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    if (frozen || paused) draw();
  };

  const loop = (now: number) => {
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    t += dt * speed;
    const k = 1 - Math.exp(-dt * 6);
    mouse.x += (mouse.tx - mouse.x) * k;
    mouse.y += (mouse.ty - mouse.y) * k;
    draw();
    raf = requestAnimationFrame(loop);
  };

  const start = () => {
    if (!raf && !paused && !frozen) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };

  const onPointer = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    mouse.tx = (e.clientX - r.left) / r.width;
    mouse.ty = 1 - (e.clientY - r.top) / r.height;
  };
  const onLost = (e: Event) => {
    e.preventDefault();
    stop();
    o.onContextLost?.();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  const io = new IntersectionObserver(([en]) => {
    paused = !en.isIntersecting || document.hidden;
    if (paused) stop();
    else start();
  });
  io.observe(canvas);
  const onVis = () => {
    paused = document.hidden;
    if (paused) stop();
    else start();
  };
  if (window.matchMedia("(pointer: fine)").matches && !frozen) {
    window.addEventListener("pointermove", onPointer, { passive: true });
  }
  canvas.addEventListener("webglcontextlost", onLost);
  document.addEventListener("visibilitychange", onVis);
  resize();
  if (frozen) draw();
  else start();

  return {
    setPaused: (p) => {
      paused = p;
      if (p) stop();
      else start();
    },
    destroy: () => {
      stop();
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onPointer);
      canvas.removeEventListener("webglcontextlost", onLost);
      document.removeEventListener("visibilitychange", onVis);
      gl.deleteBuffer(vbo);
      gl.deleteProgram(program);
    },
  };
}
