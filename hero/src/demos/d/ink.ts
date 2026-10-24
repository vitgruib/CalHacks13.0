// The drafting kit: a Pen that collects line segments, and helpers that turn
// them into fat screen-space lines that can draw themselves on (stroke reveal
// through the dash uniforms) and invisible depth-only solids that hide the
// lines behind them, so the linework reads as opaque objects.

import * as THREE from 'three'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'

export type V3 = [number, number, number]
export type V2 = [number, number]

export const INK = {
  chalk: '#eef4f8',
  fine: '#c3d8ea',
  red: '#e5543f',
  amber: '#f4bb52',
}

const TAU = Math.PI * 2

export class Pen {
  pts: number[] = []

  seg(a: V3, b: V3) {
    this.pts.push(a[0], a[1], a[2], b[0], b[1], b[2])
    return this
  }

  poly(p: V3[], closed = false) {
    for (let i = 0; i < p.length - 1; i++) this.seg(p[i], p[i + 1])
    if (closed && p.length > 2) this.seg(p[p.length - 1], p[0])
    return this
  }

  /** Box from y to y + h, centred on x, z. */
  box(x: number, y: number, z: number, w: number, h: number, d: number) {
    const x0 = x - w / 2
    const x1 = x + w / 2
    const z0 = z - d / 2
    const z1 = z + d / 2
    const y1 = y + h
    const b: V3[] = [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]]
    const t: V3[] = b.map(p => [p[0], y1, p[2]])
    this.poly(b, true)
    this.poly(t, true)
    for (let i = 0; i < 4; i++) this.seg(b[i], t[i])
    return this
  }

  ring(c: V3, r: number, axis: 'x' | 'y' | 'z' = 'y', n = 32, a0 = 0, a1 = TAU) {
    let prev: V3 | null = null
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n
      const u = Math.cos(a) * r
      const v = Math.sin(a) * r
      const p: V3 = axis === 'y' ? [c[0] + u, c[1], c[2] + v] : axis === 'x' ? [c[0], c[1] + u, c[2] + v] : [c[0] + u, c[1] + v, c[2]]
      if (prev) this.seg(prev, p)
      prev = p
    }
    return this
  }

  /** Vertical cylinder: rings top and bottom plus `gens` generator lines. */
  cyl(c: V3, r: number, h: number, n = 36, gens = 0) {
    this.ring(c, r, 'y', n)
    this.ring([c[0], c[1] + h, c[2]], r, 'y', n)
    for (let i = 0; i < gens; i++) {
      const a = (i / gens) * TAU
      const x = c[0] + Math.cos(a) * r
      const z = c[2] + Math.sin(a) * r
      this.seg([x, c[1], z], [x, c[1] + h, z])
    }
    return this
  }

  /** Cylinder lying along x. */
  xcyl(c: V3, r: number, len: number, n = 28, gens = 6) {
    this.ring([c[0] - len / 2, c[1], c[2]], r, 'x', n)
    this.ring([c[0] + len / 2, c[1], c[2]], r, 'x', n)
    for (let i = 0; i < gens; i++) {
      const a = (i / gens) * TAU
      const y = c[1] + Math.cos(a) * r
      const z = c[2] + Math.sin(a) * r
      this.seg([c[0] - len / 2, y, z], [c[0] + len / 2, y, z])
    }
    return this
  }

  /** Parallel hatching clipped to a convex polygon lying flat at height y. */
  hatch(poly: V2[], y: number, spacing: number, angle = Math.PI / 4) {
    const d: V2 = [Math.cos(angle), Math.sin(angle)]
    const n: V2 = [-d[1], d[0]]
    const proj = poly.map(p => p[0] * n[0] + p[1] * n[1])
    const lo = Math.min(...proj)
    const hi = Math.max(...proj)
    for (let t = lo + spacing / 2; t < hi; t += spacing) {
      const hits: number[] = []
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i]
        const b = poly[(i + 1) % poly.length]
        const na = a[0] * n[0] + a[1] * n[1]
        const nb = b[0] * n[0] + b[1] * n[1]
        if (Math.abs(nb - na) < 1e-9) continue
        const u = (t - na) / (nb - na)
        if (u < 0 || u > 1) continue
        const px = a[0] + (b[0] - a[0]) * u
        const pz = a[1] + (b[1] - a[1]) * u
        hits.push(px * d[0] + pz * d[1])
      }
      if (hits.length < 2) continue
      const s0 = Math.min(...hits)
      const s1 = Math.max(...hits)
      this.seg([n[0] * t + d[0] * s0, y, n[1] * t + d[1] * s0], [n[0] * t + d[0] * s1, y, n[1] * t + d[1] * s1])
    }
    return this
  }

  /** Architectural dimension tick (a short 45° slash) at p, in the plane facing +z. */
  tick(p: V3, s = 0.08) {
    return this.seg([p[0] - s, p[1] - s, p[2]], [p[0] + s, p[1] + s, p[2]])
  }

  get length() {
    let len = 0
    const p = this.pts
    for (let i = 0; i < p.length; i += 6) len += Math.hypot(p[i + 3] - p[i], p[i + 4] - p[i + 1], p[i + 5] - p[i + 2])
    return len
  }
}

export interface InkLine extends LineSegments2 {
  material: LineMaterial
  userData: { len: number; width: number; opacity: number; reveal: number }
}

/** Fat lines that can draw themselves on: setReveal(line, 0..1). */
export function ink(pen: Pen, width: number, color = INK.chalk, opacity = 1): InkLine {
  const g = new LineSegmentsGeometry()
  g.setPositions(pen.pts.length ? pen.pts : [0, 0, 0, 0, 0, 0])
  const m = new LineMaterial({ color: new THREE.Color(color), linewidth: width, transparent: true, opacity, dashed: true, dashSize: 1e6, gapSize: 1e6, depthWrite: false })
  const l = new LineSegments2(g, m) as InkLine
  l.computeLineDistances()
  l.userData = { len: Math.max(0.001, pen.length), width, opacity, reveal: 1 }
  return l
}

export function setReveal(l: InkLine, f: number) {
  const k = Math.max(0, Math.min(1, f))
  l.userData.reveal = k
  l.material.dashSize = k >= 1 ? 1e6 : k * l.userData.len
  l.visible = k > 0
}

/** Replace a pooled line's geometry (trails reuse one object per packet). */
export function reshape(l: InkLine, pen: Pen) {
  l.geometry.setPositions(pen.pts.length ? pen.pts : [0, 0, 0, 0, 0, 0])
  l.computeLineDistances()
  l.userData.len = Math.max(0.001, pen.length)
}

/** Hairlines (1 px) for grids, hatching and construction lines. */
export function hair(pen: Pen, color = INK.fine, opacity = 0.3, dash?: [number, number]) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pen.pts, 3))
  const m = dash
    ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: dash[0], gapSize: dash[1], depthWrite: false })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
  const l = new THREE.LineSegments(g, m)
  if (dash) l.computeLineDistances()
  return l
}

/** Depth-only solid: hides lines behind it, never draws colour. */
export const OCCLUDER = new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 })
/** Invisible pick volume. */
export const PICK = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })

export function convexHull(points: V2[]): V2[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (p.length < 3) return p
  const cross = (o: V2, a: V2, b: V2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: V2[] = []
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop()
    lower.push(q)
  }
  const upper: V2[] = []
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop()
    upper.push(q)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

/** A hatched cast shadow for a footprint of height h; light from the back left. */
export function shadowHatch(pen: Pen, foot: V2[], h: number, spacing = 0.13) {
  const off: V2 = [0.42 * h, 0.3 * h]
  const hull = convexHull([...foot, ...foot.map(p => [p[0] + off[0], p[1] + off[1]] as V2)])
  pen.hatch(hull, 0.012, spacing, Math.PI * 0.25)
}

export const rect = (cx: number, cz: number, w: number, d: number): V2[] => [
  [cx - w / 2, cz - d / 2],
  [cx + w / 2, cz - d / 2],
  [cx + w / 2, cz + d / 2],
  [cx - w / 2, cz + d / 2],
]

export const circle = (cx: number, cz: number, r: number, n = 18): V2[] =>
  Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * TAU) * r, cz + Math.sin((i / n) * TAU) * r] as V2)
