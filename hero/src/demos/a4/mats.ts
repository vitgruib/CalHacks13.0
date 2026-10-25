// Shared materials. Most of the scene is vertex-coloured clay merged into a
// few meshes; the rest is the real stuff a lab is made of: black epoxy-resin
// bench tops, brushed steel, glass, and the enamel of the transit map.

import { Color, DoubleSide, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial } from 'three'

export const M = {
  clay: new MeshStandardMaterial({ vertexColors: true, roughness: 0.84, metalness: 0 }),
  epoxy: new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.34, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.32 }),
  steel: new MeshStandardMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.82, envMapIntensity: 1.15 }),
  enamel: new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.28 }),
  glass: new MeshPhysicalMaterial({ color: '#E2EBF0', roughness: 0.06, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.2, depthWrite: false, envMapIntensity: 1.4 }),
  glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  skin: new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 }),
  glove: new MeshStandardMaterial({ color: '#5E8FDA', roughness: 0.55, metalness: 0 }),
  shadowCatcher: new MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0 }),
}

/** Money: glossy, with a bright fresnel rim and a pulse uniform for the moment a freeze lifts. */
export function liquid(color = '#2F9DB5') {
  const m = new MeshPhysicalMaterial({ color, roughness: 0.14, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.3 })
  const u = { uRim: { value: new Color('#E9FBFF') }, uRimK: { value: 0.55 }, uPulse: { value: 0 } }
  m.userData.u = u
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, u)
    s.fragmentShader = s.fragmentShader
      .replace('void main() {', 'uniform vec3 uRim; uniform float uRimK; uniform float uPulse;\nvoid main() {')
      .replace(
        '#include <opaque_fragment>',
        'float aFr = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 3.0);\noutgoingLight += uRim * (aFr * uRimK + uPulse * 0.45);\n#include <opaque_fragment>',
      )
  }
  m.customProgramCacheKey = () => 'a4-liquid'
  return m
}

/** Glass for a grant's vessel: clear in the middle, bright at grazing angles, frosted while the grant is frozen. */
export function frostGlass() {
  const m = new MeshPhysicalMaterial({
    color: '#F2F6FA',
    roughness: 0.06,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
    side: DoubleSide,
    envMapIntensity: 1.6,
  })
  const u = { uFrost: { value: 0 } }
  m.userData.u = u
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, u)
    s.vertexShader = s.vertexShader.replace('void main() {', 'varying vec3 vAPos;\nvoid main() {\nvAPos = position;')
    s.fragmentShader = s.fragmentShader
      .replace('void main() {', 'uniform float uFrost; varying vec3 vAPos;\nvoid main() {')
      .replace(
        '#include <opaque_fragment>',
        [
          '#include <opaque_fragment>',
          'float gFr = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.4);',
          'float gN = fract(sin(dot(floor(vAPos * 40.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);',
          'float gF = uFrost * (0.66 - 0.2 * clamp(vAPos.y / 1.2, 0.0, 1.0) + 0.12 * gN);',
          'gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.94, 0.965, 0.985), clamp(gF * 1.1, 0.0, 1.0));',
          'gl_FragColor.a = clamp(gl_FragColor.a + gFr * 0.4 + gF * 0.62, 0.0, 0.92);',
        ].join('\n'),
      )
  }
  m.customProgramCacheKey = () => 'a4-frost'
  return m
}
