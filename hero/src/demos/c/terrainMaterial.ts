// The terrain mesh and its shader. Geometry carries the static ground plus
// each grant landform's unit shape; the vertex shader scales the landforms by
// their truly available money, the fragment shader paints earth, contour
// lines, frost, meltwater and dusk light.

import * as THREE from 'three'
import { baseHeight, MESA_BASE, MESAS, mesaShape } from './layout'

const X0 = -44
const X1 = 44
const Z0 = -42
const Z1 = 25
const NX = 352
const NZ = 268

export function buildTerrainGeometry() {
  const cols = NX + 1
  const rows = NZ + 1
  const count = cols * rows
  const pos = new Float32Array(count * 3)
  const base = new Float32Array(count)
  const s = new Float32Array(count * 2)
  for (let j = 0; j < rows; j++) {
    const z = Z0 + ((Z1 - Z0) * j) / NZ
    for (let i = 0; i < cols; i++) {
      const x = X0 + ((X1 - X0) * i) / NX
      const k = j * cols + i
      pos[k * 3] = x
      pos[k * 3 + 2] = z
      base[k] = baseHeight(x, z)
      MESAS.forEach((m, mi) => {
        s[k * 2 + mi] = Math.hypot(x - m.cx, z - m.cz) > m.R * 1.9 ? 0 : mesaShape(m, x, z)
      })
    }
  }
  const dx = (X1 - X0) / NX
  const dz = (Z1 - Z0) / NZ
  const bg = new Float32Array(count * 2)
  const sg = new Float32Array(count * 4)
  const at = (arr: Float32Array, stride: number, off: number, i: number, j: number) =>
    arr[(Math.min(rows - 1, Math.max(0, j)) * cols + Math.min(cols - 1, Math.max(0, i))) * stride + off]
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i
      bg[k * 2] = (at(base, 1, 0, i + 1, j) - at(base, 1, 0, i - 1, j)) / (2 * dx)
      bg[k * 2 + 1] = (at(base, 1, 0, i, j + 1) - at(base, 1, 0, i, j - 1)) / (2 * dz)
      for (let mi = 0; mi < 2; mi++) {
        sg[k * 4 + mi * 2] = (at(s, 2, mi, i + 1, j) - at(s, 2, mi, i - 1, j)) / (2 * dx)
        sg[k * 4 + mi * 2 + 1] = (at(s, 2, mi, i, j + 1) - at(s, 2, mi, i, j - 1)) / (2 * dz)
      }
    }
  }
  const index = new Uint32Array(NX * NZ * 6)
  let n = 0
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const a = j * cols + i
      const b = a + 1
      const c = a + cols
      const d = c + 1
      index.set([a, c, b, b, c, d], n)
      n += 6
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('aBase', new THREE.BufferAttribute(base, 1))
  g.setAttribute('aBaseGrad', new THREE.BufferAttribute(bg, 2))
  g.setAttribute('aS', new THREE.BufferAttribute(s, 2))
  g.setAttribute('aSGrad', new THREE.BufferAttribute(sg, 4))
  g.setIndex(new THREE.BufferAttribute(index, 1))
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -8), 80)
  return g
}

export const FOG = new THREE.Color('#2b3346')

export function terrainMaterial(lamps: THREE.Vector3[]) {
  const padded = [...lamps]
  while (padded.length < 9) padded.push(new THREE.Vector3(0, -100, 0))
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uH: { value: new THREE.Vector2(6, 2.6) },
      uM0: { value: new THREE.Vector4(MESAS[0].cx, MESAS[0].cz, MESAS[0].R, 0) },
      uM1: { value: new THREE.Vector4(MESAS[1].cx, MESAS[1].cz, MESAS[1].R, 0) },
      uFx0: { value: new THREE.Vector4() }, // frost front, thaw front, meltwater, hover
      uFx1: { value: new THREE.Vector4() },
      uSeed0: { value: new THREE.Vector2() },
      uSeed1: { value: new THREE.Vector2() },
      uLamps: { value: padded.slice(0, 9) },
      uFog: { value: FOG.clone() },
      uBase: { value: MESA_BASE },
    },
    vertexShader: /* glsl */ `
      attribute float aBase;
      attribute vec2 aBaseGrad;
      attribute vec2 aS;
      attribute vec4 aSGrad;
      uniform vec2 uH;
      varying vec3 vWorld;
      varying vec3 vN;
      varying vec2 vS;
      void main() {
        float y = aBase + uH.x * aS.x + uH.y * aS.y;
        vec2 g = aBaseGrad + uH.x * aSGrad.xy + uH.y * aSGrad.zw;
        vN = normalize(vec3(-g.x, 1.0, -g.y));
        vS = aS;
        vec4 wp = modelMatrix * vec4(position.x, y, position.z, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec2 uH;
      uniform vec4 uM0;
      uniform vec4 uM1;
      uniform vec4 uFx0;
      uniform vec4 uFx1;
      uniform vec2 uSeed0;
      uniform vec2 uSeed1;
      uniform vec3 uLamps[9];
      uniform vec3 uFog;
      uniform float uBase;
      varying vec3 vWorld;
      varying vec3 vN;
      varying vec2 vS;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * vnoise(p);
          p = p * 2.03 + vec2(1.7, 9.2);
          a *= 0.5;
        }
        return v;
      }
      vec3 voronoi(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float d1 = 8.0;
        float d2 = 8.0;
        float id = 0.0;
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 g = vec2(float(x), float(y));
            vec2 o = vec2(hash(i + g), hash(i + g + 19.1));
            vec2 r = g + o - f;
            float d = dot(r, r);
            if (d < d1) { d2 = d1; d1 = d; id = hash(i + g + 7.7); }
            else if (d < d2) { d2 = d; }
          }
        }
        return vec3(sqrt(d1), sqrt(d2), id);
      }

      // frost, rim, drain, wet, stream, hover, seam (the warm edge where ice gives way to money)
      void iceOf(vec4 M, vec4 F, vec2 seed, float H, vec2 xz, float y, float slope, float n1,
                 out float frost, out float rim, out float drain, out float wet, out float stream, out float hover, out float seam) {
        float r = length(xz - M.xy) / M.z;
        float region = 1.0 - smoothstep(1.2, 1.5, r);
        hover = F.w * (1.0 - smoothstep(1.02, 1.2, r));
        frost = 0.0; rim = 0.0; drain = 0.0; wet = 0.0; stream = 0.0; seam = 0.0;
        if (region <= 0.0) return;
        float elev = clamp((y - uBase) / max(H, 0.2), 0.0, 1.0);
        if (F.x > 0.0) {
          float fd = length(xz - seed) / (2.3 * M.z) + 0.17 * (n1 - 0.5) + 0.06 * (vnoise(xz * 3.3) - 0.5);
          frost = region * (1.0 - smoothstep(F.x - 0.05, F.x, fd));
          rim = region * (smoothstep(F.x - 0.08, F.x - 0.02, fd) - smoothstep(F.x - 0.02, F.x + 0.01, fd));
          drain = region * (1.0 - smoothstep(F.x, F.x + 0.28, fd));
          if (F.y > 0.0) {
            float md = r * 0.6 + (1.0 - elev) * 0.45 + 0.22 * (n1 - 0.5);
            float cleared = 1.0 - smoothstep(F.y - 0.08, F.y, md);
            float front = smoothstep(F.y - 0.16, F.y - 0.04, md) * (1.0 - smoothstep(F.y - 0.04, F.y + 0.02, md));
            seam = region * front * frost;
            frost *= 1.0 - cleared;
            rim = rim * (1.0 - cleared);
            drain *= 1.0 - cleared * 0.85;
          }
        }
        if (F.z > 0.0) {
          vec2 d = xz - M.xy;
          float ang = atan(d.y, d.x);
          // A handful of meandering rivulets down the cliffs, with pulses running downhill.
          float k = 7.0;
          float wob = 0.6 * sin(y * 2.1 + n1 * 5.0) + 0.9 * (n1 - 0.5);
          float ch = smoothstep(0.9, 0.99, cos(ang * k + wob + M.x));
          float lane = hash(vec2(floor((ang + 3.1416) / 6.2832 * k + 0.5), M.x));
          float flow = fract(y * 0.9 + uTime * (0.9 + 0.6 * lane) + lane * 3.0);
          float run = smoothstep(0.0, 0.12, flow) * (1.0 - smoothstep(0.3, 0.85, flow));
          stream = F.z * region * smoothstep(0.15, 0.4, slope) * ch * (0.35 + 0.65 * run);
          wet = F.z * region * (0.5 + 0.5 * (1.0 - elev));
        }
      }

      void main() {
        vec3 n = normalize(vN);
        float slope = 1.0 - n.y;
        vec2 xz = vWorld.xz;
        float y = vWorld.y;
        float n1 = fbm(xz * 0.7);
        float grain = fbm(xz * 1.9 + 3.0);
        float mesaW = max(vS.x, vS.y);

        // Earth: umber plain, ochre landforms with banded cliffs
        vec3 plain = mix(vec3(0.105, 0.078, 0.058), vec3(0.19, 0.138, 0.094), grain);
        vec3 rock = mix(vec3(0.24, 0.155, 0.098), vec3(0.36, 0.235, 0.135), n1);
        vec3 col = mix(plain, rock, smoothstep(0.12, 0.42, slope));
        float strata = 0.5 + 0.5 * sin((y + n1 * 0.6) * 11.0);
        vec3 ochre = mix(vec3(0.46, 0.30, 0.135), vec3(0.68, 0.47, 0.22), strata);
        float onMesa = smoothstep(0.03, 0.2, mesaW);
        col = mix(col, ochre * (0.8 + 0.3 * grain), onMesa * smoothstep(0.05, 0.35, slope));
        col = mix(col, vec3(0.55, 0.40, 0.21) * (0.85 + 0.3 * grain), smoothstep(0.9, 0.99, mesaW) * (1.0 - smoothstep(0.08, 0.25, slope)));

        // Dusk: a low warm afterglow from the west, cool sky from above
        vec3 L = normalize(vec3(-0.8, 0.38, -0.45));
        float diff = max(dot(n, L), 0.0);
        vec3 sky = vec3(0.25, 0.30, 0.45);
        vec3 lit = col * (vec3(1.0, 0.64, 0.40) * diff * 1.2 + sky * (0.42 + 0.3 * n.y));

        // Sodium-lamp pools around the settlement and the observatories
        float pool = 0.0;
        for (int i = 0; i < 9; i++) {
          vec3 d = vWorld - uLamps[i];
          pool += 1.0 / (1.0 + dot(d, d) * 1.2);
        }
        lit += col * vec3(1.0, 0.56, 0.2) * pool * 1.6;

        float f0, r0, d0, w0, s0, h0, e0;
        float f1, r1, d1, w1, s1, h1, e1;
        iceOf(uM0, uFx0, uSeed0, uH.x, xz, y, slope, n1, f0, r0, d0, w0, s0, h0, e0);
        iceOf(uM1, uFx1, uSeed1, uH.y, xz, y, slope, n1, f1, r1, d1, w1, s1, h1, e1);
        float seam = max(e0, e1);
        float frost = max(f0, f1);
        float rim = max(r0, r1);
        float drain = max(d0, d1);
        float wet = max(w0, w1);
        float stream = max(s0, s1);
        float hover = max(h0, h1);

        // Colour drains out of the earth ahead of the frost
        float lum = dot(lit, vec3(0.3, 0.55, 0.15));
        lit = mix(lit, vec3(lum) * vec3(0.72, 0.82, 1.0), drain * 0.8);

        if (frost > 0.001) {
          vec3 v = voronoi(xz * 2.4);
          float facet = 0.8 + 0.32 * v.z;
          float crack = 1.0 - smoothstep(0.0, 0.07, v.y - v.x);
          vec3 iceFlat = vec3(0.78, 0.89, 0.95);
          vec3 iceSteep = vec3(0.30, 0.54, 0.71);
          vec3 ice = mix(iceFlat, iceSteep, smoothstep(0.12, 0.55, slope)) * facet;
          ice = mix(ice, vec3(0.16, 0.34, 0.5), crack * 0.6);
          ice = mix(ice, vec3(0.9, 0.96, 1.0), smoothstep(0.55, 0.75, fbm(xz * 5.0 + 11.0)) * (1.0 - slope) * 0.5);
          vec3 iceLit = ice * (vec3(0.85, 0.72, 0.7) * diff * 0.8 + vec3(0.46, 0.56, 0.78) * (0.6 + 0.35 * n.y));
          vec2 sc = floor(xz * 16.0);
          float glint = step(0.985, hash(sc)) * (0.5 + 0.5 * sin(uTime * 2.4 + hash(sc + 3.0) * 40.0));
          iceLit += vec3(0.9, 0.97, 1.0) * glint * 1.5 * (1.0 - slope);
          lit = mix(lit, iceLit, frost);
        }
        lit += vec3(0.62, 0.86, 1.0) * rim * 1.1;

        // Money lands: a warm seam where the ice gives way, the plateau warms, meltwater runs down
        lit += vec3(1.0, 0.68, 0.28) * seam * 1.7;
        float warm = wet * onMesa * (1.0 - frost);
        lit *= 1.0 - 0.28 * wet * (1.0 - frost);
        lit += vec3(0.62, 0.38, 0.12) * warm * (1.0 - smoothstep(0.1, 0.3, slope)) * 0.55;
        vec3 water = vec3(0.40, 0.74, 0.9);
        lit = mix(lit, water * 0.55, stream * 0.7);
        lit += vec3(0.75, 0.92, 1.0) * stream * 0.55;

        // Contour lines: one every $25,000 of money elevation, an index line every $100,000
        float cv = (y - uBase) / 0.5;
        float fw = max(fwidth(cv), 1e-4);
        float line = 1.0 - smoothstep(0.0, 1.0, abs(fract(cv - 0.5) - 0.5) / (fw * 1.25));
        float cv4 = cv * 0.25;
        float fw4 = max(fwidth(cv4), 1e-4);
        float idx = 1.0 - smoothstep(0.0, 1.0, abs(fract(cv4 - 0.5) - 0.5) / (fw4 * 2.2));
        float fade = (1.0 - smoothstep(0.3, 0.85, fw)) * (1.0 - 0.85 * smoothstep(0.3, 0.75, slope));
        float strength = mix(0.15, 0.4, onMesa) + hover * 0.45 + warm * 0.4;
        vec3 inkc = mix(vec3(0.95, 0.83, 0.6), vec3(0.86, 0.95, 1.0), frost);
        inkc = mix(inkc, vec3(1.25, 0.9, 0.42), clamp(warm * 1.6, 0.0, 1.0));
        float a = clamp(max(line * strength, idx * (strength + 0.18 * onMesa + 0.06)) * fade, 0.0, 1.0);
        lit = mix(lit, inkc * mix(0.75, 1.25, hover), a);

        // Haze toward the horizon
        float dist = length(vWorld - cameraPosition);
        float fog = 1.0 - exp(-pow(dist * 0.0128, 1.65));
        lit = mix(lit, uFog, clamp(fog, 0.0, 0.94));
        gl_FragColor = vec4(lit, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
}

/** Meltwater pool at a landform's foot: rises as the ice melts, then stays as a calm moat. */
export function poolMaterial(R: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uLevel: { value: 0 }, uGlow: { value: 0 }, uR: { value: R } },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      varying vec3 vWorld;
      void main() {
        vP = position.xy;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uLevel;
      uniform float uGlow;
      uniform float uR;
      varying vec2 vP;
      varying vec3 vWorld;
      void main() {
        float r = length(vP) / uR;
        float edge = 1.0 - smoothstep(1.3, 1.6, r);
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(V.y, 0.0), 2.0);
        float rip = pow(0.5 + 0.5 * sin(length(vP) * 7.0 - uTime * 2.2), 6.0) * (1.0 - smoothstep(1.1, 1.6, r));
        vec3 deep = vec3(0.05, 0.12, 0.19);
        vec3 skyc = vec3(0.44, 0.54, 0.74);
        vec3 col = mix(deep, skyc, 0.3 + fres * 0.55);
        col += vec3(0.7, 0.9, 1.0) * rip * (0.12 + 0.2 * uGlow);
        col += vec3(1.0, 0.66, 0.3) * (0.14 + 0.55 * uGlow) * pow(fres, 1.5);
        gl_FragColor = vec4(col, edge * smoothstep(0.0, 0.15, uLevel) * 0.9);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
}

/** A light carried along a tube: draws on to uHead, fades behind it, optional dashes and flow. */
export function trailMaterial(color: THREE.Color, opts: { dash?: number; flow?: number; len?: number; alpha?: number } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: {
      uHead: { value: 0 },
      uLen: { value: opts.len ?? 0.3 },
      uColor: { value: color },
      uDash: { value: opts.dash ?? 0 },
      uFlow: { value: opts.flow ?? 0 },
      uTime: { value: 0 },
      uAlpha: { value: opts.alpha ?? 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uHead;
      uniform float uLen;
      uniform vec3 uColor;
      uniform float uDash;
      uniform float uFlow;
      uniform float uTime;
      uniform float uAlpha;
      varying vec2 vUv;
      void main() {
        float behind = uHead - vUv.x;
        if (behind < 0.0) discard;
        float a = 1.0 - smoothstep(0.0, uLen, behind);
        if (a <= 0.001) discard;
        if (uDash > 0.0) a *= step(0.42, fract(vUv.x * uDash - uTime * 0.6));
        if (uFlow > 0.0) a *= 0.55 + 0.45 * sin(vUv.x * uFlow - uTime * 6.0);
        gl_FragColor = vec4(uColor * (0.5 + 1.5 * a * a), a * uAlpha);
      }
    `,
  })
}

let glow: THREE.Texture | undefined
/** A soft round glow for lamp heads and beacons. */
export function glowTexture() {
  if (glow) return glow
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.18, 'rgba(255,255,255,0.75)')
  grd.addColorStop(0.45, 'rgba(255,255,255,0.18)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 128, 128)
  glow = new THREE.CanvasTexture(c)
  glow.colorSpace = THREE.SRGBColorSpace
  return glow
}
