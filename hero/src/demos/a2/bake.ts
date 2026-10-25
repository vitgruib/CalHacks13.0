// Static clay gets merged: every box, cylinder and sphere is moved into
// place, painted with its own vertex colour, and joined into one geometry.
// A whole bench (or a whole figure's forearm with its glove) is one draw call.

import {
  BufferAttribute,
  type BufferGeometry,
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
const vp = new Vector3()
const vs = new Vector3()
const c = new Color()

/** A tiny tonal drift so a room of one colour doesn't read flat. */
export function shade(hex: string, k: number) {
  return '#' + new Color(hex).offsetHSL(0, 0, k).getHexString()
}

export class Bake {
  private parts: BufferGeometry[] = []
  private frames: Matrix4[] = []

  /** Everything added inside `fn` is placed relative to `p`, turned by `rot`. */
  at(p: V3, rot: V3 | number, fn: () => void) {
    const r = typeof rot === 'number' ? ([0, rot, 0] as V3) : rot
    e.set(r[0], r[1], r[2])
    q.setFromEuler(e)
    const f = new Matrix4().compose(vp.set(p[0], p[1], p[2]), q, vs.set(1, 1, 1))
    const top = this.frames[this.frames.length - 1]
    if (top) f.premultiply(top)
    this.frames.push(f)
    fn()
    this.frames.pop()
    return this
  }

  add(g: BufferGeometry, p: V3, color: string, rot?: V3, scale?: V3) {
    if (g.getAttribute('uv')) g.deleteAttribute('uv')
    if (g.getAttribute('uv1')) g.deleteAttribute('uv1')
    if (!g.index) {
      const n = g.getAttribute('position').count
      const idx = new Uint32Array(n)
      for (let i = 0; i < n; i++) idx[i] = i
      g.setIndex(new BufferAttribute(idx, 1))
    }
    e.set(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0)
    q.setFromEuler(e)
    m4.compose(vp.set(p[0], p[1], p[2]), q, scale ? vs.set(scale[0], scale[1], scale[2]) : vs.set(1, 1, 1))
    const top = this.frames[this.frames.length - 1]
    if (top) m4.premultiply(top)
    g.applyMatrix4(m4)
    const n = g.getAttribute('position').count
    c.set(color)
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r
      col[i * 3 + 1] = c.g
      col[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new BufferAttribute(col, 3))
    this.parts.push(g)
    return this
  }

  box(p: V3, s: V3, color: string, r = 0.03, rot?: V3) {
    const radius = Math.max(0.001, Math.min(r, Math.min(s[0], s[1], s[2]) / 2 - 0.001))
    return this.add(new RoundedBoxGeometry(s[0], s[1], s[2], 2, radius), p, color, rot)
  }

  cyl(p: V3, r: number, h: number, color: string, seg = 20, rot?: V3, r2?: number, open = false) {
    return this.add(new CylinderGeometry(r2 ?? r, r, h, seg, 1, open), p, color, rot)
  }

  /** A partial cylinder (an open coat skirt, a curved panel). */
  arc(p: V3, r: number, h: number, color: string, start: number, len: number, rot?: V3, r2?: number, seg = 20) {
    return this.add(new CylinderGeometry(r2 ?? r, r, h, seg, 1, true, start, len), p, color, rot)
  }

  ball(p: V3, r: number, color: string, scale?: V3, seg = 16, rot?: V3) {
    return this.add(new SphereGeometry(r, seg, Math.max(8, Math.round(seg * 0.7))), p, color, rot, scale)
  }

  cap(p: V3, r: number, len: number, color: string, rot?: V3, seg = 12) {
    return this.add(new CapsuleGeometry(r, len, 4, seg), p, color, rot)
  }

  ring(p: V3, R: number, r: number, color: string, rot?: V3, arc = Math.PI * 2, seg = 28) {
    return this.add(new TorusGeometry(R, r, 8, seg, arc), p, color, rot)
  }

  lathe(p: V3, pts: [number, number][], color: string, seg = 28, rot?: V3) {
    return this.add(new LatheGeometry(pts.map(([x, y]) => new Vector2(x, y)), seg), p, color, rot)
  }

  get empty() {
    return this.parts.length === 0
  }

  build(): BufferGeometry {
    const g = mergeGeometries(this.parts, false)
    for (const p of this.parts) p.dispose()
    this.parts = []
    if (!g) throw new Error('bake: nothing to merge')
    g.computeBoundingSphere()
    return g
  }
}

/** Bake once with a builder function. */
export function bake(fn: (b: Bake) => void): BufferGeometry {
  const b = new Bake()
  fn(b)
  return b.build()
}
