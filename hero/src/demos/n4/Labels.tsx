// The few words on screen: three agent plates, two grant plates, the three
// edges, and one state tag. Plain DOM over the canvas, placed each frame by
// projecting a point in the scene (no per-label React roots).

import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { R01, R21 } from '../../feed'
import { GM, HEADER_Y, HEADER_Z, METER, METER_R, PUMP, TANK, TANK_AT, VALVE, VALVE_R, v } from './layout'

interface Spec {
  id: string
  text: string
  at: Vector3
  kind?: 'edge' | 'tag'
}

const tankTop = (id: string) => v(TANK_AT[id].x - 0.55, TANK.h + 0.32, TANK_AT[id].z + TANK.r)

export const LABELS: Spec[] = [
  { id: 'g1', text: 'Mitochondria grant', at: tankTop(R01) },
  { id: 'g2', text: 'Antibiotic grant', at: tankTop(R21) },
  { id: 'purchasing', text: 'Purchasing agent', at: v(VALVE.x + 0.3, 0.02, 2.5) },
  { id: 'bookkeeping', text: 'Bookkeeping agent', at: v(METER.x, METER.y + METER_R + 0.4, METER.z) },
  { id: 'payment', text: 'Payment & report agent', at: v(PUMP.x, 0.02, 1.6) },
  { id: 'gm', text: 'Grant manager', at: v(GM.x, 0.02, 2.5) },
  { id: 'lab', text: 'From the lab', at: v(-5.5, 0.02, 2.45), kind: 'edge' },
  { id: 'vendors', text: 'To vendors', at: v(6.35, 0.02, 1.15), kind: 'edge' },
  { id: 'nih', text: 'From NIH', at: v(7.15, HEADER_Y + 0.42, HEADER_Z), kind: 'edge' },
  { id: 'money', text: 'Waiting for money', at: v(VALVE.x, VALVE.y + VALVE_R + 0.78, VALVE.z + 0.2), kind: 'tag' },
]

export const labelEls = new Map<string, HTMLDivElement>()

export function LabelLayer() {
  return (
    <div className="n4-labels" aria-hidden="true">
      {LABELS.map(l => (
        <div
          key={l.id}
          className={l.kind === 'tag' ? 'n4-tag' : l.kind === 'edge' ? 'n4-label is-edge' : 'n4-label'}
          ref={el => {
            if (el) labelEls.set(l.id, el)
            else labelEls.delete(l.id)
          }}
        >
          {l.text}
        </div>
      ))}
    </div>
  )
}

const p = new Vector3()
export function LabelTracker() {
  const { camera, size } = useThree()
  useFrame(() => {
    for (const l of LABELS) {
      const el = labelEls.get(l.id)
      if (!el) continue
      p.copy(l.at).project(camera)
      const x = (p.x * 0.5 + 0.5) * size.width - el.offsetWidth / 2
      const y = (-p.y * 0.5 + 0.5) * size.height - el.offsetHeight / 2
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
    }
  })
  return null
}
