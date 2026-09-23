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
uniform float uHazard;
uniform float uOverdrive;
uniform vec3 uColor;
uniform float uBase;
uniform float uPulseScale;
varying vec3 vWorld;

void main() {
  float phase = vWorld.z * uPulseScale - uTime * 1.15;
  float wave = pow(0.5 + 0.5 * sin(phase * 6.2831), 6.0);
  float wave2 = pow(0.5 + 0.5 * sin(phase * 6.2831 * 0.37 + 1.7), 3.0) * 0.35;

  // Approaching hazard triggers a warning strobe wave accelerating down the ribs
  float strobe = 0.0;
  if (uHazard > 0.001) {
    float strobeWave = sin(uTime * (14.0 + uHazard * 18.0) - vWorld.z * 0.4);
    strobe = smoothstep(0.4, 0.95, strobeWave) * uHazard * 2.4;
  }

  float i = uBase + wave * 1.4 + wave2 + uKick * 1.8 + strobe;
  vec3 col = uColor * i;
  col = mix(col, vec3(1.0), clamp(uKick * 0.35 * wave + strobe * 0.45, 0.0, 1.0));

  // Shunt overdrive energy surge: conduit neon ribs pulse with high-frequency ice-cyan waves
  if (uOverdrive > 0.001) {
    float drivePhase = vWorld.z * (uPulseScale * 1.8) - uTime * 3.6;
    float driveWave = pow(0.5 + 0.5 * sin(drivePhase * 6.2831), 4.0);
    vec3 iceCyan = vec3(0.24, 0.88, 1.0);
    col = mix(col, iceCyan * (i + 1.2), uOverdrive * 0.75);
    col += vec3(0.55, 0.95, 1.0) * driveWave * uOverdrive * 2.2;
  }

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
  
  // High-frequency electrical plasma filament arcing along the lethal edge
  float arc1 = sin(vWorld.x * 24.0 + uTime * 47.0);
  float arc2 = sin(vWorld.x * 9.0 - uTime * 29.0 + arc1 * 1.5);
  float noiseArc = sin(vWorld.x * 48.0 + uTime * 63.0 + arc2 * 2.0);
  float edgeJitter = 0.032 * arc1 * noiseArc;
  
  // Dancing coronal tendrils leaping into the clearance gap
  float tendril = pow(max(0.0, sin(vWorld.x * 16.0 + sin(uTime * 34.0) * 3.5)), 7.0);
  float corona = exp(-edgeWorld * 4.5) * tendril * 1.6;

  // Internal plasma currents
  float flow = 0.5 + 0.5 * sin(vWorld.x * 3.2 - uTime * 12.0 + vWorld.y * 2.5);
  float scan = smoothstep(0.80, 1.0, fract(vWorld.y * 3.0 + uTime * 3.2));
  float microFlicker = 0.90 + 0.10 * sin(uTime * 59.0 + vWorld.x * 3.7);

  float body = 0.36 + flow * 0.24 + scan * 0.22;
  float core = exp(-max(0.0, edgeWorld + edgeJitter) * 8.8) * 3.4;

  vec3 mantle = uColor * body * microFlicker;
  vec3 plasmaFringe = mix(uColor, vec3(1.0, 0.45, 0.85), 0.55) * corona;
  vec3 hotCore = mix(uColor, vec3(1.0), 0.88) * core;

  vec3 col = mantle + plasmaFringe + hotCore;
  col *= fogAtten(vDepth);
  gl_FragColor = vec4(col, 1.0);
}
`

// ---------------------------------------------------------------------------
// Pylon slab: dark substrate with sparse PCB traces. Each horizontal lane may
// carry one routed trace (pad, run, 45-degree dogleg, run, pad) so the result
// reads as parallel copper rather than a grid. Local +X is the open-edge rim
// (the mesh flips scale.x on right-side pylons); current packets run toward it
// so the gap reads at distance without a per-slot uniform.
// ---------------------------------------------------------------------------
export const PYLON_VERT = /* glsl */ `
varying vec3 vLocal;
varying float vDepth;
varying vec3 vScale;
void main() {
  vLocal = position;
  vScale = vec3(
    length(modelMatrix[0].xyz),
    length(modelMatrix[1].xyz),
    length(modelMatrix[2].xyz)
  );
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`

export const PYLON_FRAG = /* glsl */ `
precision highp float;
${FOG}
${HASH}
uniform float uTime;
uniform vec3 uColor;
varying vec3 vLocal;
varying vec3 vScale;

float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

// Annular pad: bright ring with a dark drill hole.
float pad(vec2 p, vec2 c, float r) {
  float d = length(p - c);
  return smoothstep(r, r * 0.8, d) * smoothstep(r * 0.32, r * 0.48, d);
}

void main() {
  vec3 an = abs(vLocal);
  vec2 st;
  vec2 ext;
  if (an.z >= an.x && an.z >= an.y) {
    st = vec2((vLocal.x + 0.5) * vScale.x, (vLocal.y + 0.5) * vScale.y);
    ext = vScale.xy;
  } else if (an.y >= an.x) {
    st = vec2((vLocal.x + 0.5) * vScale.x, (vLocal.z + 0.5) * vScale.z);
    ext = vScale.xz;
  } else {
    st = vec2((vLocal.z + 0.5) * vScale.z, (vLocal.y + 0.5) * vScale.y);
    ext = vScale.zy;
  }

  float laneH = 0.4;
  float ly = st.y / laneH;
  float lane = floor(ly);
  vec2 p = vec2(st.x, (fract(ly) - 0.5) * laneH);

  float r1 = hash21(vec2(lane, 3.1));
  float r2 = hash21(vec2(lane, 7.7));
  float r3 = hash21(vec2(lane, 11.3));
  float r4 = hash21(vec2(lane, 19.9));
  // "active" is reserved in GLSL ES 3.00, hence "routed".
  float routed = step(0.52, r1);

  // Route: pad at x0, run, dogleg at xj, run to x1 (or off the open edge).
  float x0 = r2 * ext.x * 0.42 + 0.12;
  float toEdge = step(0.55, r4);
  float x1 = mix(ext.x - r3 * ext.x * 0.3, ext.x + 0.5, toEdge);
  float xj = mix(x0 + 0.35, x1 - 0.45, fract(r3 * 5.3));
  float straight = step(0.78, r2);
  float lift = laneH * 0.2 * (1.0 - straight);
  float yA = mix(-lift, lift, step(0.5, r4));
  float yB = -yA;
  float dj = abs(yB - yA);

  float d = sdSeg(p, vec2(x0, yA), vec2(xj, yA));
  d = min(d, sdSeg(p, vec2(xj, yA), vec2(xj + dj, yB)));
  d = min(d, sdSeg(p, vec2(xj + dj, yB), vec2(x1, yB)));
  float tw = 0.028 + step(0.9, r1) * 0.016;
  float trace = smoothstep(tw, tw * 0.45, d) * routed;

  float padR = 0.07;
  float pads = pad(p, vec2(x0, yA), padR);
  pads += pad(p, vec2(x1, yB), padR) * (1.0 - toEdge);
  pads *= routed;

  // Sparse standalone vias on lanes that carry no trace.
  float vx = fract(r3 * 9.7) * ext.x;
  float via = pad(p, vec2(vx, 0.0), padR * 0.8) * (1.0 - routed) * step(0.7, r2);

  float packet = pow(0.5 + 0.5 * sin(st.x * 2.6 - uTime * 5.2 + lane * 1.9), 12.0);
  float packet2 = pow(0.5 + 0.5 * sin(st.x * 1.1 - uTime * 2.1 + r1 * 6.2831), 5.0) * 0.4;
  float current = packet + packet2;

  float openBus = exp(-(0.5 - vLocal.x) * 15.0);
  float openFace = smoothstep(0.42, 0.5, vLocal.x);
  float breathe = 0.9 + 0.1 * sin(uTime * 2.1 + r1 * 3.0);

  float prox = clamp(1.0 - vDepth / 38.0, 0.0, 1.0);
  float boost = 0.72 + prox * prox * 0.9;

  // Substrate stays dim so the board reads as a lit panel, not a laser field.
  float body = 0.085;
  body += trace * (0.7 + current * 1.7) * breathe;
  body += (pads + via) * (0.85 + current * 0.5);
  body += openBus * (1.9 + current * 0.8);
  body += openFace * 0.95;

  vec3 col = uColor * body * boost;
  col = mix(col, vec3(1.0), clamp(trace * current * 0.5 + openBus * 0.32, 0.0, 0.75));
  col *= fogAtten(vDepth);
  gl_FragColor = vec4(col, 1.0);
}
`

// ---------------------------------------------------------------------------
// Damper orb: additive gold shell with a fresnel rim and a slow shimmer.
// ---------------------------------------------------------------------------
export const ORB_VERT = /* glsl */ `
varying vec3 vViewPos;
varying vec3 vViewNormal;
varying float vDepth;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  vViewNormal = normalize(normalMatrix * normal);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`

export const ORB_FRAG = /* glsl */ `
precision highp float;
${FOG}
uniform float uTime;
uniform vec3 uColor;
varying vec3 vViewPos;
varying vec3 vViewNormal;

void main() {
  vec3 n = normalize(vViewNormal);
  vec3 v = normalize(-vViewPos);
  float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.5);
  float shimmer = 0.85 + 0.15 * sin(uTime * 3.4 + vViewPos.y * 8.0);
  float core = 0.22 + fresnel * 1.35;
  vec3 col = mix(uColor, vec3(1.0), fresnel * 0.55) * core * shimmer;
  col *= fogAtten(vDepth);
  gl_FragColor = vec4(col, 1.0);
}
`

export const HALO_FRAG = /* glsl */ `
precision highp float;
${FOG}
uniform float uTime;
uniform vec3 uColor;
varying vec2 vUv;

void main() {
  vec2 p = vUv - 0.5;
  float d = length(p) * 2.0;
  float intensity = exp(-d * 4.5);
  float pulse = 0.82 + 0.18 * sin(uTime * 2.8);
  vec3 col = mix(uColor, vec3(1.0), 0.35) * intensity * pulse * 1.6;
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
uniform float uOverdrive;
varying float vT;

void main() {
  float fade = pow(1.0 - vT, 2.4) * smoothstep(0.0, 0.08, vT);
  float ripple = 0.8 + 0.2 * sin(vT * 30.0 - uTime * 24.0);
  vec3 tint = mix(uColor, vec3(1.0), 0.2 * (1.0 - vT));
  if (uOverdrive > 0.001) {
    float flicker = fract(sin(vT * 110.0 + uTime * 65.0) * 43758.5453);
    vec3 cyan = vec3(0.24, 0.88, 1.0);
    tint = mix(tint, mix(cyan, vec3(1.0), flicker * 0.65), uOverdrive * 0.85);
  }
  vec3 col = tint * fade * ripple * uIntensity;
  col *= fogAtten(vDepth);
  gl_FragColor = vec4(col, 1.0);
}
`

// ---------------------------------------------------------------------------
// Supersonic Prandtl-Glauert shock wave vapor cone: translucent aerodynamic shroud
// forming over swept wings during high-velocity Shunt overdrive.
// ---------------------------------------------------------------------------
export const SHOCK_CONE_VERT = /* glsl */ `
varying vec3 vPosition;
varying vec3 vViewNormal;
varying vec3 vViewPos;
varying float vDepth;
void main() {
  vPosition = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewNormal = normalize(normalMatrix * normal);
  vViewPos = mv.xyz;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`

export const SHOCK_CONE_FRAG = /* glsl */ `
precision highp float;
${FOG}
uniform float uTime;
uniform float uOverdrive;
uniform vec3 uColor;
varying vec3 vPosition;
varying vec3 vViewNormal;
varying vec3 vViewPos;
varying float vDepth;

void main() {
  if (uOverdrive <= 0.001) discard;

  vec3 V = normalize(-vViewPos);
  float fresnel = pow(1.0 - abs(dot(vViewNormal, V)), 2.6);

  float normZ = vPosition.z / 0.525;
  float axial = smoothstep(-1.0, -0.6, normZ) * smoothstep(1.0, 0.45, normZ);

  float ripple = 0.8 + 0.2 * sin(vPosition.z * 32.0 - uTime * 34.0);
  float radial = 0.88 + 0.12 * cos(atan(vPosition.y, vPosition.x) * 10.0 + uTime * 12.0);

  float alpha = fresnel * axial * ripple * radial * uOverdrive * 0.72;
  vec3 col = mix(uColor, vec3(1.0), fresnel * 0.6) * (1.1 + fresnel * 0.8);
  col *= fogAtten(vDepth);

  gl_FragColor = vec4(col * alpha, alpha);
}
`

// ---------------------------------------------------------------------------
// Volumetric light shafts: soft additive beams cast downward from ceiling gantries.
// ---------------------------------------------------------------------------
export const SHAFT_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vViewNormal;
varying vec3 vViewPos;
varying float vDepth;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewNormal = normalize(normalMatrix * normal);
  vViewPos = mv.xyz;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`

export const SHAFT_FRAG = /* glsl */ `
precision highp float;
${FOG}
uniform float uTime;
uniform vec3 uColor;
uniform float uIntensity;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vViewNormal;
varying vec3 vViewPos;
varying float vDepth;

void main() {
  // vUv.y: 1 at ceiling emitter, 0 at bottom
  float along = vUv.y;
  float verticalFade = pow(along, 1.3) * smoothstep(1.0, 0.9, along) * smoothstep(0.0, 0.22, along);

  // Soft edge from view angle (fades at grazing silhouette angles so no sharp geometry edge is seen)
  vec3 viewDir = normalize(-vViewPos);
  float edge = clamp(abs(dot(vViewNormal, viewDir)), 0.0, 1.0);
  float radial = smoothstep(0.0, 0.45, edge);

  // Particulate motes drifting through the beam
  float dust = 0.88 + 0.12 * sin(vWorld.z * 1.8 + uTime * 2.2) * cos(vWorld.y * 2.4 - uTime * 1.6);

  float beam = verticalFade * radial * dust * uIntensity;
  vec3 col = uColor * beam;
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
  float flicker = 0.88 + 0.12 * sin(uTime * 47.0 + along * 19.0) * sin(uTime * 31.0);

  // Supersonic shock diamond cells moving down the exhaust plume
  float cell = fract(along * 6.5 - uTime * 13.0);
  float diamond = 1.0 - abs(cell - 0.5) * 2.0;
  diamond = pow(diamond, 3.2);

  // Exponential attenuation along the plume length
  float cellEnvelope = exp(-along * 3.6);
  float shockDiamonds = diamond * cellEnvelope;

  // Razor-hot central supersonic core needle
  float coreNeedle = exp(-along * 5.2) * 1.6;

  // Ionized plasma mantle
  float mantle = pow(1.0 - along, 2.0) * 0.72;

  // Expansion shock wave rings
  float shockRing = smoothstep(0.2, 0.0, abs(cell - 0.5)) * cellEnvelope * 0.35;

  // White-hot color core transitioning to neon plume sheath
  vec3 hotCore = mix(uColor, vec3(1.0), 0.78);
  vec3 col = uColor * (mantle + shockRing) + hotCore * (shockDiamonds * 1.5 + coreNeedle);

  col *= flicker * uIntensity;
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
uniform float uWarp;
uniform vec2 uWarpCenter;
uniform float uFlare;
uniform float uCurvature;
uniform float uScanlines;
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

  // Optical visor barrel curvature
  vec2 c0 = uv - 0.5;
  float r0_2 = dot(c0, c0);
  if (uCurvature > 0.001) {
    uv = uv + c0 * (r0_2 * uCurvature);
  }

  if (uWarp > 0.002) {
    vec2 dWarp = uv - uWarpCenter;
    dWarp.x *= uRes.x / max(uRes.y, 1.0);
    float dist = length(dWarp);
    float rippleRadius = (1.0 - uWarp) * 0.95;
    float ringWidth = 0.12;
    float ringDelta = abs(dist - rippleRadius);
    float ringMask = smoothstep(ringWidth, 0.0, ringDelta);
    float wave = sin((dist - rippleRadius) / ringWidth * 3.14159);
    vec2 dir = dist > 1e-4 ? normalize(dWarp) : vec2(0.0);
    dir.x /= uRes.x / max(uRes.y, 1.0);
    uv += dir * wave * ringMask * uWarp * 0.038;
  }

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

  // Anamorphic horizontal lens flare streaks across bright highlights
  if (uFlare > 0.001) {
    vec3 flare = vec3(0.0);
    float dx = 1.0 / max(uRes.x, 1.0);
    for (int i = 1; i <= 5; i++) {
      float fi = float(i);
      float off = fi * fi * 4.2 * dx;
      vec3 s1 = texture2D(tDiffuse, uv + vec2(off, 0.0)).rgb;
      vec3 s2 = texture2D(tDiffuse, uv - vec2(off, 0.0)).rgb;
      vec3 b1 = max(vec3(0.0), s1 - 0.82);
      vec3 b2 = max(vec3(0.0), s2 - 0.82);
      float w = 1.0 / (fi * 1.5);
      flare += (b1 + b2) * w;
    }
    vec3 flareTint = vec3(0.35, 0.78, 1.0);
    col += flare * flareTint * uFlare * 0.55;
  }

  if (uGlitch > 0.002) {
    float line = step(0.985, hash21(vec2(floor(uv.y * uRes.y * 0.5), floor(uTime * 60.0))));
    col += vec3(0.24, 0.88, 1.0) * line * uGlitch * 0.6;
    col = mix(col, col.gbr, uGlitch * 0.12 * step(0.5, hash21(vec2(floor(uTime * 30.0), 1.0))));
  }

  // Filmic black-depth calibration & neon vibrance preservation
  col = max(vec3(0.0), col);
  col = pow(col, vec3(1.06));
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float satMask = smoothstep(0.06, 0.65, luma) * (1.0 - smoothstep(0.85, 1.0, luma));
  col = mix(vec3(luma), col, 1.0 + 0.18 * satMask);

  // Visor phosphor scanline grid
  if (uScanlines > 0.001) {
    float scan = 1.0 - uScanlines * (0.5 + 0.5 * sin(uv.y * uRes.y * 1.5 + uTime * 4.0));
    col *= scan;
  }

  float g = hash21(uv * uRes + fract(uTime) * 100.0) - 0.5;
  col += g * uGrain;

  float vig = smoothstep(0.12, 0.72, r2);
  col *= 1.0 - uVignette * vig;

  col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0));

  gl_FragColor = vec4(col, 1.0);
}
`
