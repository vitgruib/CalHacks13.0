// Shared materials: matte clay that takes its colour from the model's
// vertices, a glossy liquid with a fresnel edge for money, and glass for the
// freeze. Everything is made once at module level.

import { Color, DoubleSide, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial } from 'three'
import { PAL } from './layout'

const clay = (color: string, roughness = 0.88) => new MeshStandardMaterial({ color, roughness, metalness: 0 })

/** The one clay: colour comes from the vertices (see kit.ts). */
export const CLAY = new MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 })
/** The same, a touch of sheen for instruments, glassware and parcels. */
export const SHEEN = new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.35 })

export const M = {
  labBody: clay(PAL.labBody),
  labTop: clay(PAL.labTop, 0.94),
  officeBody: clay(PAL.officeBody, 0.82),
  officeTop: clay(PAL.officeTop, 0.9),
  chalk: clay(PAL.chalk),
  porcelain: clay(PAL.porcelain, 0.6),
  clay: clay(PAL.clay),
  clayDeep: clay(PAL.clayDeep),
  slate: clay(PAL.slate, 0.78),
  slateDeep: clay(PAL.slateDeep, 0.74),
  ink: clay(PAL.ink, 0.7),
  lens: new MeshBasicMaterial({ color: PAL.lens, toneMapped: false }),
  window: new MeshPhysicalMaterial({ color: '#D5DEE6', roughness: 0.12, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.32, depthWrite: false }),
  screen: new MeshStandardMaterial({ color: '#2A313A', roughness: 0.4, emissive: new Color('#9CC3E0'), emissiveIntensity: 0 }),
}

/** Money: glossy, with a bright fresnel rim and a pulse uniform for the moment a freeze lifts. */
export function liquid(color = PAL.money) {
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
  m.customProgramCacheKey = () => 'a-liquid'
  return m
}

/** Glass for the bell jar: clear in the middle, bright at grazing angles, frosted while a grant is frozen. */
export function glass() {
  const m = new MeshPhysicalMaterial({
    color: '#F2F6FA',
    roughness: 0.06,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
    side: DoubleSide,
    envMapIntensity: 1.6,
  })
  const u = { uFrost: { value: 0 }, uFade: { value: 0 } }
  m.userData.u = u
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, u)
    s.vertexShader = s.vertexShader.replace('void main() {', 'varying vec3 vAPos;\nvoid main() {\nvAPos = position;')
    s.fragmentShader = s.fragmentShader
      .replace('void main() {', 'uniform float uFrost; uniform float uFade; varying vec3 vAPos;\nvoid main() {')
      .replace(
        '#include <opaque_fragment>',
        [
          '#include <opaque_fragment>',
          'float gFr = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.4);',
          'float gN = fract(sin(dot(floor(vAPos * 38.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);',
          'float gF = uFrost * (0.62 - 0.22 * clamp(vAPos.y / 2.0, 0.0, 1.0) + 0.12 * gN);',
          'gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.94, 0.965, 0.985), clamp(gF * 1.1, 0.0, 1.0));',
          'gl_FragColor.a = clamp(gl_FragColor.a + gFr * 0.42 + gF * 0.62, 0.0, 0.92) * uFade;',
        ].join('\n'),
      )
  }
  m.customProgramCacheKey = () => 'a-glass'
  return m
}
