// Every component on the sheet, drafted as line segments in local
// coordinates (y up, the front face looks toward +z, the viewer). A model is
// a stack of parts so a selected component can explode into a detail view.

import { Pen, circle, rect, type V2, type V3 } from './ink'

export type Occ = { kind: 'box'; c: V3; s: V3 } | { kind: 'cyl'; c: V3; r: number; h: number }

export interface Part {
  main: Pen
  fine?: Pen
  occ?: Occ[]
  explode?: V3
  call?: string // callout text in the exploded view
  anim?: 'arm' | 'drum' | 'wheel'
  pivot?: V3 // anim parts are drafted relative to this point
  sil?: { c: V3; r: number; h: number }[] // vertical cylinders whose outline turns to face the camera
}

export interface Model {
  id: string
  at: V2
  parts: Part[]
  shadows: { foot: V2[]; h: number }[]
  port: V3
  label: V3
  hit: { c: V3; s: V3 }
}

const solid = (p: Pen, occ: Occ[], x: number, y: number, z: number, w: number, h: number, d: number) => {
  p.box(x, y, z, w, h, d)
  occ.push({ kind: 'box', c: [x, y, z], s: [w, h, d] })
}

const can = (p: Pen, occ: Occ[], c: V3, r: number, h: number, n = 28) => {
  p.ring(c, r, 'y', n).ring([c[0], c[1] + h, c[2]], r, 'y', n)
  occ.push({ kind: 'cyl', c, r, h })
}

// ── People ─────────────────────────────────────────────────────────────────

/** A drafted mannequin. face = -1 looks toward -z (at a bench), +1 toward the viewer. */
function figure(x: number, z: number, face: 1 | -1, explode: V3): Part[] {
  const b = new Pen()
  const s = face
  b.poly([[x - 0.11, 0, z], [x - 0.1, 0.48, z + 0.02 * s], [x - 0.09, 0.9, z]])
  b.poly([[x + 0.11, 0, z], [x + 0.1, 0.48, z + 0.02 * s], [x + 0.09, 0.9, z]])
  b.seg([x - 0.11, 0, z], [x - 0.11, 0, z + 0.15 * s])
  b.seg([x + 0.11, 0, z], [x + 0.11, 0, z + 0.15 * s])
  const t = (dz: number): V3[] => [[x - 0.15, 0.9, z + dz], [x + 0.15, 0.9, z + dz], [x + 0.21, 1.45, z + dz], [x - 0.21, 1.45, z + dz]]
  const f = t(0.08)
  const k = t(-0.08)
  b.poly(f, true).poly(k, true)
  for (let i = 0; i < 4; i++) b.seg(f[i], k[i])
  b.seg([x, 1.45, z], [x, 1.52, z])
  b.ring([x, 1.64, z], 0.12, 'y', 16).ring([x, 1.64, z], 0.12, 'x', 16).ring([x, 1.64, z], 0.12, 'z', 16)
  b.poly([[x - 0.21, 1.43, z], [x - 0.26, 1.15, z + 0.03 * s], [x - 0.24, 0.9, z + 0.07 * s]])
  const arm = new Pen()
  arm.poly([[0, 0, 0], [0.04, -0.27, 0.12 * s], [0.0, -0.33, 0.4 * s]])
  return [
    { main: b, occ: [{ kind: 'box', c: [x, 0.9, z], s: [0.38, 0.55, 0.15] }], explode },
    { main: arm, anim: 'arm', pivot: [x + 0.21, 1.43, z], explode },
  ]
}

function bench(w = 2.4, d = 0.85, h = 0.9): Part {
  const main = new Pen()
  const fine = new Pen()
  const occ: Occ[] = []
  solid(main, occ, 0, 0, 0, w, h - 0.06, d)
  solid(main, occ, 0, h - 0.06, 0, w + 0.1, 0.06, d + 0.08)
  const zf = d / 2 + 0.002
  for (const fx of [-w / 6, w / 6]) fine.seg([fx, 0.08, zf], [fx, h - 0.06, zf])
  fine.seg([-w / 2, 0.08, zf], [w / 2, 0.08, zf])
  fine.seg([-w / 2, h - 0.3, zf], [w / 2, h - 0.3, zf])
  for (const fx of [-w / 3, 0, w / 3]) fine.seg([fx - 0.1, h - 0.18, zf], [fx + 0.1, h - 0.18, zf])
  return { main, fine, occ, call: 'Bench' }
}

const TOP = 0.9

function ortizStation(): Part[] {
  const desk = new Pen()
  const df = new Pen()
  const occ: Occ[] = []
  solid(desk, occ, 0, 0.7, 0, 2.0, 0.06, 0.85)
  for (const [lx, lz] of [[-0.95, -0.38], [0.95, -0.38], [-0.95, 0.38], [0.95, 0.38]]) desk.seg([lx, 0, lz], [lx, 0.7, lz])
  df.poly([[-0.95, 0.35, -0.38], [0.95, 0.35, -0.38]])
  // laptop
  df.poly([[-0.55, 0.76, -0.05], [-0.15, 0.76, -0.05], [-0.15, 0.76, 0.22], [-0.55, 0.76, 0.22]], true)
  df.poly([[-0.55, 0.76, -0.05], [-0.55, 1.02, -0.14], [-0.15, 1.02, -0.14], [-0.15, 0.76, -0.05]])
  // papers
  df.poly([[0.25, 0.765, -0.1], [0.6, 0.765, -0.14], [0.65, 0.765, 0.15], [0.3, 0.765, 0.19]], true)
  const wb = new Pen()
  const wf = new Pen()
  const wocc: Occ[] = []
  const bz = -0.78
  wb.seg([-0.95, 0, bz], [-0.95, 2.1, bz]).seg([0.95, 0, bz], [0.95, 2.1, bz])
  wb.seg([-1.1, 0, bz], [-0.8, 0, bz]).seg([0.8, 0, bz], [1.1, 0, bz])
  solid(wb, wocc, 0, 0.95, bz, 1.8, 1.1, 0.04)
  const fz = bz + 0.025
  wf.seg([-0.85, 1.0, fz + 0.04], [0.85, 1.0, fz + 0.04])
  // aim 3 sketch: three boxes and arrows
  for (const [cx, cy] of [[-0.55, 1.7], [0.0, 1.35], [0.55, 1.7]]) wf.poly([[cx - 0.17, cy - 0.1, fz], [cx + 0.17, cy - 0.1, fz], [cx + 0.17, cy + 0.1, fz], [cx - 0.17, cy + 0.1, fz]], true)
  wf.seg([-0.38, 1.63, fz], [-0.14, 1.43, fz]).seg([0.14, 1.43, fz], [0.38, 1.63, fz]).seg([-0.38, 1.75, fz], [0.38, 1.75, fz])
  wf.ring([0, 1.82, fz], 0.06, 'z', 12)
  return [
    { main: desk, fine: df, occ, call: 'PI desk' },
    { main: wb, fine: wf, occ: wocc, explode: [0, 0.6, -0.5], call: 'Whiteboard: aim 3' },
    ...figure(0.55, 0.8, -1, [0, 0.25, 0.7]),
  ]
}

function okaforStation(): Part[] {
  const p = new Pen()
  const f = new Pen()
  const occ: Occ[] = []
  solid(p, occ, -0.55, TOP, -0.12, 0.34, 0.03, 0.26)
  p.seg([-0.55, TOP + 0.03, -0.2], [-0.55, TOP + 1.05, -0.2])
  p.seg([-0.55, TOP + 0.85, -0.2], [-0.4, TOP + 0.85, -0.2]).seg([-0.55, TOP + 0.45, -0.2], [-0.4, TOP + 0.45, -0.2])
  can(p, occ, [-0.36, TOP + 0.3, -0.2], 0.05, 0.62, 14)
  solid(p, occ, 0.45, TOP, -0.12, 0.62, 0.48, 0.42)
  f.poly([[0.2, TOP + 0.36, 0.092], [0.5, TOP + 0.36, 0.092], [0.5, TOP + 0.18, 0.092], [0.2, TOP + 0.18, 0.092]], true)
  f.ring([0.62, TOP + 0.27, 0.092], 0.06, 'z', 12)
  f.poly([[-0.36, TOP + 0.3, -0.2], [-0.3, TOP + 0.12, -0.08], [-0.05, TOP + 0.08, 0.05], [0.14, TOP + 0.3, 0.0]])
  for (const bx of [-0.95, -0.8, -0.65]) can(f, occ, [bx, TOP, 0.22], 0.055, 0.2, 12)
  return [{ main: p, fine: f, occ, explode: [0, 0.7, 0], call: 'Ni-NTA column and FPLC' }]
}

function ramanStation(): Part[] {
  const p = new Pen()
  const f = new Pen()
  const occ: Occ[] = []
  solid(p, occ, -0.2, TOP, -0.08, 1.5, 1.0, 0.66)
  solid(p, occ, -0.2, TOP + 1.0, -0.15, 0.32, 0.22, 0.32)
  const zf = 0.252
  f.poly([[-0.88, TOP + 0.12, zf], [0.48, TOP + 0.12, zf], [0.48, TOP + 0.5, zf], [-0.88, TOP + 0.5, zf]], true)
  f.seg([-0.95, TOP + 0.62, zf], [0.55, TOP + 0.62, zf])
  f.seg([-0.95, TOP + 0.86, zf], [0.55, TOP + 0.86, zf])
  for (let i = 0; i < 3; i++) can(f, occ, [0.82, TOP + i * 0.03, 0.18], 0.1, 0.025, 16)
  can(f, occ, [0.82, TOP, -0.15], 0.1, 0.025, 16)
  return [{ main: p, fine: f, occ, explode: [0, 0.7, 0], call: 'Biosafety cabinet and MIC plates' }]
}

function silvaStation(): Part[] {
  const p = new Pen()
  const f = new Pen()
  const occ: Occ[] = []
  const mx = -0.35
  solid(p, occ, mx, TOP, -0.05, 0.56, 0.08, 0.46)
  solid(p, occ, mx, TOP + 0.08, -0.22, 0.13, 0.86, 0.14)
  solid(p, occ, mx, TOP + 0.9, -0.06, 0.15, 0.12, 0.44)
  solid(p, occ, mx, TOP + 0.38, 0.06, 0.42, 0.04, 0.3)
  can(p, occ, [mx, TOP + 0.62, 0.08], 0.08, 0.14, 14)
  p.seg([mx - 0.04, TOP + 1.02, 0.08], [mx - 0.07, TOP + 1.2, 0.27]).seg([mx + 0.04, TOP + 1.02, 0.08], [mx + 0.07, TOP + 1.2, 0.27])
  solid(p, occ, 0.55, TOP, -0.18, 0.5, 0.34, 0.38)
  f.seg([0.3, TOP + 0.2, 0.012], [mx + 0.22, TOP + 0.2, 0.0])
  solid(p, occ, 0.55, TOP + 0.6, -0.3, 0.66, 0.42, 0.04)
  p.seg([0.55, TOP + 0.34, -0.3], [0.55, TOP + 0.6, -0.3])
  const mz = -0.277
  for (const gx of [0.33, 0.55, 0.77]) f.seg([gx, TOP + 0.64, mz], [gx, TOP + 0.98, mz])
  f.seg([0.24, TOP + 0.81, mz], [0.86, TOP + 0.81, mz])
  return [{ main: p, fine: f, occ, explode: [0, 0.7, 0], call: 'Confocal microscope, 63x objective' }]
}

function parkStation(): Part[] {
  const p = new Pen()
  const f = new Pen()
  const occ: Occ[] = []
  solid(p, occ, -0.65, 0.06, -0.1, 0.86, 1.92, 0.8)
  f.seg([-0.32, 0.5, 0.302], [-0.32, 1.5, 0.302])
  f.poly([[-0.98, 1.72, 0.302], [-0.62, 1.72, 0.302], [-0.62, 1.88, 0.302], [-0.98, 1.88, 0.302]], true)
  for (const fx of [-1.0, -0.3]) f.seg([fx, 0, 0.2], [fx, 0.06, 0.2])
  const s = new Pen()
  const socc: Occ[] = []
  const sx = 0.62
  for (const [px, pz] of [[sx - 0.65, -0.45], [sx + 0.65, -0.45], [sx - 0.65, 0.0], [sx + 0.65, 0.0]]) s.seg([px, 0, pz], [px, 1.85, pz])
  for (const y of [0.3, 0.75, 1.2, 1.65]) s.poly([[sx - 0.65, y, -0.45], [sx + 0.65, y, -0.45], [sx + 0.65, y, 0.0], [sx - 0.65, y, 0.0]], true)
  for (const [bx, by, bw] of [[sx - 0.35, 0.3, 0.4], [sx + 0.25, 0.3, 0.5], [sx - 0.2, 0.75, 0.6], [sx + 0.4, 1.2, 0.3], [sx - 0.3, 1.2, 0.35]]) solid(s, socc, bx, by, -0.22, bw, 0.28, 0.32)
  return [
    { main: p, fine: f, occ, call: '-80 °C freezer' },
    { main: s, occ: socc, explode: [0.4, 0.5, -0.3], call: 'Supply shelving' },
  ]
}

// ── The grant office ───────────────────────────────────────────────────────

/** Where the rule boxes sit on the purchasing agent's panel (local). */
export const RULE_SLOTS = Array.from({ length: 9 }, (_, i) => ({ x: 0.58, y: 2.6 - i * 0.255, z: 0.64, s: 0.19 }))

function purchasing(): Part[] {
  const plinth = new Pen()
  const pf = new Pen()
  const pocc: Occ[] = []
  solid(plinth, pocc, 0, 0, 0, 2.9, 0.3, 2.0)
  pf.poly([[-1.45, 0.24, 1.002], [1.45, 0.24, 1.002]])
  const drum = new Pen()
  const df = new Pen()
  const docc: Occ[] = []
  const dc: V3 = [-0.5, 0.3, -0.25]
  can(drum, docc, dc, 0.74, 1.3, 40)
  df.ring([dc[0], 0.95, dc[2]], 0.745, 'y', 40)
  df.ring([dc[0], 1.601, dc[2]], 0.5, 'y', 32)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    df.seg([dc[0] + Math.cos(a) * 0.5, 1.602, dc[2] + Math.sin(a) * 0.5], [dc[0] + Math.cos(a) * 0.6, 1.602, dc[2] + Math.sin(a) * 0.6])
  }
  solid(drum, docc, dc[0], 1.6, dc[2], 0.56, 0.26, 0.3)
  df.seg([dc[0] - 0.2, 1.861, dc[2]], [dc[0] + 0.2, 1.861, dc[2]])
  const panel = new Pen()
  const nf = new Pen()
  const nocc: Occ[] = []
  solid(panel, nocc, 0.82, 0.3, 0.58, 0.95, 2.6, 0.1)
  for (const s of RULE_SLOTS) nf.seg([s.x + 0.18, s.y + 0.06, s.z], [s.x + 0.55, s.y + 0.06, s.z]).seg([s.x + 0.18, s.y - 0.02, s.z], [s.x + 0.4, s.y - 0.02, s.z])
  nf.seg([0.2, 1.2, 0.2], [0.35, 1.2, 0.55])
  return [
    { main: plinth, fine: pf, occ: pocc, call: 'Plinth: hard limits live in the database' },
    { main: drum, fine: df, occ: docc, sil: [{ c: dc, r: 0.74, h: 1.3 }], explode: [-0.4, 0.9, -0.3], call: 'Intake: every request enters here' },
    { main: panel, fine: nf, occ: nocc, explode: [0.6, 0.6, 0.5], call: 'Rule panel: one box per spending rule' },
  ]
}

function bookkeeping(): Part[] {
  const frame = new Pen()
  const ff = new Pen()
  const occ: Occ[] = []
  solid(frame, occ, 0, 0, 0, 2.6, 0.3, 1.8)
  solid(frame, occ, -0.92, 0.3, 0, 0.08, 1.15, 1.4)
  solid(frame, occ, 0.92, 0.3, 0, 0.08, 1.15, 1.4)
  ff.poly([[-0.85, 1.3, -0.4], [0.85, 1.3, -0.4], [0.85, 1.3, 0.4], [-0.85, 1.3, 0.4]], true)
  for (let i = 1; i < 6; i++) ff.seg([-0.85 + i * 0.28, 1.302, -0.4], [-0.85 + i * 0.28, 1.302, 0.4])
  frame.poly([[1.1, 0.3, 0], [1.1, 1.75, 0], [0.35, 1.75, 0], [0.3, 1.36, 0]])
  const rollers: Part[] = [-0.4, 0.4].map(z => {
    const r = new Pen()
    r.xcyl([0, 0, 0], 0.28, 1.7, 24, 6)
    return { main: r, anim: 'drum' as const, pivot: [0, 1.02, z] as V3, explode: [0, 0.7, z * 1.2] as V3, call: z < 0 ? 'Fund tracker rollers' : undefined }
  })
  return [{ main: frame, fine: ff, occ, call: 'Fund tracker: sources, payments, invoices' }, ...rollers]
}

function paymentReport(): Part[] {
  const p = new Pen()
  const f = new Pen()
  const occ: Occ[] = []
  solid(p, occ, 0, 0, 0, 2.5, 0.3, 1.7)
  solid(p, occ, 0, 0.3, 0, 1.2, 0.24, 0.9)
  solid(p, occ, -0.56, 0.3, 0, 0.12, 1.72, 0.12)
  solid(p, occ, 0.56, 0.3, 0, 0.12, 1.72, 0.12)
  solid(p, occ, 0, 2.02, 0, 1.36, 0.18, 0.22)
  p.seg([0, 2.2, 0], [0, 1.12, 0])
  solid(p, occ, 0, 1.02, 0, 0.92, 0.1, 0.7)
  for (let i = 0; i < 4; i++) solid(f, occ, 0.95, 0.3 + i * 0.05, 0.42, 0.5, 0.05, 0.36)
  const w = new Pen()
  w.ring([0, 0, 0], 0.42, 'y', 32).ring([0, 0, 0], 0.07, 'y', 10)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    w.seg([Math.cos(a) * 0.07, 0, Math.sin(a) * 0.07], [Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42])
  }
  return [
    { main: p, fine: f, occ, call: 'Press: payment requests from exact purchases' },
    { main: w, anim: 'wheel', pivot: [0, 2.35, 0], explode: [0, 0.8, 0], call: 'Papers checked: grant, PMCID, corrections' },
  ]
}

function managerDesk(): Part[] {
  const d = new Pen()
  const f = new Pen()
  const occ: Occ[] = []
  solid(d, occ, 0, 0.72, 0, 2.1, 0.06, 0.9)
  for (const [lx, lz] of [[-1.0, -0.4], [1.0, -0.4], [-1.0, 0.4], [1.0, 0.4]]) d.seg([lx, 0, lz], [lx, 0.72, lz])
  f.poly([[-1.0, 0.3, 0.4], [1.0, 0.3, 0.4]])
  const t = new Pen()
  const tocc: Occ[] = []
  solid(t, tocc, 0.55, 0.78, 0.1, 0.5, 0.09, 0.34)
  solid(t, tocc, -0.5, 0.78, 0.18, 0.2, 0.07, 0.13)
  can(t, tocc, [-0.5, 0.85, 0.18], 0.045, 0.2, 10)
  t.ring([-0.5, 1.09, 0.18], 0.075, 'y', 12)
  return [
    { main: d, fine: f, occ, call: 'Desk' },
    { main: t, occ: tocc, explode: [0, 0.55, 0.3], call: 'In-tray and stamp: approve or reject, with a reason' },
    ...figure(0, -0.75, 1, [0, 0.3, -0.6]),
  ]
}

export const VAULT = { r: 1.0, base: 0.22, h: 2.6 }

function vault(): Part[] {
  const p = new Pen()
  const f = new Pen()
  const occ: Occ[] = []
  can(p, occ, [0, 0, 0], 1.3, VAULT.base, 44)
  can(p, occ, [0, VAULT.base, 0], VAULT.r, VAULT.h, 44)
  const top = VAULT.base + VAULT.h
  f.ring([0, top + 0.12, 0], 0.82, 'y', 36)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    f.seg([Math.cos(a) * VAULT.r, top, Math.sin(a) * VAULT.r], [Math.cos(a) * 0.82, top + 0.12, Math.sin(a) * 0.82])
  }
  solid(p, occ, 0, top + 0.12, 0, 0.3, 0.14, 0.3)
  const dz = VAULT.r + 0.006
  f.ring([0, 1.45, dz], 0.4, 'z', 28).ring([0, 1.45, dz], 0.08, 'z', 10)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    f.seg([Math.cos(a) * 0.08, 1.45 + Math.sin(a) * 0.08, dz], [Math.cos(a) * 0.4, 1.45 + Math.sin(a) * 0.4, dz])
  }
  return [{ main: p, fine: f, occ, sil: [{ c: [0, 0, 0], r: 1.3, h: VAULT.base }, { c: [0, VAULT.base, 0], r: VAULT.r, h: VAULT.h }], call: 'Grant vault: fill line is truly available money' }]
}

function source(): Part[] {
  const p = new Pen()
  const f = new Pen()
  const occ: Occ[] = []
  solid(p, occ, 0, 0, 0, 0.95, 0.55, 0.6)
  f.poly([[-0.35, 0.15, 0.302], [0.15, 0.15, 0.302], [0.15, 0.42, 0.302], [-0.35, 0.42, 0.302]], true)
  p.seg([0.28, 0.55, -0.1], [0.28, 1.45, -0.1])
  p.ring([0.28, 1.45, -0.1], 0.22, 'z', 20)
  f.seg([0.28, 1.45, -0.1], [0.28, 1.45, 0.15])
  return [{ main: p, fine: f, occ, call: 'Source station' }]
}

function funder(): Part[] {
  const p = new Pen()
  const f = new Pen()
  const occ: Occ[] = []
  solid(p, occ, 0, 0, 0, 2.7, 0.15, 1.7)
  solid(p, occ, 0, 0.15, 0, 2.45, 0.15, 1.45)
  solid(p, occ, 0, 0.3, -0.25, 2.1, 1.3, 0.8)
  for (const cx of [-0.95, -0.32, 0.32, 0.95]) {
    p.seg([cx - 0.08, 0.3, 0.55], [cx - 0.08, 1.6, 0.55]).seg([cx + 0.08, 0.3, 0.55], [cx + 0.08, 1.6, 0.55])
    occ.push({ kind: 'cyl', c: [cx, 0.3, 0.55], r: 0.08, h: 1.3 })
  }
  solid(p, occ, 0, 1.6, 0, 2.45, 0.2, 1.45)
  const tri = (z: number): V3[] => [[-1.22, 1.8, z], [1.22, 1.8, z], [0, 2.35, z]]
  p.poly(tri(0.72), true).poly(tri(-0.72), true).seg([0, 2.35, 0.72], [0, 2.35, -0.72])
  f.ring([0, 2.0, 0.725], 0.1, 'z', 12)
  f.seg([-0.3, 0.3, 0.151], [0.3, 0.3, 0.151])
  return [{ main: p, fine: f, occ, call: 'NIH: pays the grant, asks follow-ups' }]
}

function vendors(): Part[] {
  const p = new Pen()
  const f = new Pen()
  const occ: Occ[] = []
  solid(p, occ, 0, 0, 0, 2.4, 0.38, 1.6)
  for (const [cx, cy, cz] of [[-0.55, 0.38, -0.2], [0.15, 0.38, -0.2], [-0.2, 0.98, -0.2], [0.75, 0.38, 0.38]] as V3[]) {
    solid(p, occ, cx, cy, cz, 0.6, 0.6, 0.6)
    f.seg([cx - 0.3, cy, cz + 0.302], [cx + 0.3, cy + 0.6, cz + 0.302])
  }
  return [{ main: p, fine: f, occ, call: 'Vendors: orders out, invoices in' }]
}

// ── Placement ──────────────────────────────────────────────────────────────

const stationParts: Record<string, () => Part[]> = {
  ortiz: () => ortizStation(),
  okafor: () => [bench(), ...okaforStation(), ...figure(0.4, 0.9, -1, [0, 0.25, 0.7])],
  raman: () => [bench(), ...ramanStation(), ...figure(0.55, 0.9, -1, [0, 0.25, 0.7])],
  silva: () => [bench(), ...silvaStation(), ...figure(-0.2, 0.9, -1, [0, 0.25, 0.7])],
  park: () => [...parkStation(), ...figure(0.1, 0.75, -1, [0, 0.25, 0.7])],
}

export const LAB_AT: Record<string, V2> = {
  ortiz: [-12.6, -2.3],
  okafor: [-7.7, -2.3],
  raman: [-12.6, 1.7],
  silva: [-7.7, 1.7],
  park: [-10.2, 5.2],
}

const benchShadow = (): { foot: V2[]; h: number }[] => [{ foot: rect(0, 0, 2.5, 0.92), h: 0.9 }]

export function buildModels(): Model[] {
  const out: Model[] = []
  for (const [rid, at] of Object.entries(LAB_AT)) {
    const parts = stationParts[rid]()
    const shadows =
      rid === 'park'
        ? [{ foot: rect(-0.65, -0.1, 0.86, 0.8), h: 1.95 }, { foot: rect(0.62, -0.22, 1.3, 0.45), h: 1.8 }]
        : rid === 'ortiz'
          ? [{ foot: rect(0, 0, 2.0, 0.85), h: 0.75 }, { foot: rect(0, -0.78, 1.8, 0.06), h: 2.05 }]
          : benchShadow()
    const fig = rid === 'ortiz' ? [0.55, 0.8] : rid === 'park' ? [0.1, 0.75] : rid === 'silva' ? [-0.2, 0.9] : rid === 'raman' ? [0.55, 0.9] : [0.4, 0.9]
    shadows.push({ foot: rect(fig[0], fig[1], 0.36, 0.2), h: 1.75 })
    out.push({
      id: `r:${rid}`,
      at,
      parts,
      shadows,
      port: rid === 'park' ? [0.1, 1.1, 0.35] : [-0.55, 1.0, 0.25],
      label: [fig[0], 2.15, fig[1]],
      hit: { c: [0, 0, 0.2], s: [2.6, 2.2, 1.9] },
    })
  }
  out.push({ id: 'a:purchasing', at: [1.3, 0.4], parts: purchasing(), shadows: [{ foot: rect(0, 0, 2.9, 2.0), h: 0.3 }, { foot: circle(-0.5, -0.25, 0.74), h: 1.9 }, { foot: rect(0.82, 0.58, 0.95, 0.1), h: 2.9 }], port: [-0.5, 1.95, -0.25], label: [-0.5, 2.25, -0.25], hit: { c: [0, 0, 0], s: [2.9, 2.9, 2.0] } })
  out.push({ id: 'p:grant_manager', at: [1.6, 5.4], parts: managerDesk(), shadows: [{ foot: rect(0, 0, 2.1, 0.9), h: 0.78 }, { foot: rect(0, -0.75, 0.38, 0.2), h: 1.75 }], port: [0.55, 0.95, 0.1], label: [0, 2.15, -0.75], hit: { c: [0, 0, -0.2], s: [2.2, 2.0, 1.8] } })
  out.push({ id: 'a:bookkeeping', at: [6.4, -3.2], parts: bookkeeping(), shadows: [{ foot: rect(0, 0, 2.6, 1.8), h: 1.45 }], port: [0, 1.45, 0], label: [0, 2.05, 0], hit: { c: [0, 0, 0], s: [2.6, 1.9, 1.8] } })
  out.push({ id: 'a:payment_report', at: [5.2, 4.4], parts: paymentReport(), shadows: [{ foot: rect(0, 0, 2.5, 1.7), h: 0.3 }, { foot: rect(0, 0, 1.36, 0.22), h: 2.2 }], port: [0, 1.3, 0.45], label: [0, 2.85, 0], hit: { c: [0, 0, 0], s: [2.5, 2.6, 1.7] } })
  out.push({ id: 'g:R01GM061721', at: [10.6, -0.6], parts: vault(), shadows: [{ foot: circle(0, 0, 1.3), h: 2.9 }], port: [0, 3.05, 0], label: [0, 3.55, 0], hit: { c: [0, 0, 0], s: [2.6, 3.1, 2.6] } })
  out.push({ id: 'g:R21AI182745', at: [14.3, 1.3], parts: vault(), shadows: [{ foot: circle(0, 0, 1.3), h: 2.9 }], port: [0, 3.05, 0], label: [0, 3.55, 0], hit: { c: [0, 0, 0], s: [2.6, 3.1, 2.6] } })
  const sources = ['s:reporter', 's:usaspending', 's:cancellations', 's:court', 's:payments']
  sources.forEach((id, i) => out.push({ id, at: [-0.6 + i * 3.3, -8.6], parts: source(), shadows: [{ foot: rect(0, 0, 0.95, 0.6), h: 0.55 }], port: [0, 0.8, 0.2], label: [0, 1.75, 0], hit: { c: [0, 0, 0], s: [1.2, 1.7, 1.0] } }))
  out.push({ id: 'p:funder', at: [16.2, -4.4], parts: funder(), shadows: [{ foot: rect(0, 0, 2.7, 1.7), h: 2.3 }], port: [0, 2.0, 0.75], label: [0, 2.85, 0], hit: { c: [0, 0, 0], s: [2.8, 2.4, 1.8] } })
  out.push({ id: 'v:vendors', at: [12.2, 5.3], parts: vendors(), shadows: [{ foot: rect(0, 0, 2.4, 1.6), h: 1.4 }], port: [-0.2, 1.65, -0.2], label: [0, 2.2, 0], hit: { c: [0, 0, 0], s: [2.4, 1.7, 1.6] } })
  return out
}

/** The lab room: low section-cut walls with a door on the east wall, where requests leave. */
export const ROOM = { x0: -15.3, x1: -4.8, z0: -4.4, z1: 7.0, door: [2.9, 4.7] as V2 }
export const DOOR: V3 = [ROOM.x1, 0.35, (ROOM.door[0] + ROOM.door[1]) / 2]

export function buildRoom(): { main: Pen; fine: Pen; occ: Occ[] } {
  const main = new Pen()
  const fine = new Pen()
  const occ: Occ[] = []
  const t = 0.16
  const h = 0.42
  const { x0, x1, z0, z1, door } = ROOM
  solid(main, occ, (x0 + x1) / 2, 0, z0, x1 - x0 + t, h, t)
  solid(main, occ, (x0 + x1) / 2, 0, z1, x1 - x0 + t, h, t)
  solid(main, occ, x0, 0, (z0 + z1) / 2, t, h, z1 - z0)
  solid(main, occ, x1, 0, (z0 + door[0]) / 2, t, h, door[0] - z0)
  solid(main, occ, x1, 0, (door[1] + z1) / 2, t, h, z1 - door[1])
  // the cut walls are hatched like a section
  for (const [cx, cz, w, d] of [[(x0 + x1) / 2, z0, x1 - x0, t], [(x0 + x1) / 2, z1, x1 - x0, t], [x0, (z0 + z1) / 2, t, z1 - z0], [x1, (z0 + door[0]) / 2, t, door[0] - z0], [x1, (door[1] + z1) / 2, t, z1 - door[1]]]) {
    fine.hatch(rect(cx, cz, w, d), h + 0.002, 0.18, Math.PI * 0.25)
  }
  // door leaf and swing
  fine.seg([x1, 0.01, door[0]], [x1 + (door[1] - door[0]), 0.01, door[0]])
  fine.ring([x1, 0.01, door[0]], door[1] - door[0], 'y', 16, 0, Math.PI / 2)
  return { main, fine, occ }
}
