// A small geometry builder. Parts are placed and coloured one by one, then
// merged into a single vertex-coloured mesh, so a whole bench, a figure's
// forearm or a parcel costs one draw call however much detail it carries.

import { BoxGeometry, BufferAttribute, BufferGeometry, CapsuleGeometry, Color, CylinderGeometry, Euler, LatheGeometry, Matrix4, Quaternion, SphereGeometry, TorusGeometry, Vector2, Vector3 } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type P3 = [number, number, number]
export interface Place {
  rot?: P3
  scale?: P3
}

const cache = new Map<string, BufferGeometry>()
function clean(g: BufferGeometry) {
  if (g.getAttribute('uv')) g.deleteAttribute('uv')
  if (g.getAttribute('uv1')) g.deleteAttribute('uv1')
  return g.index ? g.toNonIndexed() : g
}
function tmpl(key: string, make: () => BufferGeometry) {
  let g = cache.get(key)
  if (!g) {
    g = clean(make())
    cache.set(key, g)
  }
  return g
}

const m4 = new Matrix4()
const q = new Quaternion()
const eu = new Euler()
const vp = new Vector3()
const vs = new Vector3()
const col = new Color()

export class Kit {
  private parts: BufferGeometry[] = []

  /** Any geometry, placed and painted. */
  add(g: BufferGeometry, color: string, p: P3, o: Place = {}) {
    const x = clean(g.clone())
    const r = o.rot ?? [0, 0, 0]
    eu.set(r[0], r[1], r[2])
    q.setFromEuler(eu)
    const s = o.scale ?? [1, 1, 1]
    m4.compose(vp.set(p[0], p[1], p[2]), q, vs.set(s[0], s[1], s[2]))
    x.applyMatrix4(m4)
    col.set(color)
    const n = x.attributes.position.count
    const c = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      c[i * 3] = col.r
      c[i * 3 + 1] = col.g
      c[i * 3 + 2] = col.b
    }
    x.setAttribute('color', new BufferAttribute(c, 3))
    this.parts.push(x)
    return this
  }

  /** A box; `r` rounds its edges. */
  box(p: P3, s: P3, color: string, r = 0, o: Place = {}) {
    if (r <= 0) return this.add(tmpl('box', () => new BoxGeometry(1, 1, 1)), color, p, { rot: o.rot, scale: s })
    const rr = Math.max(0.002, Math.min(r, Math.min(...s) / 2 - 0.002))
    const key = `rb:${s.map(v => v.toFixed(3)).join(',')}:${rr.toFixed(3)}`
    return this.add(tmpl(key, () => new RoundedBoxGeometry(s[0], s[1], s[2], 2, rr)), color, p, o)
  }

  /** A cylinder standing on its axis; `r2` is the top radius. */
  cyl(p: P3, r: number, h: number, color: string, o: Place & { r2?: number; seg?: number; open?: boolean } = {}) {
    const seg = o.seg ?? 24
    const k = (o.r2 ?? r) / r
    const g = tmpl(`cy:${seg}:${k.toFixed(3)}:${o.open ? 1 : 0}`, () => new CylinderGeometry(k, 1, 1, seg, 1, !!o.open))
    return this.add(g, color, p, { rot: o.rot, scale: [r, h, r] })
  }

  sphere(p: P3, r: number, color: string, o: Place & { seg?: number } = {}) {
    const seg = o.seg ?? 16
    const g = tmpl(`sp:${seg}`, () => new SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.7))))
    const s = o.scale ?? [1, 1, 1]
    return this.add(g, color, p, { rot: o.rot, scale: [r * s[0], r * s[1], r * s[2]] })
  }

  /** The top of a sphere, `theta` radians down from the pole (hair, domes). */
  dome(p: P3, r: number, color: string, o: Place & { theta?: number } = {}) {
    const th = o.theta ?? Math.PI / 2
    const g = tmpl(`do:${th.toFixed(3)}`, () => new SphereGeometry(1, 22, 12, 0, Math.PI * 2, 0, th))
    const s = o.scale ?? [1, 1, 1]
    return this.add(g, color, p, { rot: o.rot, scale: [r * s[0], r * s[1], r * s[2]] })
  }

  /** A capsule along y, centred on `p`; `len` is the straight part. */
  capsule(p: P3, r: number, len: number, color: string, o: Place = {}) {
    const g = tmpl(`ca:${r.toFixed(3)}:${len.toFixed(3)}`, () => new CapsuleGeometry(r, len, 4, 12))
    return this.add(g, color, p, o)
  }

  torus(p: P3, R: number, r: number, color: string, o: Place & { arc?: number; seg?: number } = {}) {
    const g = tmpl(`to:${R}:${r}:${o.arc ?? 6.2832}:${o.seg ?? 24}`, () => new TorusGeometry(R, r, 8, o.seg ?? 24, o.arc ?? Math.PI * 2))
    return this.add(g, color, p, o)
  }

  lathe(pts: [number, number][], color: string, p: P3, o: Place & { seg?: number } = {}) {
    const g = new LatheGeometry(
      pts.map(([x, y]) => new Vector2(x, y)),
      o.seg ?? 32,
    )
    return this.add(g, color, p, o)
  }

  get empty() {
    return this.parts.length === 0
  }

  build(): BufferGeometry {
    const g = this.parts.length ? mergeGeometries(this.parts, false) : new BufferGeometry()
    for (const x of this.parts) x.dispose()
    this.parts = []
    g.computeBoundingSphere()
    g.computeBoundingBox()
    return g
  }
}

/** One kit per material, built together. */
export function kits<K extends string>(...names: K[]): Record<K, Kit> {
  return Object.fromEntries(names.map(n => [n, new Kit()])) as Record<K, Kit>
}
