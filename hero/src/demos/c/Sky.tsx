// Dusk: ink-blue overhead, slate toward the horizon, a last umber afterglow
// low in the west behind the grant landforms, and a few early stars.

import { useMemo } from 'react'
import * as THREE from 'three'

export function Sky() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_Position = p.xyww;
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec3 vDir;
          float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
          void main() {
            vec3 d = normalize(vDir);
            float h = d.y;
            vec3 ink = vec3(0.012, 0.02, 0.045);
            vec3 slate = vec3(0.07, 0.085, 0.13);
            vec3 col = mix(slate, ink, smoothstep(0.0, 0.5, h));
            vec2 w = normalize(vec2(-0.85, -0.55));
            float west = pow(max(dot(normalize(d.xz), w), 0.0), 2.5);
            float low = exp(-max(h, 0.0) * 7.0);
            col += vec3(0.42, 0.19, 0.08) * west * low * 0.9;
            col += vec3(0.16, 0.09, 0.07) * exp(-max(h, 0.0) * 16.0) * (0.5 + 0.5 * west);
            col = mix(col, vec3(0.03, 0.028, 0.03), smoothstep(0.0, -0.12, h));
            vec3 cell = floor(d * 220.0);
            float s = hash(cell);
            float star = step(0.9965, s) * smoothstep(0.12, 0.45, h) * (0.4 + 0.6 * hash(cell + 2.0));
            col += vec3(0.9, 0.92, 1.0) * star * 0.8;
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      }),
    [],
  )
  return (
    <mesh material={mat} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[300, 48, 24]} />
    </mesh>
  )
}
