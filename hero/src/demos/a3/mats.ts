// Shared materials: matte clay with a little tonal drift for the dioramas,
// a glossy liquid with a fresnel edge for money, glass for the freeze, and
// a small set of real-ish finishes (steel, chrome, amber glass) for the
// things researchers buy.

import { Color, DoubleSide, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial } from 'three'
import { PAL } from './layout'

const clay = (color: string, roughness = 0.88) => new MeshStandardMaterial({ color, roughness, metalness: 0 })
const glaze = (color: string) => new MeshPhysicalMaterial({ color, roughness: 0.3, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.2 })
const glow = (color: string, k = 1) => new MeshStandardMaterial({ color, roughness: 0.5, emissive: new Color(color), emissiveIntensity: k })

export const M = {
  labBody: clay(PAL.labBody),
  labTop: clay(PAL.labTop, 0.94),
  floor: clay(PAL.floor, 0.95),
  wall: clay(PAL.wall, 0.92),
  officeBody: clay(PAL.officeBody, 0.82),
  officeTop: clay(PAL.officeTop, 0.9),
  tableTop: clay(PAL.tableTop, 0.86),
  chalk: clay(PAL.chalk),
  porcelain: clay(PAL.porcelain, 0.6),
  clay: clay(PAL.clay),
  clayDeep: clay(PAL.clayDeep),
  slate: clay(PAL.slate, 0.78),
  slateDeep: clay(PAL.slateDeep, 0.74),
  ink: clay(PAL.ink, 0.7),
  board: clay('#FAF8F4', 0.4),
  dark: clay('#2A313A', 0.55),
  epoxy: clay('#3B4350', 0.5),
  steel: new MeshStandardMaterial({ color: '#B9BEC4', roughness: 0.38, metalness: 0.65 }),
  chrome: new MeshStandardMaterial({ color: '#C9CED4', roughness: 0.16, metalness: 0.9 }),
  titanium: new MeshStandardMaterial({ color: '#A9B0B8', roughness: 0.34, metalness: 0.8 }),
  rubber: clay('#2B2F35', 0.7),
  blueGlove: clay('#6E9FD6', 0.55),
  glovesBox: clay('#3E7CC4', 0.7),
  agar: clay('#D9A441', 0.45),
  tipLid: new MeshPhysicalMaterial({ color: '#3D9C8F', roughness: 0.25, transparent: true, opacity: 0.72, clearcoat: 0.6 }),
  tipYellow: clay('#E9D58A', 0.5),
  amber: new MeshPhysicalMaterial({ color: '#A8641E', roughness: 0.2, clearcoat: 0.9, transmission: 0, metalness: 0 }),
  label: clay('#FBF9F5', 0.75),
  cap: clay('#1E2126', 0.5),
  kitWhite: clay('#F7F5F1', 0.7),
  wellPlate: clay('#E5ECF1', 0.45),
  pizza: clay('#C9A06A', 0.9),
  carton: clay('#C49A6C', 0.92),
  tape: clay('#D9C29A', 0.6),
  wood: clay('#B98F66', 0.8),
  bioRed: clay('#B4413A', 0.7),
  eyewash: clay('#4E9E6A', 0.6),
  yellow: clay('#E2B64A', 0.6),
  gelBlue: new MeshPhysicalMaterial({ color: '#8FB7E0', roughness: 0.2, transparent: true, opacity: 0.8 }),
  lens: new MeshBasicMaterial({ color: PAL.lens, toneMapped: false }),
  screen: glow('#CFE3F2', 0.55),
  screenWarm: glow('#F1E6CF', 0.45),
  cabinetLight: glow('#F4F7F2', 0.9),
  glazeAccept: glaze(PAL.celadon),
  glazeRefine: glaze(PAL.ochre),
  glazeReject: glaze(PAL.oxblood),
  glazeHold: glaze(PAL.cobalt),
  bisque: clay('#EFEAE2', 0.8),
  paper: clay('#F7F4EF', 0.7),
  window: new MeshPhysicalMaterial({ color: '#C9D3DC', roughness: 0.15, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.4, depthWrite: false }),
  clear: new MeshPhysicalMaterial({ color: '#E8F0F5', roughness: 0.12, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.45, depthWrite: false }),
  frost: new MeshPhysicalMaterial({ color: '#EAF2F8', roughness: 0.5, transparent: true, opacity: 0.55, depthWrite: false, side: DoubleSide }),
  hidden: new MeshBasicMaterial({ visible: false }),
}

/** A clay finish in any colour, made once per colour. */
const tones = new Map<string, MeshStandardMaterial>()
export function tone(color: string, roughness = 0.84) {
  const key = `${color}:${roughness}`
  let m = tones.get(key)
  if (!m) {
    m = clay(color, roughness)
    tones.set(key, m)
  }
  return m
}

export const glazeFor = (o?: string) =>
  o === 'accept' ? M.glazeAccept : o === 'refine' ? M.glazeRefine : o === 'reject' ? M.glazeReject : o === 'hold' ? M.glazeHold : M.bisque

/** The same clay, nudged a few percent lighter or darker, so a room of objects doesn't read as one flat colour. */
const drift = new Map<string, MeshStandardMaterial>()
export function vary(m: MeshStandardMaterial, seed: number): MeshStandardMaterial {
  const k = ((seed * 7919) % 5) - 2
  if (k === 0) return m
  const key = `${m.uuid}:${k}`
  let v = drift.get(key)
  if (!v) {
    v = m.clone()
    v.color.offsetHSL(0, 0, k * 0.018)
    drift.set(key, v)
  }
  return v
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
  m.customProgramCacheKey = () => 'a3-liquid'
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
          'float gF = uFrost * (0.62 - 0.22 * clamp(vAPos.y / 1.6, 0.0, 1.0) + 0.12 * gN);',
          'gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.94, 0.965, 0.985), clamp(gF * 1.1, 0.0, 1.0));',
          'gl_FragColor.a = clamp(gl_FragColor.a + gFr * 0.42 + gF * 0.62, 0.0, 0.92) * uFade;',
        ].join('\n'),
      )
  }
  m.customProgramCacheKey = () => 'a3-glass'
  return m
}
