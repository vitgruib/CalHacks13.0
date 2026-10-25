// Shared materials. The lab is one matte clay with painted vertex colours,
// a sheen variant for steel and epoxy, and an unlit one for the practical
// lights (screens, lamps, the cabinet's work light) that the bloom picks up.

import { AdditiveBlending, Color, DoubleSide, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial } from 'three'
import { PAL } from './layout'

export const M = {
  clay: new MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 }),
  sheen: new MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.25 }),
  glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  net: new MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.08 }),
  item: new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 }),
  spill: new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
  plinthLab: new MeshStandardMaterial({ color: PAL.labBody, roughness: 0.9 }),
  plinthNet: new MeshStandardMaterial({ color: PAL.netBody, roughness: 0.7, metalness: 0.1 }),
  netTop: new MeshStandardMaterial({ color: PAL.netTop, roughness: 0.55, metalness: 0.15 }),
}

/** Each figure gets its own copy so a hovered one can brighten alone; the shader is shared. */
export function figureMat() {
  return new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, side: DoubleSide, emissive: new Color('#000000') })
}

/** An unlit colour whose brightness the scene drives (node rings, rule lights, lamps). */
export const lightMat = (hex = '#FFFFFF') => new MeshBasicMaterial({ color: hex, toneMapped: false })

/** Money: a glowing dye in the grant's colour, with a bright rim and a pulse for the moment a freeze lifts. */
export function liquid(hex: string) {
  const m = new MeshPhysicalMaterial({ color: hex, roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1, emissive: new Color(hex), emissiveIntensity: 0.55 })
  const u = { uRim: { value: new Color('#F2FBFF') }, uRimK: { value: 0.5 }, uPulse: { value: 0 } }
  m.userData.u = u
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, u)
    s.fragmentShader = s.fragmentShader
      .replace('void main() {', 'uniform vec3 uRim; uniform float uRimK; uniform float uPulse;\nvoid main() {')
      .replace(
        '#include <opaque_fragment>',
        'float aFr = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 3.0);\noutgoingLight += uRim * (aFr * uRimK + uPulse * 0.6);\n#include <opaque_fragment>',
      )
  }
  m.customProgramCacheKey = () => 'a5-liquid'
  return m
}

/** Glass for a grant's vessel: clear in the middle, bright at grazing angles, frosted while the grant is frozen. */
export function glass() {
  const m = new MeshPhysicalMaterial({
    color: '#E8F0FA',
    roughness: 0.08,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
    side: DoubleSide,
    envMapIntensity: 1.4,
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
          'float gFr = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.2);',
          'float gN = fract(sin(dot(floor(vAPos * 40.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);',
          'float gF = uFrost * (0.7 - 0.25 * clamp(vAPos.y / 1.2, 0.0, 1.0) + 0.14 * gN);',
          'gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.86, 0.93, 1.0), clamp(gF * 1.1, 0.0, 1.0));',
          'gl_FragColor.a = clamp(gl_FragColor.a + gFr * 0.4 + gF * 0.6, 0.0, 0.9);',
        ].join('\n'),
      )
  }
  m.customProgramCacheKey = () => 'a5-glass'
  return m
}
