// Shared materials. Almost everything is one matte clay painted with vertex
// colours (see bake.ts), so a whole room costs a draw call. The few others:
// glossy money, glass that frosts while a grant is frozen, screens, lit lenses.

import { BackSide, Color, DoubleSide, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial } from 'three'
import { GRANT_TINT, PAL } from './layout'

export const CLAY = new MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 })
/** Brushed steel and chrome parts, still painted per vertex. */
export const METAL = new MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.55 })

const clay = (color: string, roughness = 0.86) => new MeshStandardMaterial({ color, roughness, metalness: 0 })

export const M = {
  labBody: clay(PAL.labBody),
  labTop: clay(PAL.labTop, 0.94),
  officeBody: clay(PAL.officeBody, 0.82),
  officeTop: clay(PAL.officeTop, 0.9),
  wire: new MeshStandardMaterial({ color: PAL.wire, roughness: 0.42, metalness: 0.35 }),
  thread: new MeshBasicMaterial({ color: '#3C4552' }),
  intake: new MeshBasicMaterial({ color: '#56606C' }),
  skin: new Map<string, MeshStandardMaterial>(),
  glove: clay('#7F8FE0', 0.55),
  goggles: new MeshPhysicalMaterial({ color: '#DCEBF5', roughness: 0.1, metalness: 0, transparent: true, opacity: 0.55, clearcoat: 1 }),
  screen: new MeshStandardMaterial({ color: '#22303D', roughness: 0.35, emissive: new Color('#8DB7DE'), emissiveIntensity: 0.32 }),
  cabinetLight: new MeshBasicMaterial({ color: '#FFF3DC', toneMapped: false }),
  window: new MeshPhysicalMaterial({ color: '#C9D3DC', roughness: 0.15, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.35, depthWrite: false }),
  lens: new MeshBasicMaterial({ color: PAL.lens, toneMapped: false }),
  outline: new MeshBasicMaterial({ color: '#FFFFFF', side: BackSide }),
  outlineSel: new MeshBasicMaterial({ color: PAL.ink, side: BackSide }),
  tag: Object.fromEntries(Object.entries(GRANT_TINT).map(([gid, c]) => [gid, clay(c, 0.6)])) as Record<string, MeshStandardMaterial>,
  crate: clay('#C9A67A', 0.9),
  crateBand: clay(PAL.celadon, 0.5),
}

export function skinMat(hex: string) {
  let m = M.skin.get(hex)
  if (!m) {
    m = clay(hex, 0.7)
    M.skin.set(hex, m)
  }
  return m
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
  m.customProgramCacheKey = () => 'a2-liquid'
  return m
}

/** Vessel glass: clear in the middle, bright at grazing angles, frosted while a grant is frozen. */
export function glass() {
  const m = new MeshPhysicalMaterial({
    color: '#F2F6FA',
    roughness: 0.06,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    transparent: true,
    opacity: 0.1,
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
          'float gF = uFrost * (0.7 + 0.12 * gN);',
          'gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.93, 0.96, 0.985), clamp(gF * 1.1, 0.0, 1.0));',
          'gl_FragColor.a = clamp(gl_FragColor.a + gFr * 0.38 + gF * 0.62, 0.0, 0.94);',
        ].join('\n'),
      )
  }
  m.customProgramCacheKey = () => 'a2-glass'
  return m
}
