// The few words on screen: the three agents, the two grants, the grant
// manager and the lab's port, plus each outcome's word while its neuron is
// lit. Plain DOM over the canvas, placed every frame by projecting a 3D anchor.

import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { G1, G2, NODES, OUTS } from './layout'
import { glow } from './glow'

interface Lab {
  key: string
  text: string
  cls: string
  at: Vector3
  word?: string // an outcome: shown only while its neuron glows
}

const above = (id: string, dy: number) => NODES[id].at.clone().setY(NODES[id].at.y + dy)
const below = (id: string, dz: number) => NODES[id].at.clone().setY(0.05).setZ(NODES[id].at.z + dz)
const OUT_WORD: Record<string, string> = { accept: 'Bought', refine: 'Rerouted', hold: 'Held', reject: 'Blocked' }

const LABELS: Lab[] = [
  { key: 'purchasing', text: 'Purchasing agent', cls: 'n1-label n1-label--agent', at: new Vector3(-3.3, 0.5, -3.55) },
  { key: 'book', text: 'Bookkeeping agent', cls: 'n1-label n1-label--agent', at: above('book', 0.95) },
  { key: 'pay', text: 'Payment & report agent', cls: 'n1-label n1-label--agent', at: above('pay', 0.95) },
  { key: 'g1', text: 'Mitochondria grant', cls: 'n1-label', at: above(G1, 1.25) },
  { key: 'g2', text: 'Antibiotic grant', cls: 'n1-label', at: below(G2, 1.05) },
  { key: 'gm', text: 'Grant manager', cls: 'n1-label n1-label--quiet', at: new Vector3(NODES.gm.at.x - 1.45, 0.05, NODES.gm.at.z + 0.62) },
  { key: 'lab', text: 'From the lab', cls: 'n1-label n1-label--quiet', at: new Vector3(-9.0, 0.9, 0) },
  ...OUTS.map(o => ({ key: `o:${o}`, text: OUT_WORD[o], cls: `n1-word n1-word--${o}`, at: NODES[`o:${o}`].at.clone().setX(NODES[`o:${o}`].at.x + 0.66), word: o })),
]

const els = new Map<string, HTMLSpanElement>()

export function LabelLayer() {
  return (
    <div className="n1-labels" aria-hidden="true">
      {LABELS.map(l => (
        <span
          key={l.key}
          className={l.cls}
          style={l.word ? { opacity: 0 } : undefined}
          ref={el => {
            if (el) els.set(l.key, el)
            else els.delete(l.key)
          }}
        >
          {l.text}
        </span>
      ))}
    </div>
  )
}

const v = new Vector3()
export function LabelTracker() {
  const { camera, size } = useThree()
  useFrame(() => {
    for (const l of LABELS) {
      const el = els.get(l.key)
      if (!el) continue
      v.copy(l.at).project(camera)
      const x = Math.round((v.x * 0.5 + 0.5) * size.width)
      const y = Math.round((-v.y * 0.5 + 0.5) * size.height)
      const tf = l.word ? `translate(${x}px, ${y}px) translateY(-50%)` : `translate(${x}px, ${y}px) translate(-50%, -50%)`
      if (el.style.transform !== tf) el.style.transform = tf
      if (l.word) {
        const s = Math.min(1, (glow.node.get(l.key)?.v ?? 0) * 1.6).toFixed(2)
        if (el.style.opacity !== s) el.style.opacity = s
      }
    }
  })
  return null
}
