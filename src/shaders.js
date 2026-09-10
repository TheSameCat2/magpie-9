// GLSL sources. Every world-space shader attenuates toward the (near-black) fog
// colour with the same FogExp2 curve the scene uses so glow never punches
// through the murk at the far end of the conduit.

const FOG = /* glsl */ `
uniform float uFogDensity;
varying float vDepth;
float fogAtten(float depth) {
  float f = uFogDensity * depth;
  return exp(-f * f);
}
`

const HASH = /* glsl */ `
float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
`

// ---------------------------------------------------------------------------
// Gate edge frame: SDF outline of the opening you must fly through.
// uMode 0 = rectangular hatch, 1 = horizontal band (two lines), 2 = one vertical edge.
// ---------------------------------------------------------------------------
export const FRAME_VERT = /* glsl */ `
varying vec2 vUv;
varying float vDepth;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`

export const FRAME_FRAG = /* glsl */ `
precision highp float;
${FOG}
uniform float uTime;
uniform vec3 uColor;
uniform vec2 uSize;
uniform vec2 uHalf;
uniform float uMode;
uniform float uEdgeSign;
uniform float uProx;
uniform float uHit;
uniform float uFade;
uniform float uSeed;
varying vec2 vUv;

void main() {
  vec2 p = (vUv - 0.5) * uSize;
  float d;
  float along;
  if (uMode < 0.5) {
    vec2 q = abs(p) - uHalf;
    d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    along = p.x + p.y;
  } else if (uMode < 1.5) {
    float dd = min(abs(p.y - uHalf.y), abs(p.y + uHalf.y));
    d = abs(p.y) < uHalf.y ? -dd : dd;
    along = p.x;
  } else {
    d = p.x * uEdgeSign;
    along = p.y;
  }

  float ad = abs(d);
  float core = smoothstep(0.075, 0.0, ad);
  float halo = exp(-ad * 3.0) * 0.42;

  float pulseHz = 1.6 + uProx * 5.0;
  float dash = 0.5 + 0.5 * sin(along * 5.5 - uTime * pulseHz * 2.2 + uSeed * 6.2831);
  dash = smoothstep(0.25, 0.95, dash);

  float breathe = 0.85 + 0.15 * sin(uTime * pulseHz * 6.2831);
  float intensity = core * (1.1 + dash * 1.0) * breathe + halo * (0.55 + 0.45 * dash);

  float inner = d < 0.0 ? exp(d * 3.4) * 0.22 : 0.0;
  intensity += inner;

  float sweepY = (fract(uTime * 0.45 + uSeed) - 0.5) * uSize.y;
  float sweep = smoothstep(0.16, 0.0, abs(p.y - sweepY)) * step(d, 0.0) * 0.28 * (0.4 + uProx);
  intensity += sweep;

  // corner ticks on the hatch so the shape reads even when the plate is dim
  if (uMode < 0.5) {
    vec2 c = uHalf - abs(p);
    float tick = step(abs(min(c.x, c.y)), 0.06) * step(max(c.x, c.y), 0.55) * step(0.0, min(c.x, c.y) + 0.06);
    intensity += tick * 0.9;
  }

  float boost = 0.65 + uProx * 1.25 + uHit * 2.8;
  vec3 col = uColor * intensity * boost;
  col = mix(col, vec3(1.0), clamp(uHit * (core + halo * 0.6), 0.0, 1.0));
  col *= fogAtten(vDepth) * uFade;
  gl_FragColor = vec4(col, 1.0);
}
`

// ---------------------------------------------------------------------------
// Rib / corner strip: unlit emissive with energy pulses racing down the tunnel.
// ---------------------------------------------------------------------------
export const RIB_VERT = /* glsl */ `
varying vec3 vWorld;
varying float vDepth;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vec4 mv = viewMatrix * w;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`

export const RIB_FRAG = /* glsl */ `
precision highp float;
${FOG}
uniform float uTime;
uniform float uKick;
uniform vec3 uColor;
uniform float uBase;
uniform float uPulseScale;
varying vec3 vWorld;

void main() {
  float phase = vWorld.z * uPulseScale - uTime * 1.15;
  float wave = pow(0.5 + 0.5 * sin(phase * 6.2831), 6.0);
  float wave2 = pow(0.5 + 0.5 * sin(phase * 6.2831 * 0.37 + 1.7), 3.0) * 0.35;
  float i = uBase + wave * 1.4 + wave2 + uKick * 1.8;
  vec3 col = uColor * i;
  col = mix(col, vec3(1.0), uKick * 0.35 * wave);
  col *= fogAtten(vDepth);
  gl_FragColor = vec4(col, 1.0);
}
`

// ---------------------------------------------------------------------------
// Laser slab: energy field with a white-hot edge facing the gap.
// ---------------------------------------------------------------------------
export const LASER_VERT = /* glsl */ `
varying vec3 vLocal;
varying vec3 vWorld;
varying float vDepth;
varying float vScaleY;
void main() {
  vLocal = position;
  vScaleY = length(modelMatrix[1].xyz);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vec4 mv = viewMatrix * w;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`

export const LASER_FRAG = /* glsl */ `
precision highp float;
${FOG}
uniform float uTime;
uniform vec3 uColor;
uniform float uEdgeSign;
varying vec3 vLocal;
varying vec3 vWorld;
varying float vScaleY;

void main() {
  float edgeWorld = (0.5 - vLocal.y * uEdgeSign) * vScaleY;
  float flow = 0.5 + 0.5 * sin(vWorld.x * 2.3 - uTime * 7.5 + vWorld.y * 2.0);
  float scan = smoothstep(0.82, 1.0, fract(vWorld.y * 3.0 + uTime * 2.6));
  float flicker = 0.92 + 0.08 * sin(uTime * 41.0 + vWorld.x * 0.7);
  float body = 0.38 + flow * 0.22 + scan * 0.25;
  float hot = exp(-edgeWorld * 5.5) * 2.6;
  vec3 col = uColor * body * flicker + mix(uColor, vec3(1.0), 0.65) * hot;
  col *= fogAtten(vDepth);
  gl_FragColor = vec4(col, 1.0);
}
`

// ---------------------------------------------------------------------------
// Shockwave: rounded-rect ring that expands from the opening as you thread it.
// ---------------------------------------------------------------------------
export const RING_FRAG = /* glsl */ `
precision highp float;
${FOG}
uniform float uT;
uniform vec3 uColor;
uniform vec2 uSize;
uniform vec2 uHalf;
uniform float uExpand;
uniform float uFade;
varying vec2 vUv;

void main() {
  vec2 p = (vUv - 0.5) * uSize;
  float grow = uT * uExpand;
  vec2 q = abs(p) - (uHalf + grow);
  float d = abs(length(max(q, 0.0)) + min(max(q.x, q.y), 0.0));
  float w = 0.05 + uT * 0.32;
  float ring = smoothstep(w, 0.0, d);
  float trail = smoothstep(w * 4.0, 0.0, d) * 0.25;
  float fade = pow(1.0 - uT, 1.6);
  vec3 col = mix(uColor, vec3(1.0), 0.45 * (1.0 - uT)) * (ring + trail) * fade * 3.2;
  col *= fogAtten(vDepth) * uFade;
  gl_FragColor = vec4(col, 1.0);
}
`

// ---------------------------------------------------------------------------
// GPU particles: position integrated in the shader from birth time + velocity.
// Particles live in world space so uScroll keeps them moving with the conduit.
// ---------------------------------------------------------------------------
export const PARTICLE_VERT = /* glsl */ `
uniform float uTime;
uniform float uScroll;
uniform float uPixelRatio;
attribute vec3 aVel;
attribute vec3 aColor;
attribute float aBirth;
attribute float aScroll0;
attribute float aLife;
attribute float aSize;
attribute float aGravity;
varying vec3 vColor;
varying float vAlpha;
varying float vDepth;

void main() {
  float age = uTime - aBirth;
  float t = clamp(age / aLife, 0.0, 1.0);
  float alive = step(0.0, age) * step(t, 0.999);
  vec3 p = position + aVel * age * (1.0 - t * 0.55);
  p.y -= aGravity * age * age * 0.5;
  p.z += uScroll - aScroll0;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vDepth = -mv.z;
  vColor = aColor;
  vAlpha = alive * (1.0 - t) * (1.0 - t) * smoothstep(0.3, 2.2, -mv.z);
  float size = aSize * (1.0 - t * 0.5) * alive;
  gl_PointSize = min(size * uPixelRatio * 260.0 / max(0.5, -mv.z), 72.0 * uPixelRatio);
  gl_Position = projectionMatrix * mv;
}
`

export const PARTICLE_FRAG = /* glsl */ `
precision highp float;
${FOG}
varying vec3 vColor;
varying float vAlpha;

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.15, d);
  float core = smoothstep(0.5, 0.0, d);
  vec3 col = (vColor + core * 0.6) * a * vAlpha;
  col *= fogAtten(vDepth);
  gl_FragColor = vec4(col, 1.0);
}
`

// ---------------------------------------------------------------------------
// Ambient dust: static buffer, wrapped in Z by the shader so it rides the scroll.
// ---------------------------------------------------------------------------
export const DUST_VERT = /* glsl */ `
uniform float uTime;
uniform float uScroll;
uniform float uPixelRatio;
uniform float uNear;
uniform float uSpan;
attribute float aSeed;
varying float vAlpha;
varying float vDepth;

void main() {
  vec3 p = position;
  p.z = uNear - mod(p.z + uScroll + uTime * 0.25 + aSeed * uSpan, uSpan);
  p.x += sin(uTime * 0.6 + aSeed * 6.2831) * 0.25;
  p.y += cos(uTime * 0.45 + aSeed * 9.4) * 0.2;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vDepth = -mv.z;
  float twinkle = 0.55 + 0.45 * sin(uTime * (1.5 + aSeed * 3.0) + aSeed * 40.0);
  float nearFade = smoothstep(0.0, 4.0, -mv.z);
  vAlpha = twinkle * nearFade;
  gl_PointSize = (0.35 + aSeed * 0.5) * uPixelRatio * 120.0 / max(0.5, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`

export const DUST_FRAG = /* glsl */ `
precision highp float;
${FOG}
uniform vec3 uColor;
varying float vAlpha;

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  vec3 col = uColor * a * vAlpha * 0.55;
  col *= fogAtten(vDepth);
  gl_FragColor = vec4(col, 1.0);
}
`

// ---------------------------------------------------------------------------
// Wingtip ribbon trail.
// ---------------------------------------------------------------------------
export const TRAIL_VERT = /* glsl */ `
attribute float aT;
varying float vT;
varying float vDepth;
void main() {
  vT = aT;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`

export const TRAIL_FRAG = /* glsl */ `
precision highp float;
${FOG}
uniform vec3 uColor;
uniform float uIntensity;
uniform float uTime;
varying float vT;

void main() {
  float fade = pow(1.0 - vT, 2.4) * smoothstep(0.0, 0.08, vT);
  float ripple = 0.8 + 0.2 * sin(vT * 30.0 - uTime * 24.0);
  vec3 col = mix(uColor, vec3(1.0), 0.2 * (1.0 - vT)) * fade * ripple * uIntensity;
  col *= fogAtten(vDepth);
  gl_FragColor = vec4(col, 1.0);
}
`

// ---------------------------------------------------------------------------
// Thruster cone.
// ---------------------------------------------------------------------------
export const THRUST_FRAG = /* glsl */ `
precision highp float;
${FOG}
uniform vec3 uColor;
uniform float uIntensity;
uniform float uTime;
varying vec2 vUv;

void main() {
  float along = vUv.y;
  float flicker = 0.85 + 0.15 * sin(uTime * 53.0 + along * 20.0) * sin(uTime * 31.0);
  float body = pow(1.0 - along, 2.2) * 0.7;
  float ring = smoothstep(0.35, 0.0, abs(fract(along * 4.0 - uTime * 6.0) - 0.5)) * 0.15;
  vec3 col = mix(mix(uColor, vec3(1.0), 0.35), uColor, clamp(along * 1.6, 0.0, 1.0)) * (body + ring) * flicker * uIntensity;
  col *= fogAtten(vDepth);
  gl_FragColor = vec4(col, 1.0);
}
`

// ---------------------------------------------------------------------------
// Full-screen finishing pass. Runs after OutputPass so it works in display space.
// ---------------------------------------------------------------------------
export const SCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const SCREEN_FRAG = /* glsl */ `
precision highp float;
${HASH}
uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uAberration;
uniform float uZoom;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uGlitch;
uniform float uVignette;
uniform float uGrain;
uniform vec2 uRes;
varying vec2 vUv;

vec3 sampleZoom(vec2 uv, vec2 c, float r2) {
  if (uZoom < 0.002) return texture2D(tDiffuse, uv).rgb;
  vec3 acc = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float s = 1.0 - uZoom * fi * 0.022 * (0.35 + r2 * 3.0);
    float w = 1.0 - fi * 0.12;
    acc += texture2D(tDiffuse, 0.5 + c * s).rgb * w;
    total += w;
  }
  return acc / total;
}

void main() {
  vec2 uv = vUv;

  if (uGlitch > 0.002) {
    float band = floor(uv.y * 28.0 + uTime * 37.0);
    float n = hash21(vec2(band, floor(uTime * 24.0)));
    float pick = step(1.0 - 0.45 * uGlitch, n);
    uv.x += (n - 0.5) * 0.16 * uGlitch * pick;
    uv.y += (hash21(vec2(floor(uTime * 18.0), 7.0)) - 0.5) * 0.03 * uGlitch;
    uv = clamp(uv, 0.0, 1.0);
  }

  vec2 c = uv - 0.5;
  float r2 = dot(c, c);

  vec3 col = sampleZoom(uv, c, r2);

  float ab = (0.0012 + uAberration * 0.014 + uGlitch * 0.02) * (0.4 + r2 * 3.2);
  col.r = mix(col.r, texture2D(tDiffuse, uv + c * ab).r, 0.85);
  col.b = mix(col.b, texture2D(tDiffuse, uv - c * ab).b, 0.85);

  if (uGlitch > 0.002) {
    float line = step(0.985, hash21(vec2(floor(uv.y * uRes.y * 0.5), floor(uTime * 60.0))));
    col += vec3(0.24, 0.88, 1.0) * line * uGlitch * 0.6;
    col = mix(col, col.gbr, uGlitch * 0.12 * step(0.5, hash21(vec2(floor(uTime * 30.0), 1.0))));
  }

  float g = hash21(uv * uRes + fract(uTime) * 100.0) - 0.5;
  col += g * uGrain;

  float vig = smoothstep(0.12, 0.72, r2);
  col *= 1.0 - uVignette * vig;

  col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0));

  gl_FragColor = vec4(col, 1.0);
}
`
