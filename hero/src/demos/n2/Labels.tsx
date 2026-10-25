// The six name tags: three robots, two vaults, and the lab doorway. Plain DOM
// over the canvas, moved each frame from projected 3D anchors (drei's Html
// mounts a React root per tag, which warns on every remount).

import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { R01, R21 } from '../../feed'
import { B, P, PORT, R, VAULT } from './brain'

interface Tag {
  text: string
  kind: string
  at: (out: Vector3) => Vector3
}

const TAGS: Tag[] = [
  { text: 'Purchasing agent', kind: 'p', at: o => o.set(P.pos.x, 1.85, P.pos.z) },
  { text: 'Bookkeeping agent', kind: 'b', at: o => o.set(B.pos.x, 1.85, B.pos.z) },
  { text: 'Payment & report agent', kind: 'r', at: o => o.set(R.pos.x, 2.2, R.pos.z) },
  { text: 'Mitochondria grant', kind: 'r01', at: o => o.set(VAULT[R01][0], 2.0, VAULT[R01][1]) },
  { text: 'Antibiotic grant', kind: 'r21', at: o => o.set(VAULT[R21][0], 2.0, VAULT[R21][1]) },
  { text: 'From the lab', kind: 'port', at: o => o.set(-7.6, 1.5, (PORT.rest[1] + PORT.laneR) / 2) },
]
const els: (HTMLSpanElement | null)[] = []

export function LabelLayer() {
  return (
    <div className="n2-tags" aria-hidden="true">
      {TAGS.map((t, i) => (
        <span key={t.kind} ref={el => void (els[i] = el)} className={`n2-label n2-label-${t.kind}`}>
          {t.text}
        </span>
      ))}
    </div>
  )
}

const v = new Vector3()
export function LabelTracker() {
  const { camera, size } = useThree()
  useFrame(() => {
    TAGS.forEach((t, i) => {
      const el = els[i]
      if (!el) return
      t.at(v).project(camera)
      const x = (v.x * 0.5 + 0.5) * size.width
      const y = (-v.y * 0.5 + 0.5) * size.height
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`
      el.style.opacity = '1'
    })
  })
  return null
}
