// A small builder for static clay models. Every part carries its colour in
// its vertices, so a whole bench, figure limb or parcel merges into one
// geometry and draws in one call with one shared matte material.

import {
  BoxGeometry,
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
const v = new Vector3()
const s = new Vector3()
const c = new Color()

export interface Opt {
  rot?: V3
  scale?: V3
}

export class Kit {
  parts: BufferGeometry[] = []

  /** Add any geometry at p, rotated and scaled, painted one colour (shade nudges lightness a touch). */
  add(g: BufferGeometry, p: V3, color: string, o: Opt = {}, shade = 0) {
    const geo = g.index ? g : g.setIndex([...Array(g.attributes.position.count).keys()])
    e.set(...(o.rot ?? [0, 0, 0]))
    q.setFromEuler(e)
    s.set(...(o.scale ?? [1, 1, 1]))
    m4.compose(v.set(...p), q, s)
    geo.applyMatrix4(m4)
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k)
    if (!geo.attributes.uv) geo.setAttribute('uv', new BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2))
    c.set(color)
    if (shade) c.offsetHSL(0, 0, shade)
    const n = geo.attributes.position.count
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r
      col[i * 3 + 1] = c.g
      col[i * 3 + 2] = c.b
    }
    geo.setAttribute('color', new BufferAttribute(col, 3))
    this.parts.push(geo)
    return this
  }

  /** A rounded box: the clay workhorse. Tiny parts get a plain box. */
  box(p: V3, size: V3, color: string, r = 0.03, o: Opt = {}, shade = 0) {
    const min = Math.min(...size)
    const rr = Math.min(r, min / 2 - 0.002)
    const g = rr > 0.006 && min > 0.03 ? new RoundedBoxGeometry(size[0], size[1], size[2], 2, rr) : new BoxGeometry(...size)
    return this.add(g, p, color, o, shade)
  }

  cyl(p: V3, r: number, h: number, color: string, seg = 20, o: Opt = {}, rTop = r, open = false) {
    return this.add(new CylinderGeometry(rTop, r, h, seg, 1, open), p, color, o)
  }

  sphere(p: V3, r: number, color: string, o: Opt = {}, w = 18, hs = 12) {
    return this.add(new SphereGeometry(r, w, hs), p, color, o)
  }

  capsule(p: V3, r: number, len: number, color: string, o: Opt = {}, seg = 12) {
    return this.add(new CapsuleGeometry(r, len, 4, seg), p, color, o)
  }

  torus(p: V3, r: number, tube: number, color: string, o: Opt = {}, arc = Math.PI * 2, seg = 24) {
    return this.add(new TorusGeometry(r, tube, 8, seg, arc), p, color, o)
  }

  lathe(p: V3, pts: [number, number][], color: string, o: Opt = {}, seg = 24) {
    return this.add(new LatheGeometry(pts.map(([x, y]) => new Vector2(x, y)), seg), p, color, o)
  }

  build(): BufferGeometry {
    const g = (this.parts.length ? mergeGeometries(this.parts, false) : null) ?? new BufferGeometry()
    for (const p of this.parts) p.dispose()
    this.parts = []
    g.computeBoundingSphere()
    return g
  }
}

export const kit = () => new Kit()
