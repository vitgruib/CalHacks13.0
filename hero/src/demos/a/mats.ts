// Shared materials: matte clay and porcelain for the dioramas, glossy glazes
// for the outcome tokens only, frosted glass for the freeze.

import { DoubleSide, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial } from 'three'
import { PAL } from './layout'

const clay = (color: string, roughness = 0.9) => new MeshStandardMaterial({ color, roughness, metalness: 0 })
const glaze = (color: string) => new MeshPhysicalMaterial({ color, roughness: 0.24, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.14 })

export const M = {
  labBody: clay(PAL.labBody),
  labTop: clay(PAL.labTop, 0.95),
  officeBody: clay(PAL.officeBody),
  officeTop: clay(PAL.officeTop, 0.95),
  chalk: clay(PAL.chalk),
  porcelain: clay(PAL.porcelain, 0.55),
  clay: clay(PAL.clay),
  clayDeep: clay(PAL.clayDeep),
  slate: clay(PAL.slate, 0.8),
  slateDeep: clay(PAL.slateDeep, 0.75),
  ink: clay(PAL.ink, 0.7),
  board: clay('#F6F7F8', 0.35),
  coat: clay('#EEF1F4', 0.85),
  head: clay('#A3AEBA', 0.85),
  money: new MeshPhysicalMaterial({ color: PAL.money, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
  glass: new MeshPhysicalMaterial({ color: '#DCE6EE', roughness: 0.2, transparent: true, opacity: 0.32, depthWrite: false, side: DoubleSide }),
  dark: clay('#2A333D', 0.6),
  lens: new MeshBasicMaterial({ color: PAL.lens, toneMapped: false }),
  glazeAccept: glaze(PAL.celadon),
  glazeRefine: glaze(PAL.ochre),
  glazeReject: glaze(PAL.oxblood),
  glazeHold: glaze(PAL.cobalt),
  bisque: clay('#EEF0F2', 0.8),
  paper: clay('#F5F6F7', 0.7),
}

export const glazeFor = (o?: string) =>
  o === 'accept' ? M.glazeAccept : o === 'refine' ? M.glazeRefine : o === 'reject' ? M.glazeReject : o === 'hold' ? M.glazeHold : M.bisque
