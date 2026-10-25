// Static furniture is described once as many small primitives, then merged
// into one mesh per material, so a detailed room costs a handful of draw
// calls. Positions nest: `at` places a piece of furniture and everything
// added inside its callback moves with it.

import { BufferGeometry, CylinderGeometry, Euler, Float32BufferAttribute, LatheGeometry, Matrix4, Quaternion, SphereGeometry, TorusGeometry, Vector2, Vector3, type Material } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { V3 } from './layout'

const boxCache = new Map<string, BufferGeometry>()
export function roundedBox(s: V3, r: number, seg = 2) {
  const radius = Math.max(0.002, Math.min(r, Math.min(...s) / 2 - 0.002))
  const key = `${s.join(',')}:${radius.toFixed(4)}:${seg}`
  let g = boxCache.get(key)
  if (!g) {
    g = new RoundedBoxGeometry(s[0], s[1], s[2], seg, radius)
    boxCache.set(key, g)
  }
  return g
}

const cylCache = new Map<string, BufferGeometry>()
export function cylinder(r: number, h: number, seg = 24, r2?: number, open = false) {
  const key = `${r}:${h}:${seg}:${r2 ?? r}:${open}`
  let g = cylCache.get(key)
  if (!g) {
    g = new CylinderGeometry(r2 ?? r, r, h, seg, 1, open)
    cylCache.set(key, g)
  }
  return g
}

export const lathe = (pts: [number, number][], seg = 24) => new LatheGeometry(pts.map(([x, y]) => new Vector2(x, y)), seg)

export interface Part {
  geo: BufferGeometry
  mat: Material
  shadow: boolean
}

/** A non-indexed copy with only position, normal and uv, so any mix of primitives merges. */
function flat(geo: BufferGeometry) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone()
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name)
  if (!g.attributes.uv) g.setAttribute('uv', new Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
  return g
}

const q = new Quaternion()
const e = new Euler()
const one = new Vector3(1, 1, 1)

export class Batch {
  private stack: Matrix4[] = [new Matrix4()]
  private groups = new Map<string, { mat: Material; shadow: boolean; geos: BufferGeometry[] }>()

  /** Everything added inside `fn` is placed relative to `p`, turned by `ry` about y. */
  at(p: V3, ry: number, fn: () => void) {
    const m = new Matrix4().compose(new Vector3(...p), q.setFromEuler(e.set(0, ry, 0)), one)
    this.stack.push(this.top().clone().multiply(m))
    fn()
    this.stack.pop()
  }

  add(geo: BufferGeometry, mat: Material, p: V3, rot?: V3, scale?: V3, shadow = true) {
    const m = new Matrix4().compose(new Vector3(...p), q.setFromEuler(e.set(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0)), scale ? new Vector3(...scale) : one)
    const g = flat(geo)
    g.applyMatrix4(this.top().clone().multiply(m))
    const key = `${mat.uuid}:${shadow}`
    let grp = this.groups.get(key)
    if (!grp) {
      grp = { mat, shadow, geos: [] }
      this.groups.set(key, grp)
    }
    grp.geos.push(g)
  }

  box(p: V3, s: V3, mat: Material, r = 0.03, rot?: V3, shadow = true) {
    this.add(roundedBox(s, r), mat, p, rot, undefined, shadow)
  }

  cyl(p: V3, r: number, h: number, mat: Material, seg = 24, rot?: V3, r2?: number, shadow = true) {
    this.add(cylinder(r, h, seg, r2), mat, p, rot, undefined, shadow)
  }

  ball(p: V3, r: number, mat: Material, scale?: V3, shadow = true) {
    this.add(new SphereGeometry(r, 16, 12), mat, p, undefined, scale, shadow)
  }

  ring(p: V3, r: number, tube: number, mat: Material, rot?: V3, arc = Math.PI * 2, shadow = true) {
    this.add(new TorusGeometry(r, tube, 8, 32, arc), mat, p, rot, undefined, shadow)
  }

  private top() {
    return this.stack[this.stack.length - 1]
  }

  build(): Part[] {
    const out: Part[] = []
    for (const g of this.groups.values()) {
      const geos = g.geos
      const merged = mergeGeometries(geos, false)
      if (merged) {
        merged.computeBoundingSphere()
        out.push({ geo: merged, mat: g.mat, shadow: g.shadow })
      }
      for (const x of geos) x.dispose()
    }
    return out
  }
}

/** One finished part, ready to merge into a figure or an item: a primitive placed in its parent's space. */
export function placed(geo: BufferGeometry, p: V3, rot?: V3, scale?: V3) {
  const g = flat(geo)
  g.applyMatrix4(new Matrix4().compose(new Vector3(...p), q.setFromEuler(e.set(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0)), scale ? new Vector3(...scale) : one))
  return g
}

/** Merge already-placed parts into one geometry. */
export function merge(parts: BufferGeometry[]) {
  const g = mergeGeometries(parts, false)
  for (const p of parts) p.dispose()
  if (!g) throw new Error('merge failed')
  g.computeBoundingSphere()
  return g
}
