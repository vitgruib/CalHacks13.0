// The thing a researcher asked for, as a small clay model. Each kind is one
// vertex-coloured geometry about a unit across, centred on its middle, so a
// parcel in flight (scaled to about 1.1) reads at 40 to 60 px on a 1440×900 hero.

import type { BufferGeometry } from 'three'
import type { ItemKind } from '../../feed'
import { kit } from './kit'

const PI = Math.PI

function gloves() {
  const k = kit()
  k.box([0, 0, 0], [0.86, 0.42, 0.46], '#4A7FC1', 0.05)
  k.box([0, 0.212, 0], [0.42, 0.008, 0.2], '#EEF3F8', 0.004)
  k.box([-0.3, 0.05, 0.232], [0.18, 0.2, 0.006], '#EEF3F8', 0.004)
  // A cuff and two fingers poking out of the slot.
  k.capsule([0.02, 0.29, 0], 0.075, 0.08, '#7DB2E8', { rot: [0, 0, 1.2] })
  k.capsule([-0.09, 0.34, 0.02], 0.03, 0.08, '#7DB2E8', { rot: [0.3, 0, 0.4] })
  k.capsule([-0.02, 0.36, -0.03], 0.03, 0.08, '#7DB2E8', { rot: [-0.3, 0, 0.2] })
  return k.build()
}

function plates() {
  const k = kit()
  for (let i = 0; i < 4; i++) {
    const y = -0.24 + i * 0.15
    // Clear plastic shows the amber agar through it: amber lid, a pale rim.
    k.cyl([0, y - 0.03, 0], 0.42, 0.07, '#D9A441', 28)
    k.cyl([0, y + 0.03, 0], 0.42, 0.05, '#EEE6D2', 28)
    k.cyl([0, y + 0.065, 0], 0.4, 0.02, '#E2B65A', 28)
    k.torus([0, y + 0.066, 0], 0.415, 0.012, '#F4EFE4', { rot: [PI / 2, 0, 0] }, PI * 2, 28)
  }
  return k.build()
}

function tips() {
  const k = kit()
  k.box([0, -0.12, 0], [0.8, 0.3, 0.56], '#3F70B8', 0.04)
  k.box([0, 0.04, 0], [0.76, 0.03, 0.52], '#D7E3EE', 0.01)
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 4; j++) k.cyl([-0.3 + i * 0.12, 0.13, -0.18 + j * 0.12], 0.035, 0.16, '#F1D36B', 8, {}, 0.02)
  // The clear lid, hinged open at the back.
  k.box([0, 0.36, -0.3], [0.8, 0.02, 0.5], '#E4EEF6', 0.006, { rot: [1.15, 0, 0] })
  return k.build()
}

function bottle() {
  const k = kit()
  k.cyl([0, -0.12, 0], 0.27, 0.58, '#B8742A', 24)
  k.cyl([0, -0.1, 0], 0.276, 0.26, '#F4F1EA', 24)
  k.box([0, -0.1, 0.27], [0.2, 0.05, 0.02], '#2E5BA6', 0.004)
  k.lathe([0, 0.17, 0], [[0.27, 0], [0.2, 0.08], [0.12, 0.12], [0, 0.12]], '#B8742A')
  k.cyl([0, 0.36, 0], 0.13, 0.16, '#1E2227', 20)
  return k.build()
}

function kitBox() {
  const k = kit()
  k.box([0, -0.1, 0], [0.86, 0.34, 0.6], '#F3F1EC', 0.04)
  k.box([0, -0.1, 0.302], [0.4, 0.12, 0.004], '#2E5BA6', 0.002)
  // The 96-well plate inside, and the lid propped open.
  k.box([0, 0.08, 0], [0.62, 0.05, 0.42], '#D8DCE0', 0.01)
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) k.cyl([-0.25 + i * 0.1, 0.106, -0.15 + j * 0.1], 0.028, 0.006, '#9AA3AD', 10)
  k.box([0, 0.3, -0.36], [0.86, 0.035, 0.6], '#F3F1EC', 0.012, { rot: [1.0, 0, 0] })
  return k.build()
}

function dishes() {
  const k = kit()
  k.cyl([0, 0, 0], 0.27, 0.86, '#E8F0F4', 24, { rot: [0, 0, PI / 2] }, 0.27, false)
  for (let i = 0; i < 6; i++) k.cyl([-0.34 + i * 0.136, 0, 0], 0.24, 0.07, '#BFD6E2', 22, { rot: [0, 0, PI / 2] })
  k.cyl([0.44, 0, 0], 0.28, 0.04, '#2E5BA6', 22, { rot: [0, 0, PI / 2] })
  return k.build()
}

function pump() {
  const k = kit()
  k.box([0, -0.1, 0], [0.8, 0.4, 0.56], '#A7AFB8', 0.05)
  k.box([0.18, -0.06, 0.282], [0.3, 0.16, 0.01], '#2A3038', 0.006)
  k.cyl([-0.2, 0.0, 0.3], 0.18, 0.1, '#D8DDE2', 24, { rot: [PI / 2, 0, 0] })
  k.cyl([-0.2, 0.0, 0.36], 0.06, 0.06, '#5A626B', 12, { rot: [PI / 2, 0, 0] })
  k.torus([-0.2, 0.06, 0.36], 0.24, 0.025, '#D98C5F', { rot: [0, 0, 0] }, PI * 1.3, 20)
  k.cyl([0.3, 0.14, 0.12], 0.03, 0.12, '#D98C5F', 8)
  return k.build()
}

function rotor() {
  const k = kit()
  k.lathe([0, -0.18, 0], [[0, 0], [0.44, 0], [0.48, 0.06], [0.46, 0.2], [0.32, 0.3], [0, 0.32]], '#C5CBD1', {}, 36)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2
    k.cyl([Math.cos(a) * 0.3, 0.08, Math.sin(a) * 0.3], 0.075, 0.08, '#4A525B', 14, { rot: [0, 0, Math.cos(a) * 0.35] })
  }
  k.cyl([0, 0.16, 0], 0.08, 0.14, '#8E979F', 16)
  return k.build()
}

function espresso() {
  const k = kit()
  k.box([0, -0.02, -0.06], [0.62, 0.62, 0.5], '#D4DAE0', 0.06)
  k.box([0, -0.31, 0.12], [0.62, 0.05, 0.42], '#9EA7B0', 0.015)
  k.box([0, 0.22, 0.2], [0.46, 0.08, 0.06], '#2A3038', 0.02)
  k.cyl([0, 0.05, 0.24], 0.09, 0.08, '#B6BEC6', 16)
  k.capsule([0.16, 0.02, 0.34], 0.03, 0.2, '#1E2227', { rot: [0, 0.6, PI / 2] })
  k.lathe([0, -0.28, 0.2], [[0, 0], [0.07, 0], [0.09, 0.12], [0, 0.12]], '#F4F1EA', {}, 16)
  k.cyl([-0.2, 0.32, -0.15], 0.05, 0.05, '#1E2227', 12)
  return k.build()
}

function service() {
  const k = kit()
  k.box([0, 0, 0], [0.62, 0.05, 0.82], '#B98A57', 0.02)
  k.box([0, 0.035, 0.03], [0.54, 0.02, 0.7], '#F6F3EC', 0.006)
  for (let i = 0; i < 4; i++) k.box([-0.06, 0.047, -0.18 + i * 0.12], [0.36, 0.004, 0.028], '#9AA3AD', 0.001)
  k.box([0, 0.06, -0.38], [0.24, 0.05, 0.08], '#8E979F', 0.012)
  // A wrench across the page.
  k.box([0.06, 0.08, 0.2], [0.46, 0.04, 0.07], '#7F8891', 0.015, { rot: [0, 0.6, 0] })
  k.torus([0.27, 0.08, 0.06], 0.07, 0.03, '#7F8891', { rot: [PI / 2, 0, 0] }, PI * 1.5, 14)
  return k.build()
}

function food() {
  const k = kit()
  k.box([0, 0, 0], [0.86, 0.14, 0.86], '#C9A47A', 0.025)
  k.cyl([0, 0.073, 0], 0.18, 0.004, '#B5452F', 24)
  k.box([0, 0.074, 0.36], [0.3, 0.004, 0.05], '#B5452F', 0.001)
  return k.build()
}

function chair() {
  const k = kit()
  k.box([0, -0.02, 0.02], [0.5, 0.08, 0.48], '#3B4A5C', 0.03)
  k.box([0, 0.26, -0.22], [0.46, 0.46, 0.06], '#3B4A5C', 0.03, { rot: [-0.12, 0, 0] })
  k.cyl([0, -0.2, 0], 0.035, 0.3, '#8E979F', 10)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2
    k.box([Math.cos(a) * 0.15, -0.36, Math.sin(a) * 0.15], [0.3, 0.035, 0.05], '#2A3038', 0.01, { rot: [0, -a, 0] })
    k.sphere([Math.cos(a) * 0.29, -0.4, Math.sin(a) * 0.29], 0.04, '#2A3038', {}, 8, 6)
  }
  return k.build()
}

function carton() {
  const k = kit()
  k.box([0, 0, 0], [0.8, 0.56, 0.6], '#C9A47A', 0.03)
  k.box([0, 0.282, 0], [0.8, 0.006, 0.14], '#E7D8BC', 0.002)
  k.box([0.22, 0.05, 0.302], [0.2, 0.14, 0.004], '#F4F1EA', 0.002)
  return k.build()
}

export const ITEM_GEO: Record<ItemKind, BufferGeometry> = {
  gloves: gloves(),
  plates: plates(),
  tips: tips(),
  bottle: bottle(),
  kit: kitBox(),
  dishes: dishes(),
  pump: pump(),
  rotor: rotor(),
  espresso: espresso(),
  service: service(),
  food: food(),
  chair: chair(),
  carton: carton(),
}
export const ITEM_KINDS = Object.keys(ITEM_GEO) as ItemKind[]

/** An open kraft tray a bought item comes home in. */
export const TRAY_GEO = (() => {
  const k = kit()
  k.box([0, -0.3, 0], [1.02, 0.06, 0.8], '#C9A47A', 0.02)
  k.box([0, -0.18, 0.39], [1.02, 0.28, 0.03], '#C9A47A', 0.01)
  k.box([0, -0.18, -0.39], [1.02, 0.28, 0.03], '#C9A47A', 0.01)
  k.box([0.5, -0.18, 0], [0.03, 0.28, 0.8], '#BE9767', 0.01)
  k.box([-0.5, -0.18, 0], [0.03, 0.28, 0.8], '#BE9767', 0.01)
  return k.build()
})()

/** A tag tied to a parcel: its colour says what happened (or which grant pays). White, tinted per instance. */
export const TAG_GEO = (() => {
  const k = kit()
  k.box([0, 0, 0], [0.26, 0.2, 0.03], '#FFFFFF', 0.012)
  k.cyl([0, 0.07, 0.017], 0.025, 0.01, '#D9D9D9', 10, { rot: [PI / 2, 0, 0] })
  return k.build()
})()

/** Paper: invoices, holds, decisions, payment requests, follow-ups, papers. White, tinted per instance. */
export const SLIP_GEO = (() => {
  const k = kit()
  k.box([0, 0, 0], [0.46, 0.035, 0.6], '#FFFFFF', 0.01)
  k.box([0, 0.02, -0.12], [0.3, 0.004, 0.035], '#C8CCD0', 0.001)
  k.box([0, 0.02, -0.02], [0.3, 0.004, 0.035], '#C8CCD0', 0.001)
  k.box([0, 0.02, 0.08], [0.2, 0.004, 0.035], '#C8CCD0', 0.001)
  return k.build()
})()
