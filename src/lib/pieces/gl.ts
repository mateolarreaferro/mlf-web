/*
  The drawing kit for the ChuGL pieces ported to the site (Periphery,
  SacredVis; Rats & Children has its own, older renderer in
  src/lib/rats-and-children/gl.ts). Plain WebGL2, no library:

  - Shapes: discs, rings and rectangles as instanced quads, each edge
    antialiased in the shader, so they stay crisp at any size.
  - Lines: thick polylines with a colour per point, built as triangles on
    the CPU (ChuGL's GLines).
  - Bloom: a bright pass, a separable blur at half size, screened back onto
    the scene (screened, not added, so light areas are not washed out).

  World units: the view is centred on the origin and shows `viewR` units
  from the centre to the nearer edge.
*/

export type RGB = [number, number, number];

const SHAPE = 9; // x, y, half width (or radius), half height, inner edge, kind, r, g, b ... alpha below
const SHAPE_FLOATS = SHAPE + 1;

const SHAPE_VS = `#version 300 es
layout(location=0) in vec2 corner;
layout(location=1) in vec4 box;    // x, y, half width, half height
layout(location=2) in vec2 form;   // inner edge (rings), kind: 0 disc, 1 rect
layout(location=3) in vec4 color;
uniform vec2 toClip;
uniform float ppu;
out vec2 local;
out vec2 half_;
out vec2 form_;
out vec4 tint;
void main() {
  vec2 grow = 1.0 + 1.5 / max(box.zw * ppu, vec2(0.5));
  local = corner * grow;
  half_ = box.zw;
  form_ = form;
  tint = color;
  gl_Position = vec4((box.xy + local * box.zw) * toClip, 0.0, 1.0);
}`;

const SHAPE_FS = `#version 300 es
precision highp float;
in vec2 local;
in vec2 half_;
in vec2 form_;
in vec4 tint;
out vec4 frag;
void main() {
  float a;
  if (form_.y > 0.5) {
    // a rectangle: the distance to its edge, in pixels' worth of each axis
    vec2 q = abs(local);
    vec2 w = fwidth(local);
    vec2 e = 1.0 - smoothstep(1.0 - w, 1.0 + w, q);
    a = e.x * e.y;
  } else {
    float d = length(local);
    float w = fwidth(d);
    a = 1.0 - smoothstep(1.0 - w, 1.0 + w, d);
    if (form_.x > 0.0) a *= smoothstep(form_.x - w, form_.x + w, d);
  }
  if (a <= 0.0) discard;
  frag = vec4(tint.rgb, tint.a * a);
}`;

const LINE_VS = `#version 300 es
layout(location=0) in vec2 pos;
layout(location=1) in vec4 color;
uniform vec2 toClip;
out vec4 tint;
void main() {
  tint = color;
  gl_Position = vec4(pos * toClip, 0.0, 1.0);
}`;

const LINE_FS = `#version 300 es
precision highp float;
in vec4 tint;
out vec4 frag;
void main() { frag = tint; }`;

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
  vec3 s = texture(scene, uv).rgb;
  vec3 g = texture(bloom, uv).rgb * intensity;
  frag = vec4(1.0 - (1.0 - s) * (1.0 - g), 1.0);
}`;

type Target = { fbo: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number };

export class Stage {
  private gl: WebGL2RenderingContext;
  private shapeProg: WebGLProgram;
  private lineProg: WebGLProgram;
  private bright: WebGLProgram;
  private blur: WebGLProgram;
  private composite: WebGLProgram;
  private shapeVao: WebGLVertexArrayObject;
  private shapeBuf: WebGLBuffer;
  private lineVao: WebGLVertexArrayObject;
  private lineBuf: WebGLBuffer;
  private shapes = new Float32Array(SHAPE_FLOATS * 64);
  private nShapes = 0;
  private lines = new Float32Array(6 * 4096);
  private nLineVerts = 0;
  private scene: Target | null = null;
  private a: Target | null = null;
  private b: Target | null = null;
  w = 1;
  h = 1;

  constructor(
    canvas: HTMLCanvasElement,
    private viewR: number,
  ) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, premultipliedAlpha: false });
    if (!gl) throw new Error("WebGL2 is not available");
    this.gl = gl;
    this.shapeProg = program(gl, SHAPE_VS, SHAPE_FS);
    this.lineProg = program(gl, LINE_VS, LINE_FS);
    this.bright = program(gl, FULL_VS, BRIGHT_FS);
    this.blur = program(gl, FULL_VS, BLUR_FS);
    this.composite = program(gl, FULL_VS, COMPOSITE_FS);

    const quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    this.shapeVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.shapeVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.shapeBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.shapeBuf);
    const stride = SHAPE_FLOATS * 4;
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, 24);
    gl.vertexAttribDivisor(3, 1);

    this.lineVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.lineVao);
    this.lineBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 24, 8);
    gl.bindVertexArray(null);
  }

  get ppu() {
    return Math.min(this.w, this.h) / 2 / this.viewR;
  }

  /* half the view in world units, across and up */
  get extent(): [number, number] {
    const p = this.ppu;
    return [this.w / 2 / p, this.h / 2 / p];
  }

  setView(viewR: number) {
    this.viewR = viewR;
  }

  /* a point on the canvas (CSS pixels from its top left) in world units */
  toWorld(px: number, py: number, cssW: number, cssH: number): [number, number] {
    const unit = Math.min(cssW, cssH) / 2 / this.viewR;
    return [(px - cssW / 2) / unit, -(py - cssH / 2) / unit];
  }

  resize(w: number, h: number) {
    w = Math.max(1, w);
    h = Math.max(1, h);
    if (w === this.w && h === this.h && this.scene) return;
    this.w = w;
    this.h = h;
    const gl = this.gl;
    for (const t of [this.scene, this.a, this.b]) if (t) drop(gl, t);
    this.scene = target(gl, w, h);
    const hw = Math.max(1, Math.round(w / 2));
    const hh = Math.max(1, Math.round(h / 2));
    this.a = target(gl, hw, hh);
    this.b = target(gl, hw, hh);
  }

  /* -- what to draw this frame, in order -- */

  disc(x: number, y: number, r: number, c: RGB, alpha = 1) {
    if (r > 0) this.shape(x, y, r, r, 0, 0, c, alpha);
  }

  ring(x: number, y: number, r: number, width: number, c: RGB, alpha = 1) {
    if (r > 0) this.shape(x, y, r, r, Math.max(0, 1 - width / r), 0, c, alpha);
  }

  rect(x: number, y: number, hw: number, hh: number, c: RGB, alpha = 1) {
    this.shape(x, y, hw, hh, 0, 1, c, alpha);
  }

  /* a thick polyline; each point has its own colour (rgba) */
  line(points: Float32Array | number[], colors: Float32Array | number[] | null, width: number, solid: RGB = [1, 1, 1], alpha = 1) {
    const n = points.length / 2;
    if (n < 2 || width <= 0) return;
    const half = width / 2;
    for (let i = 0; i < n - 1; i++) {
      const x0 = points[i * 2], y0 = points[i * 2 + 1];
      const x1 = points[i * 2 + 2], y1 = points[i * 2 + 3];
      let dx = x1 - x0, dy = y1 - y0;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      const nx = -dy * half, ny = dx * half;
      const c0 = colors ? [colors[i * 4], colors[i * 4 + 1], colors[i * 4 + 2], colors[i * 4 + 3]] : [...solid, alpha];
      const c1 = colors
        ? [colors[i * 4 + 4], colors[i * 4 + 5], colors[i * 4 + 6], colors[i * 4 + 7]]
        : [...solid, alpha];
      this.lineVert(x0 + nx, y0 + ny, c0);
      this.lineVert(x0 - nx, y0 - ny, c0);
      this.lineVert(x1 + nx, y1 + ny, c1);
      this.lineVert(x1 + nx, y1 + ny, c1);
      this.lineVert(x0 - nx, y0 - ny, c0);
      this.lineVert(x1 - nx, y1 - ny, c1);
    }
  }

  /* clear, draw lines under shapes or over them, then bloom to the canvas */
  render(background: RGB, bloom: { threshold: number; intensity: number }, linesOnTop = true) {
    const gl = this.gl;
    if (!this.scene || !this.a || !this.b) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.fbo);
    gl.viewport(0, 0, this.w, this.h);
    gl.clearColor(background[0], background[1], background[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const ppu = this.ppu;
    const toClip: [number, number] = [(2 * ppu) / this.w, (2 * ppu) / this.h];

    const drawLines = () => {
      if (!this.nLineVerts) return;
      gl.useProgram(this.lineProg);
      gl.uniform2f(gl.getUniformLocation(this.lineProg, "toClip"), ...toClip);
      gl.bindVertexArray(this.lineVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
      gl.bufferData(gl.ARRAY_BUFFER, this.lines.subarray(0, this.nLineVerts * 6), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, this.nLineVerts);
    };
    const drawShapes = () => {
      if (!this.nShapes) return;
      gl.useProgram(this.shapeProg);
      gl.uniform2f(gl.getUniformLocation(this.shapeProg, "toClip"), ...toClip);
      gl.uniform1f(gl.getUniformLocation(this.shapeProg, "ppu"), ppu);
      gl.bindVertexArray(this.shapeVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.shapeBuf);
      gl.bufferData(gl.ARRAY_BUFFER, this.shapes.subarray(0, this.nShapes * SHAPE_FLOATS), gl.DYNAMIC_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.nShapes);
    };
    if (linesOnTop) {
      drawShapes();
      drawLines();
    } else {
      drawLines();
      drawShapes();
    }
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    this.nShapes = 0;
    this.nLineVerts = 0;

    this.pass(this.bright, this.a, { src: this.scene.tex }, (p) =>
      gl.uniform1f(gl.getUniformLocation(p, "threshold"), bloom.threshold),
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
      gl.uniform1f(gl.getUniformLocation(p, "intensity"), bloom.intensity),
    );
  }

  /* frees what it made; never loses the context, so a remount still draws */
  dispose() {
    const gl = this.gl;
    for (const t of [this.scene, this.a, this.b]) if (t) drop(gl, t);
    for (const p of [this.shapeProg, this.lineProg, this.bright, this.blur, this.composite]) gl.deleteProgram(p);
    gl.deleteBuffer(this.shapeBuf);
    gl.deleteBuffer(this.lineBuf);
    gl.deleteVertexArray(this.shapeVao);
    gl.deleteVertexArray(this.lineVao);
  }

  private shape(x: number, y: number, hw: number, hh: number, inner: number, kind: number, c: RGB, alpha: number) {
    if ((this.nShapes + 1) * SHAPE_FLOATS > this.shapes.length) {
      const bigger = new Float32Array(this.shapes.length * 2);
      bigger.set(this.shapes);
      this.shapes = bigger;
    }
    const o = this.nShapes * SHAPE_FLOATS;
    const s = this.shapes;
    s[o] = x;
    s[o + 1] = y;
    s[o + 2] = hw;
    s[o + 3] = hh;
    s[o + 4] = inner;
    s[o + 5] = kind;
    s[o + 6] = c[0];
    s[o + 7] = c[1];
    s[o + 8] = c[2];
    s[o + 9] = alpha;
    this.nShapes++;
  }

  private lineVert(x: number, y: number, c: number[]) {
    if ((this.nLineVerts + 1) * 6 > this.lines.length) {
      const bigger = new Float32Array(this.lines.length * 2);
      bigger.set(this.lines);
      this.lines = bigger;
    }
    const o = this.nLineVerts * 6;
    this.lines[o] = x;
    this.lines[o + 1] = y;
    this.lines[o + 2] = c[0];
    this.lines[o + 3] = c[1];
    this.lines[o + 4] = c[2];
    this.lines[o + 5] = c[3];
    this.nLineVerts++;
  }

  private pass(p: WebGLProgram, to: Target | null, textures: Record<string, WebGLTexture>, set: (p: WebGLProgram) => void) {
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

function drop(gl: WebGL2RenderingContext, t: Target) {
  gl.deleteFramebuffer(t.fbo);
  gl.deleteTexture(t.tex);
}

/* a little store the piece and its panel share (see the panels) */
export function store<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      for (const l of listeners) l();
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}
