// A small geometry kit: rounded boxes, cylinders, spheres and lathes, each
// painted one colour, merged into one mesh per material. The whole lab's
// furniture is a handful of draw calls this way.

import {
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  Euler,
  LatheGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { V3 } from './layout'

const m4 = new Matrix4()
const q = new Quaternion()
const e = new Euler()
const c = new Color()
const one = new Vector3(1, 1, 1)

export class Kit {
  private parts: BufferGeometry[] = []

  /** Adds a geometry painted `color` (a hex, or a number > 1 brightness for lights). */
  add(g: BufferGeometry, color: string, p: V3 = [0, 0, 0], rot?: V3, scale?: V3, glow = 1) {
    const geo = g.index ? g.toNonIndexed() : g
    if (g.index) g.dispose()
    e.set(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0)
    q.setFromEuler(e)
    m4.compose(new Vector3(...p), q, scale ? new Vector3(...scale) : one)
    geo.applyMatrix4(m4)
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k)
    const n = geo.attributes.position.count
    const col = new Float32Array(n * 3)
    c.set(color)
    for (let i = 0; i < n; i++) col.set([c.r * glow, c.g * glow, c.b * glow], i * 3)
    geo.setAttribute('color', new BufferAttribute(col, 3))
    this.parts.push(geo)
    return this
  }

  box(p: V3, s: V3, color: string, r = 0.03, rot?: V3, glow = 1) {
    const rr = Math.max(0.001, Math.min(r, Math.min(...s) / 2 - 0.001))
    const seg = rr > 0.025 ? 2 : 1
    return this.add(new RoundedBoxGeometry(s[0], s[1], s[2], seg, rr), color, p, rot, undefined, glow)
  }

  /** A sharp-edged box: cheaper, for slabs and screens. */
  slab(p: V3, s: V3, color: string, rot?: V3, glow = 1) {
    return this.add(new RoundedBoxGeometry(s[0], s[1], s[2], 1, 0.004), color, p, rot, undefined, glow)
  }

  cyl(p: V3, r: number, h: number, color: string, seg = 20, rot?: V3, r2?: number, glow = 1) {
    return this.add(new CylinderGeometry(r2 ?? r, r, h, seg, 1), color, p, rot, undefined, glow)
  }

  sphere(p: V3, r: number, color: string, scale?: V3, seg = 14, glow = 1) {
    return this.add(new SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.65))), color, p, undefined, scale, glow)
  }

  /** The top of a sphere down to `theta` (radians from the pole): hair, domes, lamp shades. */
  cap(p: V3, r: number, theta: number, color: string, scale?: V3, rot?: V3, glow = 1) {
    return this.add(new SphereGeometry(r, 16, 9, 0, Math.PI * 2, 0, theta), color, p, rot, scale, glow)
  }

  /** A band of a sphere's front half (phi 0..π faces +z): beards, visors. */
  band(p: V3, r: number, t0: number, t1: number, color: string, scale?: V3) {
    return this.add(new SphereGeometry(r, 14, 6, 0, Math.PI, t0, t1 - t0), color, p, undefined, scale)
  }

  capsule(p: V3, r: number, len: number, color: string, rot?: V3, scale?: V3) {
    return this.add(new CapsuleGeometry(r, len, 4, 10), color, p, rot, scale)
  }

  torus(p: V3, r: number, tube: number, color: string, rot?: V3, arc = Math.PI * 2, glow = 1) {
    return this.add(new TorusGeometry(r, tube, 8, 24, arc), color, p, rot, undefined, glow)
  }

  lathe(pts: [number, number][], p: V3, color: string, seg = 20, scale?: V3, phi?: [number, number], rot?: V3) {
    const g = new LatheGeometry(
      pts.map(([x, y]) => new Vector2(x, y)),
      seg,
      phi?.[0] ?? 0,
      phi?.[1] ?? Math.PI * 2,
    )
    return this.add(g, color, p, rot, scale)
  }

  get empty() {
    return this.parts.length === 0
  }

  build(): BufferGeometry {
    const g = this.parts.length ? (mergeGeometries(this.parts, false) ?? new BufferGeometry()) : new BufferGeometry()
    for (const p of this.parts) p.dispose()
    this.parts = []
    g.computeBoundingSphere()
    g.computeBoundingBox()
    return g
  }
}

/** One geometry, built once at module load. */
export function made(fn: (k: Kit) => void): BufferGeometry {
  const k = new Kit()
  fn(k)
  return k.build()
}
