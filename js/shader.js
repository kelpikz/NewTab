// One full-screen fragment shader on a WebGL 2 canvas. Each shader scene
// writes only the body of its shader. This module adds the shared part: the
// uniforms every scene gets, noise, and `finish()`, which turns linear light
// into the colour on screen in the smooth or the pixel look.

const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// The start of a scene's own vertex shader, for a scene that draws shapes.
const VERTEX_HEAD = `#version 300 es
precision highp float;
uniform vec2 u_res;
`;

const PRELUDE = `#version 300 es
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_pixel;
layout(location = 0) out vec4 outColor;

float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
vec2 hash22(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}
float noise1(float x) {
  float i = floor(x);
  float f = fract(x);
  return mix(hash11(i), hash11(i + 1.0), f * f * (3.0 - 2.0 * f));
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x),
             mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
const mat2 TURN = mat2(0.8, 0.6, -0.6, 0.8);
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = TURN * p * 2.03 + 17.1;
    a *= 0.5;
  }
  return v;
}
float fbm3(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p = TURN * p * 2.03 + 17.1;
    a *= 0.5;
  }
  return v / 0.875;
}

const float BAYER[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);

vec3 finish(vec3 c) {
  c = pow(max(c, 0.0), vec3(1.0 / 2.2));
  if (u_pixel > 0.5) {
    ivec2 q = ivec2(gl_FragCoord.xy) & 3;
    float d = (BAYER[q.y * 4 + q.x] + 0.5) / 16.0;
    return floor(c * 7.0 + d) / 7.0;
  }
  return c + (hash12(gl_FragCoord.xy + fract(u_time * 7.13) * 91.0) - 0.5) / 255.0;
}
`;

// The program in use on each context. A uniform goes to the program in use,
// so a scene with two programs must switch before it sets one.
const inUse = new WeakMap();
function use(gl, handle) {
  if (inUse.get(gl) === handle) return;
  gl.useProgram(handle);
  inUse.set(gl, handle);
}

// Programs that may still be compiling, for each context. A large shader can
// take a second to compile. With KHR_parallel_shader_compile the driver does
// it in the background, and nothing may touch the program until it is done:
// even reading a uniform location would wait for it.
const waiting = new WeakMap();
const parallel = new WeakMap();

function background(gl) {
  if (!parallel.has(gl)) parallel.set(gl, gl.getExtension('KHR_parallel_shader_compile'));
  return parallel.get(gl);
}

/**
 * Are shaders on this context still compiling? Throws when one of them did
 * not compile, so the caller can fall back to something else.
 */
export function compiling(gl) {
  const list = waiting.get(gl);
  if (!list?.length) return false;
  const ext = background(gl);
  while (list.length) {
    if (ext && !gl.getProgramParameter(list[0].handle, ext.COMPLETION_STATUS_KHR)) return true;
    list.shift().finish();
  }
  return false;
}

function check(gl, handle, shaders) {
  if (gl.getProgramParameter(handle, gl.LINK_STATUS)) return;
  const log = shaders.map((shader) => gl.getShaderInfoLog(shader)).join('') || gl.getProgramInfoLog(handle);
  throw new Error(log || 'The shader did not compile.');
}

/**
 * Compile `body` after the shared part and return a small handle:
 *   set(name, a, b?, c?, d?)  one float uniform, or a vec2, vec3 or vec4
 *   list(name, values, size)  a uniform array of vec<size> from a Float32Array
 *   unit(name, n)             point a sampler at texture unit n
 *   whole(name, n)            one int uniform
 *   draw(time, target?, count?, mode?)  fill the canvas, or a target from `target()`
 * A scene that draws its own triangles gives `vertex`, the body of a vertex
 * shader, binds its vertex array, and gives `count` (and a `mode` such as
 * gl.TRIANGLE_STRIP) to `draw`.
 * Values set while the shader still compiles are kept and sent when it is
 * ready. A draw before then does nothing; `compiling(gl)` tells when.
 */
export function program(gl, body, vertex = null) {
  const shaders = [
    [gl.VERTEX_SHADER, vertex ? VERTEX_HEAD + vertex : VERTEX],
    [gl.FRAGMENT_SHADER, PRELUDE + body],
  ].map(([type, source]) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  });
  const handle = gl.createProgram();
  shaders.forEach((shader) => gl.attachShader(handle, shader));
  gl.linkProgram(handle);

  const early = new Map();
  let ready = false;
  const spots = new Map();
  const spot = (name) => {
    if (!spots.has(name)) spots.set(name, gl.getUniformLocation(handle, name));
    return spots.get(name);
  };
  const pixel = Number(Boolean(gl.canvas.classList?.contains('scene-pixel')));

  // Send one uniform now, or keep it for later while the shader compiles.
  const send = (name, put) => {
    if (!ready) {
      early.set(name, put);
      return;
    }
    const at = spot(name);
    if (!at) return;
    use(gl, handle);
    put(at);
  };

  const finish = () => {
    check(gl, handle, shaders);
    ready = true;
    use(gl, handle);
    gl.bindVertexArray(gl.createVertexArray());
    early.forEach((put, name) => send(name, put));
    early.clear();
  };
  if (background(gl)) {
    if (!waiting.has(gl)) waiting.set(gl, []);
    waiting.get(gl).push({ handle, finish });
  } else {
    finish();
  }

  const set = (name, a, b, c, d) =>
    send(name, (at) => {
      if (d !== undefined) gl.uniform4f(at, a, b, c, d);
      else if (c !== undefined) gl.uniform3f(at, a, b, c);
      else if (b !== undefined) gl.uniform2f(at, a, b);
      else gl.uniform1f(at, a);
    });
  const whole = (name, n) => send(name, (at) => gl.uniform1i(at, n));

  return {
    set,
    list(name, values, size) {
      send(name, (at) => {
        if (size === 4) gl.uniform4fv(at, values);
        else if (size === 3) gl.uniform3fv(at, values);
        else if (size === 2) gl.uniform2fv(at, values);
        else gl.uniform1fv(at, values);
      });
    },
    unit: whole,
    whole,
    draw(time, into = null, count = 3, mode = gl.TRIANGLES) {
      if (!ready) return;
      use(gl, handle);
      gl.bindFramebuffer(gl.FRAMEBUFFER, into?.frame ?? null);
      const width = into?.width ?? gl.drawingBufferWidth;
      const height = into?.height ?? gl.drawingBufferHeight;
      gl.viewport(0, 0, width, height);
      set('u_res', width, height);
      set('u_time', time);
      set('u_pixel', pixel);
      gl.drawArrays(mode, 0, count);
    },
    dispose() {
      if (inUse.get(gl) === handle) inUse.delete(gl);
      gl.deleteProgram(handle);
      shaders.forEach((shader) => gl.deleteShader(shader));
    },
  };
}

/**
 * Off-screen pictures that a shader draws into and another shader reads.
 * `layers` textures share one frame, so one shader can write them all
 * (`layout(location = n) out`). `float` asks for half floats, which not
 * every GPU can draw into; then this throws.
 *   size(width, height)   make them this big, which also clears them
 *   bind(unit, layer?)    put one texture on a texture unit
 */
export function target(gl, { layers = 1, float = false, smooth = true, repeat = false } = {}) {
  if (float && !gl.getExtension('EXT_color_buffer_float')) throw new Error('No float targets.');
  const frame = gl.createFramebuffer();
  const textures = Array.from({ length: layers }, () => gl.createTexture());
  const filter = smooth ? gl.LINEAR : gl.NEAREST;
  const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  const out = {
    frame,
    width: 1,
    height: 1,
    size(width, height) {
      out.width = Math.max(1, Math.round(width));
      out.height = Math.max(1, Math.round(height));
      gl.bindFramebuffer(gl.FRAMEBUFFER, frame);
      textures.forEach((texture, i) => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        if (float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, out.width, out.height, 0, gl.RGBA, gl.HALF_FLOAT, null);
        else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, out.width, out.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, texture, 0);
      });
      gl.drawBuffers(textures.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },
    bind(unit, layer = 0) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, textures[layer]);
    },
    dispose() {
      gl.deleteFramebuffer(frame);
      textures.forEach((texture) => gl.deleteTexture(texture));
    },
  };
  return out;
}
