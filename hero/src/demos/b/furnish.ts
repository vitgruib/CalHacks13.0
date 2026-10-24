// What stands in each room: a tray (floor liner and side walls, so the room
// can slide out like a drawer), its furniture, and its tube terminal.

import * as THREE from 'three'
import { Kit, type Part } from './kit'
import { FH, INTAKE_X, OUTLET_X, RULE_Y, STATION_X, TRACK_Z, terminalOf, TZ, ZB, ZF, type Room } from './layout'

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export function furnish(room: Room): Part[] {
  const k = new Kit()
  const { x0, x1, y0, kind } = room
  const f = y0 + 0.16 // top of the floor liner
  const ih = FH - 0.28 // inside height
  const dark = kind === 'confocal'

  // The tray
  k.box('wood', (x0 + x1) / 2, y0 + 0.14, 0, x1 - x0 - 0.12, 0.04, ZF - ZB - 0.04)
  const side = dark ? 'chipDark' : 'wall'
  k.box(side, x0 + 0.1, y0 + 0.12 + ih / 2, 0, 0.08, ih, ZF - ZB - 0.04)
  k.box(side, x1 - 0.1, y0 + 0.12 + ih / 2, 0, 0.08, ih, ZF - ZB - 0.04)

  // Tube terminal: a basswood cup where capsules land
  const terminal = (p: THREE.Vector3) => {
    k.blk('wood', p.x, p.y - 0.42, p.z + 0.05, 0.5, 0.1, 0.5)
    k.blk('card', p.x, p.y - 0.62, ZB + 0.2, 0.5, 0.3, 0.22)
  }
  if (kind !== 'rules' && kind !== 'gm') terminal(terminalOf(room.node))

  const bench = (cx: number, w: number, z = -1.75, d = 0.75, h = 0.86) => {
    k.blk('card', cx, f, z, w, h, d)
    k.blk('wood', cx, f + h, z, w + 0.08, 0.05, d + 0.06)
  }
  const desk = (cx: number, w: number, z: number) => {
    k.blk('wood', cx, f + 0.72, z, w, 0.05, 0.78)
    k.blk('card', cx - w / 2 + 0.22, f, z, 0.38, 0.72, 0.72)
    k.blk('card', cx + w / 2 - 0.05, f, z, 0.06, 0.72, 0.72)
  }
  const monitor = (cx: number, z: number, w = 0.62) => {
    k.blk('card', cx, f + 0.77, z, 0.08, 0.2, 0.08)
    k.box('screen', cx, f + 1.12, z + 0.02, w, 0.36, 0.035)
    k.box('ink', cx, f + 1.12, z - 0.01, w + 0.04, 0.4, 0.02)
  }
  const unit = (cx: number, z = -1.95) => {
    // the agent's cabinet; its identity lamp is drawn by the room
    k.blk('card', cx, f, z, 0.62, 1.15, 0.55)
    k.box('ink', cx, f + 0.85, z + 0.28, 0.4, 0.12, 0.01)
  }

  switch (kind) {
    case 'supply': {
      for (const sx of [-13.2, -11.8, -10.4]) {
        k.blk('card', sx - 0.6, f, -1.9, 0.05, 2.3, 0.62)
        k.blk('card', sx + 0.6, f, -1.9, 0.05, 2.3, 0.62)
        for (let s = 0; s < 4; s++) {
          const sy = f + 0.12 + s * 0.68
          k.blk('wood', sx, sy, -1.9, 1.2, 0.04, 0.6)
          for (let b = 0; b < 3; b++) {
            const bw = 0.24 + ((s + b + sx) % 3 === 0 ? 0.08 : 0)
            k.blk(b === 1 && s % 2 ? 'chip' : 'card', sx - 0.36 + b * 0.36, sy + 0.04, -1.9, bw, 0.22 + (b % 2) * 0.12, 0.42)
          }
        }
      }
      // the −80 °C freezer
      k.blk('card', -8.8, f, -1.72, 1.05, 2.1, 0.92)
      k.box('screen', -8.8, f + 1.78, -1.25, 0.32, 0.12, 0.02)
      k.rod('steel', V(-8.38, f + 0.9, -1.22), V(-8.38, f + 1.5, -1.22), 0.025, 6)
      // receiving table with a delivery
      bench(-6.9, 1.5, -1.0, 0.8, 0.82)
      k.blk('wood', -7.2, f + 0.87, -1.0, 0.5, 0.36, 0.42)
      k.blk('woodDark', -6.65, f + 0.87, -1.05, 0.34, 0.24, 0.32)
      desk(-3.4, 1.4, -1.4)
      monitor(-3.4, -1.65)
      break
    }
    case 'micro': {
      // biosafety cabinet
      k.blk('card', -12.9, f, -1.6, 1.5, 0.86, 1.0)
      k.blk('card', -12.9, f + 0.86, -1.82, 1.5, 1.28, 0.62)
      k.blk('card', -12.9, f + 0.86, -1.2, 1.5, 0.06, 0.62)
      k.box('acrylic', -12.9, f + 1.36, -1.13, 1.38, 0.62, 0.03)
      k.blk('card', -12.9, f + 2.14, -1.75, 1.5, 0.32, 0.76)
      // bench, plates, incubator, reagent shelf
      bench(-10.7, 2.5)
      for (let i = 0; i < 5; i++) k.cyl('paper', -11.6 + i * 0.2, f + 0.91, -1.55, 0.075, 0.035 * (2 + (i % 3)))
      k.blk('card', -9.8, f + 0.91, -1.88, 0.62, 0.52, 0.5)
      k.box('glass', -9.8, f + 1.17, -1.62, 0.4, 0.3, 0.01)
      k.blk('wood', -10.7, f + 1.62, -2.17, 2.4, 0.04, 0.32)
      for (let i = 0; i < 6; i++) k.cyl(i % 2 ? 'acrylic' : 'paper', -11.6 + i * 0.36, f + 1.66, -2.15, 0.06, 0.2 + (i % 3) * 0.05)
      break
    }
    case 'purify': {
      bench(-5.55, 3.9)
      k.blk('card', -6.75, f + 0.91, -1.85, 0.82, 0.78, 0.5)
      k.box('screen', -6.75, f + 1.45, -1.59, 0.36, 0.16, 0.01)
      k.rod('steel', V(-5.95, f + 0.91, -1.85), V(-5.95, f + 1.75, -1.85), 0.02, 6)
      for (let i = 0; i < 4; i++) k.cyl('acrylic', -5.8 + i * 0.16, f + 1.05, -1.78, 0.045, 0.62)
      k.blk('acrylic', -4.5, f + 0.91, -1.7, 0.52, 0.16, 0.32)
      k.blk('ink', -3.95, f + 0.91, -1.86, 0.32, 0.26, 0.3)
      k.blk('wood', -5.55, f + 1.62, -2.17, 3.6, 0.04, 0.32)
      for (let i = 0; i < 7; i++) k.cyl(i % 3 ? 'paper' : 'acrylic', -7.0 + i * 0.45, f + 1.66, -2.15, 0.07, 0.24)
      break
    }
    case 'office': {
      // bookshelf, whiteboard with aim 3, desk
      k.blk('card', -13.65, f, -1.98, 0.68, 2.25, 0.42)
      for (let s = 0; s < 4; s++) {
        k.blk('wood', -13.65, f + 0.1 + s * 0.56, -1.98, 0.64, 0.03, 0.4)
        for (let b = 0; b < 5; b++) k.blk(b % 3 ? 'card' : 'woodDark', -13.88 + b * 0.11, f + 0.13 + s * 0.56, -1.9, 0.08, 0.32 + ((b * 7 + s) % 3) * 0.05, 0.26)
      }
      k.box('paper', -11.9, f + 1.6, -2.28, 2.3, 1.15, 0.03)
      k.box('wood', -11.9, f + 1.0, -2.24, 2.3, 0.05, 0.08)
      const ink = (ax: number, ay: number, bx: number, by: number) => k.rod('ink', V(ax, f + ay, -2.25), V(bx, f + by, -2.25), 0.012, 4)
      ink(-12.8, 1.9, -12.3, 1.9)
      ink(-12.3, 1.9, -12.0, 1.5)
      ink(-12.0, 1.5, -11.4, 1.5)
      ink(-11.4, 1.5, -11.1, 1.95)
      ink(-12.8, 1.4, -12.4, 1.3)
      ink(-11.6, 1.9, -11.2, 1.9)
      desk(-10.0, 1.7, -0.75)
      monitor(-10.1, -1.0)
      k.blk('card', -10.0, f, 0.1, 0.5, 0.45, 0.5)
      break
    }
    case 'confocal': {
      k.blk('chipDark', -5.6, f, -1.3, 2.4, 0.82, 1.2)
      k.blk('steel', -5.6, f + 0.82, -1.3, 2.5, 0.08, 1.26)
      k.blk('card', -5.85, f + 0.9, -1.4, 0.55, 0.36, 0.52)
      k.cyl('card', -5.85, f + 1.26, -1.45, 0.13, 0.52)
      k.cyl('steel', -5.85, f + 1.0, -1.18, 0.07, 0.2)
      k.blk('card', -4.85, f + 0.9, -1.55, 0.75, 0.3, 0.45)
      k.rod('money', V(-4.47, f + 1.05, -1.55), V(-6.0, f + 1.05, -1.55), 0.008, 4)
      desk(-3.5, 1.4, -1.15)
      monitor(-3.85, -1.38, 0.55)
      monitor(-3.2, -1.38, 0.55)
      break
    }
    case 'gm': {
      // the inbox tray sits under the terminal
      k.blk('card', 2.7, f, -1.25, 0.95, 0.86, 0.7)
      k.blk('wood', 2.7, f + 0.86, -1.2, 0.8, 0.09, 0.56)
      desk(4.7, 2.2, -0.95)
      monitor(5.2, -1.15)
      k.blk('paper', 4.2, f + 0.77, -0.8, 0.42, 0.03, 0.3)
      k.blk('card', 7.0, f, -1.92, 0.62, 1.32, 0.62)
      break
    }
    case 'dispatch': {
      // pigeonholes for exact purchase records
      const px = 11.0
      for (let c = 0; c <= 5; c++) k.blk('card', px - 1.3 + c * 0.52, f + 0.5, -2.05, 0.04, 1.6, 0.36)
      for (let r = 0; r <= 4; r++) k.blk('card', px, f + 0.5 + r * 0.39, -2.05, 2.64, 0.04, 0.36)
      for (let i = 0; i < 9; i++) k.blk('paper', px - 1.04 + (i % 5) * 0.52, f + 0.54 + Math.floor(i / 5) * 0.78, -2.0, 0.3, 0.04 + (i % 3) * 0.02, 0.26)
      k.blk('card', px, f, -1.9, 2.7, 0.5, 0.6)
      // the press that writes payment requests
      k.blk('card', 13.1, f, -1.55, 1.0, 1.0, 0.85)
      k.box('ink', 13.1, f + 0.78, -1.12, 0.62, 0.05, 0.02)
      k.blk('wood', 13.1, f + 1.0, -1.25, 0.8, 0.04, 0.4)
      unit(9.1)
      break
    }
    case 'rules': {
      // the track a request rides through the six stations
      k.rod('acrylic', V(INTAKE_X, RULE_Y, TRACK_Z), V(OUTLET_X, RULE_Y, TRACK_Z), 0.17, 16)
      for (const x of [INTAKE_X, OUTLET_X]) {
        k.rod('acrylic', V(x, RULE_Y, TRACK_Z), V(x, RULE_Y, TZ), 0.17, 14)
        k.ball('acrylic', x, RULE_Y, TRACK_Z, 0.17)
        k.ball('acrylic', x, RULE_Y, TZ, 0.17)
        k.blk('wood', x, f, TRACK_Z, 0.5, RULE_Y - f - 0.18, 0.5)
      }
      for (const x of STATION_X) {
        k.blk('wood', x - 0.36, f, TRACK_Z, 0.09, RULE_Y - f + 0.45, 0.09)
        k.blk('wood', x + 0.36, f, TRACK_Z, 0.09, RULE_Y - f + 0.45, 0.09)
        k.blk('wood', x, RULE_Y + 0.4, TRACK_Z, 0.82, 0.09, 0.12)
        k.blk('card', x, f, TRACK_Z - 0.55, 0.62, 0.62, 0.34)
      }
      unit(1.95 + 0.5, -2.0)
      break
    }
    case 'records': {
      for (let i = 0; i < 7; i++) {
        const cx = 6.2 + i * 1.12
        k.blk('card', cx, f, -1.95, 1.0, 1.36, 0.6)
        for (let d = 0; d < 3; d++) k.box('woodDark', cx, f + 0.3 + d * 0.42, -1.64, 0.24, 0.04, 0.03)
      }
      k.blk('card', 4.4, f, -0.75, 2.0, 0.78, 1.0)
      k.blk('wood', 4.4, f + 0.78, -0.75, 2.1, 0.05, 1.1)
      k.blk('paper', 4.2, f + 0.83, -0.7, 0.9, 0.03, 0.6)
      k.blk('ink', 4.2, f + 0.83, -0.7, 0.03, 0.04, 0.6)
      unit(1.95 + 1.6)
      break
    }
    case 'vault': {
      const cx = (x0 + x1) / 2
      // the vault door on the back wall
      k.disc('steel', cx - 1.6, y0 + 1.5, ZB + 0.12, 0.95, 0.12)
      k.disc('card', cx - 1.6, y0 + 1.5, ZB + 0.2, 0.7, 0.06)
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3
        k.rod('ink', V(cx - 1.6 - Math.cos(a) * 0.4, y0 + 1.5 - Math.sin(a) * 0.4, ZB + 0.26), V(cx - 1.6 + Math.cos(a) * 0.4, y0 + 1.5 + Math.sin(a) * 0.4, ZB + 0.26), 0.025, 6)
      }
      // the plinth the money stands on
      k.blk('card', cx + 0.9, f, -0.85, 1.4, 0.24, 1.0)
      break
    }
  }
  return k.build()
}
