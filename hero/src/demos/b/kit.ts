// A model maker's kit: collect boxes, rods and balls per material, then merge
// them so a whole room draws in a handful of calls.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { MatKey } from './materials'

const UP = new THREE.Vector3(0, 1, 0)

export interface Part {
  mat: MatKey
  geo: THREE.BufferGeometry
}

export class Kit {
  private parts = new Map<MatKey, THREE.BufferGeometry[]>()

  add(mat: MatKey, g: THREE.BufferGeometry) {
    const list = this.parts.get(mat) ?? []
    list.push(g.index ? g.toNonIndexed() : g)
    this.parts.set(mat, list)
  }

  /** Box by its centre. */
  box(mat: MatKey, x: number, y: number, z: number, w: number, h: number, d: number, ry = 0) {
    const g = new THREE.BoxGeometry(w, h, d)
    if (ry) g.rotateY(ry)
    g.translate(x, y, z)
    this.add(mat, g)
  }

  /** Box standing on y0. */
  blk(mat: MatKey, x: number, y0: number, z: number, w: number, h: number, d: number) {
    this.box(mat, x, y0 + h / 2, z, w, h, d)
  }

  /** Upright cylinder standing on y0. */
  cyl(mat: MatKey, x: number, y0: number, z: number, r: number, h: number, seg = 14) {
    const g = new THREE.CylinderGeometry(r, r, h, seg)
    g.translate(x, y0 + h / 2, z)
    this.add(mat, g)
  }

  /** Rod between two points. */
  rod(mat: MatKey, a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 12) {
    const len = a.distanceTo(b)
    if (len < 1e-4) return
    const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true)
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize()))
    const m = a.clone().add(b).multiplyScalar(0.5)
    g.translate(m.x, m.y, m.z)
    this.add(mat, g)
  }

  ball(mat: MatKey, x: number, y: number, z: number, r: number, seg = 12) {
    const g = new THREE.SphereGeometry(r, seg, Math.max(6, seg - 4))
    g.translate(x, y, z)
    this.add(mat, g)
  }

  /** Disc facing +z (a vault door, a dish). */
  disc(mat: MatKey, x: number, y: number, z: number, r: number, depth: number, seg = 28) {
    const g = new THREE.CylinderGeometry(r, r, depth, seg)
    g.rotateX(Math.PI / 2)
    g.translate(x, y, z)
    this.add(mat, g)
  }

  geo(mat: MatKey, g: THREE.BufferGeometry) {
    this.add(mat, g)
  }

  build(): Part[] {
    const out: Part[] = []
    for (const [mat, list] of this.parts) {
      const merged = mergeGeometries(list, false)
      if (merged) {
        merged.computeBoundingSphere()
        out.push({ mat, geo: merged })
      }
      for (const g of list) g.dispose()
    }
    return out
  }
}
