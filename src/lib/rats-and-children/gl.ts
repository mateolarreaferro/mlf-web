import { FRAME_R, RED, RING_LIFE, World, YELLOW, type RGB } from "./world";

/*
  Rats & Children, the picture, in plain WebGL2 (the original used ChuGL).
  Everything in the piece is a circle, so every circle is one instanced
  quad and the fragment shader draws an exact, antialiased disc (or, with
  an inner edge, a thin ring): crisp at a card's size or full screen. The
  circles go out in one draw call in the original's order (black frame,
  grey circle, the disaster, beings, the rings that open at a birth), the
  sparks in a second as short streaks along their path that narrow and fade
  toward the tail, all into an offscreen texture; then a bloom like ChuGL's (bright
  pass at threshold 0.5, a separable blur at half size), screened back on
  rather than added, so a white sky doesn't swallow the grey circle.
*/

/* how much of the world the shorter side of the canvas shows */
const VIEW_R = FRAME_R * 1.08;
const THRESHOLD = 0.5;
const INTENSITY = 0.35;
const FLOATS = 8; // x, y, r, inner edge (0 = a disc), red, green, blue, alpha
const SPARK_FLOATS = 10; // x, y, direction x, y, r, trail, red, green, blue, alpha

const CIRCLE_VS = `#version 300 es
layout(location=0) in vec2 corner;
layout(location=1) in vec4 disc;
layout(location=2) in vec4 color;
uniform vec2 toClip;
uniform float ppu;
out vec2 local;
out vec4 tint;
out float inner;
void main() {
  // grow the quad a pixel and a half so the edge has room to fade
  float grow = 1.0 + 1.5 / max(disc.z * ppu, 0.5);
  local = corner * grow;
  tint = color;
  inner = disc.w;
  gl_Position = vec4((disc.xy + local * disc.z) * toClip, 0.0, 1.0);
}`;

const CIRCLE_FS = `#version 300 es
precision highp float;
in vec2 local;
in vec4 tint;
in float inner;
out vec4 frag;
void main() {
  float d = length(local);
  float w = fwidth(d);
  float a = 1.0 - smoothstep(1.0 - w, 1.0 + w, d);
  if (inner > 0.0) a *= smoothstep(inner - w, inner + w, d);
  if (a <= 0.0) discard;
  frag = vec4(tint.rgb, tint.a * a);
}`;

const SPARK_VS = `#version 300 es
layout(location=0) in vec2 corner;
layout(location=1) in vec4 spark;
layout(location=2) in vec2 size;
layout(location=3) in vec4 color;
uniform vec2 toClip;
uniform float ppu;
out vec2 local;
out float tail;
out vec4 tint;
void main() {
  // in units of the spark's radius: the head at 0, the tail stretching back
  float r = size.x;
  float pad = 1.0 + 1.5 / max(r * ppu, 0.5);
  tail = size.y / r;
  float along = mix(-tail - pad, pad, corner.x * 0.5 + 0.5);
  float across = corner.y * pad;
  local = vec2(along, across);
  tint = color;
  vec2 dir = spark.zw;
  vec2 side = vec2(-dir.y, dir.x);
  gl_Position = vec4((spark.xy + (dir * along + side * across) * r) * toClip, 0.0, 1.0);
}`;

const SPARK_FS = `#version 300 es
precision highp float;
in vec2 local;
in float tail;
in vec4 tint;
out vec4 frag;
void main() {
  // a capsule from the tail to the head, narrowing and fading behind
  float t = tail > 0.0 ? clamp(1.0 + local.x / tail, 0.0, 1.0) : 1.0;
  float width = local.x > 0.0 ? 1.0 : mix(0.35, 1.0, t);
  float ax = local.x > 0.0 ? local.x : (local.x < -tail ? local.x + tail : 0.0);
  float d = length(vec2(ax, local.y / width));
  float w = fwidth(d);
  float a = 1.0 - smoothstep(1.0 - w, 1.0 + w, d);
  a *= local.x > 0.0 ? 1.0 : t * t;
  if (a <= 0.0) discard;
  frag = vec4(tint.rgb, tint.a * a);
}`;

const FULL_VS = `#version 300 es
out vec2 uv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D src;
uniform float threshold;
out vec4 frag;
void main() {
  vec3 c = texture(src, uv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  frag = vec4(c * smoothstep(threshold, threshold + 0.15, l), 1.0);
}`;

const BLUR_FS = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D src;
uniform vec2 step;
out vec4 frag;
void main() {
  vec3 c = texture(src, uv).rgb * 0.227027;
  c += texture(src, uv + step * 1.3846).rgb * 0.316216;
  c += texture(src, uv - step * 1.3846).rgb * 0.316216;
  c += texture(src, uv + step * 3.2308).rgb * 0.070270;
  c += texture(src, uv - step * 3.2308).rgb * 0.070270;
  frag = vec4(c, 1.0);
}`;

const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D scene;
uniform sampler2D bloom;
uniform float intensity;
out vec4 frag;
void main() {
  // a screen blend: light glows into the dark without washing light areas
  // out, so the grey circle keeps its value under a white sky
  vec3 s = texture(scene, uv).rgb;
  vec3 g = texture(bloom, uv).rgb * intensity;
  frag = vec4(1.0 - (1.0 - s) * (1.0 - g), 1.0);
}`;

type Target = { fbo: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number };

export class Renderer {
  private gl: WebGL2RenderingContext;
  private circle: WebGLProgram;
  private spark: WebGLProgram;
  private sparkVao: WebGLVertexArrayObject;
  private sparkBuf: WebGLBuffer;
  private sparks = new Float32Array(SPARK_FLOATS * 256);
  private bright: WebGLProgram;
  private blur: WebGLProgram;
  private composite: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private instances: WebGLBuffer;
  private data = new Float32Array(FLOATS * 512);
  private scene: Target | null = null;
  private a: Target | null = null;
  private b: Target | null = null;
  private w = 1;
  private h = 1;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, premultipliedAlpha: false });
    if (!gl) throw new Error("WebGL2 is not available");
    this.gl = gl;
    this.circle = program(gl, CIRCLE_VS, CIRCLE_FS);
    this.spark = program(gl, SPARK_VS, SPARK_FS);
    this.bright = program(gl, FULL_VS, BRIGHT_FS);
    this.blur = program(gl, FULL_VS, BLUR_FS);
    this.composite = program(gl, FULL_VS, COMPOSITE_FS);

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.instances = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instances);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, FLOATS * 4, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, FLOATS * 4, 16);
    gl.vertexAttribDivisor(2, 1);

    this.sparkVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.sparkVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.sparkBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sparkBuf);
    const stride = SPARK_FLOATS * 4;
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, 24);
    gl.vertexAttribDivisor(3, 1);
    gl.bindVertexArray(null);
  }

  /* pixels per world unit, and the inverse for pointer input */
  get ppu() {
    return Math.min(this.w, this.h) / 2 / VIEW_R;
  }

  /* a point on the canvas (CSS pixels from its top left) in world units */
  toWorld(px: number, py: number, cssW: number, cssH: number): [number, number] {
    const unit = Math.min(cssW, cssH) / 2 / VIEW_R;
    return [(px - cssW / 2) / unit, -(py - cssH / 2) / unit];
  }

  resize(w: number, h: number) {
    if (w === this.w && h === this.h && this.scene) return;
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    const gl = this.gl;
    for (const t of [this.scene, this.a, this.b]) {
      if (t) {
        gl.deleteFramebuffer(t.fbo);
        gl.deleteTexture(t.tex);
      }
    }
    this.scene = target(gl, this.w, this.h);
    const hw = Math.max(1, Math.round(this.w / 2));
    const hh = Math.max(1, Math.round(this.h / 2));
    this.a = target(gl, hw, hh);
    this.b = target(gl, hw, hh);
  }

  draw(world: World) {
    const gl = this.gl;
    if (!this.scene || !this.a || !this.b) return;

    // the circles, in the original's order
    let n = 0;
    const push = (x: number, y: number, r: number, c: RGB, alpha = 1, inner = 0) => {
      if (r <= 0) return;
      if ((n + 1) * FLOATS > this.data.length) {
        const bigger = new Float32Array(this.data.length * 2);
        bigger.set(this.data);
        this.data = bigger;
      }
      this.data.set([x, y, r, inner, c[0], c[1], c[2], alpha], n * FLOATS);
      n++;
    };
    push(0, 0, FRAME_R, [0, 0, 0]);
    push(0, 0, world.ringR, [0.8, 0.8, 0.8]);
    if (world.disaster) push(world.disaster.x, world.disaster.y, world.disasterR, [0, 0, 0]);
    for (const b of world.beings) push(b.x, b.y, world.beingR(b), b.red ? RED : YELLOW);
    // a birth: a thin ring opens out of the newcomer and fades
    for (const ring of world.rings) {
      const f = (world.t - ring.born) / RING_LIFE;
      const e = 1 - Math.pow(1 - f, 3);
      const r = ring.r * (1 + 2.6 * e) + 0.05 * e;
      push(ring.x, ring.y, r, ring.color, 0.7 * (1 - f) * (1 - f), Math.max(0, 1 - 0.014 / r));
    }

    let m = 0;
    for (const p of world.particles) {
      const look = world.sparkLook(p);
      if (look.r <= 0) continue;
      if ((m + 1) * SPARK_FLOATS > this.sparks.length) {
        const bigger = new Float32Array(this.sparks.length * 2);
        bigger.set(this.sparks);
        this.sparks = bigger;
      }
      const c = look.color;
      this.sparks.set([p.x, p.y, p.dx, p.dy, look.r, look.trail, c[0], c[1], c[2], look.fade], m * SPARK_FLOATS);
      m++;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.fbo);
    gl.viewport(0, 0, this.w, this.h);
    const sky = world.sky;
    gl.clearColor(sky, sky, sky, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.circle);
    const ppu = this.ppu;
    gl.uniform2f(gl.getUniformLocation(this.circle, "toClip"), (2 * ppu) / this.w, (2 * ppu) / this.h);
    gl.uniform1f(gl.getUniformLocation(this.circle, "ppu"), ppu);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instances);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.subarray(0, n * FLOATS), gl.DYNAMIC_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);

    if (m > 0) {
      gl.useProgram(this.spark);
      gl.uniform2f(gl.getUniformLocation(this.spark, "toClip"), (2 * ppu) / this.w, (2 * ppu) / this.h);
      gl.uniform1f(gl.getUniformLocation(this.spark, "ppu"), ppu);
      gl.bindVertexArray(this.sparkVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.sparkBuf);
      gl.bufferData(gl.ARRAY_BUFFER, this.sparks.subarray(0, m * SPARK_FLOATS), gl.DYNAMIC_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, m);
    }
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);

    // bloom: what is bright, blurred at half size, added back
    this.pass(this.bright, this.a, { src: this.scene.tex }, (p) =>
      gl.uniform1f(gl.getUniformLocation(p, "threshold"), THRESHOLD),
    );
    for (let i = 0; i < 2; i++) {
      const s = 1 + i;
      this.pass(this.blur, this.b, { src: this.a.tex }, (p) =>
        gl.uniform2f(gl.getUniformLocation(p, "step"), s / this.a!.w, 0),
      );
      this.pass(this.blur, this.a, { src: this.b.tex }, (p) =>
        gl.uniform2f(gl.getUniformLocation(p, "step"), 0, s / this.a!.h),
      );
    }
    this.pass(this.composite, null, { scene: this.scene.tex, bloom: this.a.tex }, (p) =>
      gl.uniform1f(gl.getUniformLocation(p, "intensity"), INTENSITY),
    );
  }

  dispose() {
    const gl = this.gl;
    for (const t of [this.scene, this.a, this.b]) {
      if (t) {
        gl.deleteFramebuffer(t.fbo);
        gl.deleteTexture(t.tex);
      }
    }
    for (const p of [this.circle, this.spark, this.bright, this.blur, this.composite]) gl.deleteProgram(p);
    gl.deleteBuffer(this.instances);
    gl.deleteBuffer(this.sparkBuf);
    gl.deleteVertexArray(this.vao);
    gl.deleteVertexArray(this.sparkVao);
    // never loseContext(): a canvas keeps its context for life, and a remount
    // (React's development double mount, or a card reopened on the same
    // canvas) would get a dead one back and draw nothing
  }

  private pass(
    p: WebGLProgram,
    to: Target | null,
    textures: Record<string, WebGLTexture>,
    set: (p: WebGLProgram) => void,
  ) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, to ? to.fbo : null);
    gl.viewport(0, 0, to ? to.w : this.w, to ? to.h : this.h);
    gl.useProgram(p);
    Object.entries(textures).forEach(([name, tex], i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(gl.getUniformLocation(p, name), i);
    });
    set(p);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const make = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, make(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "program");
  return p;
}

function target(gl: WebGL2RenderingContext, w: number, h: number): Target {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { fbo, tex, w, h };
}
