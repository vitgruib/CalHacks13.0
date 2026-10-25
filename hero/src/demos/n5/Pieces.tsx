// Everything that moves on the board: request cards with their item icon and
// rule marks, invoices, papers, payment requests, notices, answer slips and
// coins. Each piece reads its own position from story.ts every frame.

import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { Vector3, type Group, type Mesh } from 'three'
import { feed, type ItemKind } from '../../feed'
import {
  BAR_GEO,
  CARD,
  CARD_GEO,
  COIN_GEO,
  CROSS_GEO,
  DOC,
  DOC_GEO,
  DOC_MARK,
  DOME_GEO,
  GLAZE,
  KNOB_GEO,
  MARK_Z,
  SLIP_GEO,
  T,
  TICK_GEO,
  TONE,
  clamp01,
  clay,
  ease,
  easeOut,
  glaze,
  markX,
} from './geo'
import { PINS } from './Labels'
import { pieces, place, shrinkTo, subscribe, type Piece } from './story'

const PASS = glaze(GLAZE.accept)
const FAIL = glaze(GLAZE.reject)
const WEIGHT = glaze(GLAZE.hold)
const COIN = clay(TONE.coin, 0.5)
const LINE = clay('#B9AE9F')

// ── Item icons: a few clay primitives each, sitting on the card ─────────

function ItemIcon({ kind }: { kind: ItemKind }) {
  const b = (c: string) => clay(c, 0.7)
  switch (kind) {
    case 'gloves':
      return (
        <group>
          <mesh geometry={BAR_GEO} material={b('#7FA7D9')} scale={[0.3, 0.1, 0.22]} position={[0, 0.05, 0]} castShadow />
          <mesh geometry={BAR_GEO} material={b('#EAF1FA')} scale={[0.14, 0.012, 0.05]} position={[0, 0.105, 0]} />
        </group>
      )
    case 'plates':
      return (
        <group>
          <mesh material={b('#E5D49C')} position={[0, 0.025, 0]} castShadow>
            <cylinderGeometry args={[0.15, 0.15, 0.05, 24]} />
          </mesh>
          <mesh material={b('#EFE3B8')} position={[0.03, 0.075, -0.02]} castShadow>
            <cylinderGeometry args={[0.15, 0.15, 0.05, 24]} />
          </mesh>
        </group>
      )
    case 'tips':
      return (
        <group>
          {[-0.09, 0, 0.09].map(x => (
            <mesh key={x} material={b('#8FC0E3')} position={[x, 0.11, 0]} rotation={[Math.PI, 0, 0]} castShadow>
              <coneGeometry args={[0.04, 0.22, 14]} />
            </mesh>
          ))}
        </group>
      )
    case 'bottle':
      return (
        <group>
          <mesh material={b('#C59A6E')} position={[0, 0.1, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.09, 0.2, 18]} />
          </mesh>
          <mesh material={b('#4E5967')} position={[0, 0.23, 0]}>
            <cylinderGeometry args={[0.045, 0.045, 0.06, 14]} />
          </mesh>
        </group>
      )
    case 'kit':
      return (
        <group>
          <mesh geometry={BAR_GEO} material={b('#AFC3A0')} scale={[0.32, 0.12, 0.24]} position={[0, 0.06, 0]} castShadow />
          <mesh geometry={BAR_GEO} material={b('#E9EFE3')} scale={[0.33, 0.02, 0.06]} position={[0, 0.12, 0]} />
        </group>
      )
    case 'dishes':
      return (
        <mesh material={b('#C7DDE6')} position={[0, 0.025, 0]} castShadow>
          <cylinderGeometry args={[0.16, 0.16, 0.05, 24]} />
        </mesh>
      )
    case 'pump':
      return (
        <group>
          <mesh geometry={BAR_GEO} material={b('#8E99A6')} scale={[0.3, 0.14, 0.2]} position={[0, 0.07, 0]} castShadow />
          <mesh material={b('#DCE3EA')} position={[0.04, 0.07, 0.105]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.055, 0.055, 0.03, 18]} />
          </mesh>
        </group>
      )
    case 'rotor':
      return (
        <group>
          <mesh material={b('#A8AFB8')} position={[0, 0.05, 0]} castShadow>
            <cylinderGeometry args={[0.13, 0.15, 0.1, 22]} />
          </mesh>
          <mesh material={b('#4E5967')} position={[0, 0.11, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.04, 12]} />
          </mesh>
        </group>
      )
    case 'espresso':
      return (
        <group>
          <mesh geometry={BAR_GEO} material={b('#6B5545')} scale={[0.22, 0.24, 0.18]} position={[-0.04, 0.12, 0]} castShadow />
          <mesh material={b('#F5F1EB')} position={[0.13, 0.035, 0.03]} castShadow>
            <cylinderGeometry args={[0.045, 0.04, 0.07, 14]} />
          </mesh>
        </group>
      )
    case 'service':
      return (
        <mesh material={b('#8E99A6')} position={[0, 0.03, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.1, 0.035, 10, 24]} />
        </mesh>
      )
    case 'food':
      return (
        <mesh material={b('#E2B65C')} position={[0, 0.025, 0.05]} castShadow>
          <cylinderGeometry args={[0.2, 0.2, 0.05, 16, 1, false, Math.PI * 0.85, Math.PI * 0.3]} />
        </mesh>
      )
    case 'chair':
      return (
        <group>
          <mesh geometry={BAR_GEO} material={b('#B08A6A')} scale={[0.2, 0.05, 0.2]} position={[0, 0.08, 0]} castShadow />
          <mesh geometry={BAR_GEO} material={b('#B08A6A')} scale={[0.2, 0.18, 0.04]} position={[0, 0.17, -0.09]} castShadow />
        </group>
      )
    default:
      return <mesh geometry={BAR_GEO} material={b('#D8B98C')} scale={[0.28, 0.14, 0.22]} position={[0, 0.07, 0]} castShadow />
  }
}

/** Three ruled lines: a document's text, in clay. */
function Lines({ w = 0.42 }: { w?: number }) {
  return (
    <group>
      {[-0.1, 0, 0.1].map((z, i) => (
        <mesh key={z} geometry={BAR_GEO} material={LINE} scale={[i === 2 ? w * 0.6 : w, 0.012, 0.035]} position={[i === 2 ? -w * 0.2 : 0, 0.006, z]} />
      ))}
    </group>
  )
}

// ── One piece ────────────────────────────────────────────────────────────

const at = new Vector3()
/** Held pieces' paperweights, for their tags: piece id → where and what. */
const tags_ = new Map<string, { pos: Vector3; text: string }>()

function PieceView({ p }: { p: Piece }) {
  const g = useRef<Group>(null)
  const marks = useRef<(Mesh | null)[]>([])
  const tags = useRef<(Mesh | null)[]>([])
  const weight = useRef<Group>(null)
  const isCard = p.type === 'card'
  const doc = p.type === 'invoice' || p.type === 'paper' || p.type === 'pr' || p.type === 'notice'
  const h = isCard ? CARD.h : doc ? DOC.h : 0.07
  const markAt = (i: number): [number, number, number] => (isCard ? [markX(i), h, MARK_Z] : [DOC_MARK.x, h, DOC_MARK.z])
  const wAt: [number, number, number] = isCard ? [0.3, h, -0.12] : [0.22, h, -0.12]
  useEffect(() => () => void tags_.delete(p.id), [p.id])

  useFrame(() => {
    const G = g.current
    if (!G) return
    const t = feed.now()
    place(p, t, at)
    G.position.copy(at)
    let s = p.scale
    const sh = shrinkTo.get(p.id)
    if (sh) s = 1 - 0.4 * ease((t - sh.at) / sh.ms)
    if (t < p.born) s = 0
    else if (p.grow) s *= easeOut((t - p.born) / p.grow)
    if (p.die !== Infinity) s *= p.fade > 0 ? clamp01((p.die - t) / p.fade) : t < p.die ? 1 : 0
    G.visible = s > 0.002
    G.scale.setScalar(Math.max(s, 0.002))

    for (let i = 0; i < marks.current.length; i++) {
      const m = marks.current[i]
      if (!m) continue
      const k = p.marks[i]
      m.visible = !!k && t >= k.at
      if (k) {
        m.geometry = k.pass ? TICK_GEO : CROSS_GEO
        m.material = k.pass ? PASS : FAIL
      }
    }
    for (let i = 0; i < tags.current.length; i++) {
      const m = tags.current[i]
      if (!m) continue
      const c = p.tags[i]
      m.visible = !!c && t >= p.tagAt
      if (c) m.material = clay(c, 0.6)
    }
    const W = weight.current
    if (W) {
      const wt = p.weight
      let y = 0
      let ws = 0
      if (wt && t >= wt.on) {
        const down = clamp01((t - wt.on) / T.weight)
        const up = t >= wt.off ? clamp01((t - wt.off) / T.weight) : 0
        y = 0.9 * (1 - ease(down)) + 0.9 * ease(up)
        ws = Math.min(clamp01(down * 2), 1 - up)
      }
      W.visible = ws > 0.01
      W.position.y = wAt[1] + y
      W.scale.setScalar(Math.max(ws, 0.01))
      // The tag over the weight is drawn by WeightTags, from this.
      const show = ws > 0.9 && G.visible
      let tag = tags_.get(p.id)
      if (show) {
        if (!tag) tags_.set(p.id, (tag = { pos: new Vector3(), text: '' }))
        W.getWorldPosition(tag.pos)
        tag.text = wt?.kind === 'money' ? 'Waiting on money' : 'Grant manager'
      } else if (tag) tags_.delete(p.id)
    }
  })

  return (
    <group ref={g}>
      {isCard && (
        <>
          <mesh geometry={CARD_GEO} material={clay(p.tone, 0.8)} castShadow receiveShadow />
          <group position={[-0.18, CARD.h, -0.1]} scale={1.45}>
            <ItemIcon kind={p.item ?? 'carton'} />
          </group>
          {/* Six faint dimples: where the stamps will land. */}
          {Array.from({ length: 6 }, (_, i) => (
            <mesh key={`d${i}`} geometry={BAR_GEO} material={LINE} scale={[0.12, 0.004, 0.12]} position={[markX(i), CARD.h, MARK_Z]} />
          ))}
        </>
      )}
      {doc && (
        <>
          <mesh geometry={DOC_GEO} material={clay(p.tone, 0.8)} castShadow receiveShadow />
          <group position={[-0.14, DOC.h, -0.04]}>
            <Lines />
          </group>
          {p.type === 'pr' && <mesh geometry={COIN_GEO} material={COIN} scale={[0.32, 0.5, 0.32]} position={[0.24, DOC.h + 0.02, -0.12]} castShadow />}
          {p.type === 'notice' && <mesh geometry={COIN_GEO} material={clay(p.tone === TONE.canceled ? GLAZE.reject : GLAZE.refine, 0.5)} scale={[0.3, 0.5, 0.3]} position={[0.26, DOC.h + 0.02, 0.12]} />}
        </>
      )}
      {p.type === 'slip' && <mesh geometry={SLIP_GEO} material={p.tone.startsWith('#') && Object.values(GLAZE).includes(p.tone as never) ? glaze(p.tone) : clay(p.tone)} castShadow />}
      {p.type === 'coin' && <mesh geometry={COIN_GEO} material={COIN} castShadow />}
      {p.marks.map((_, i) => (
        <mesh
          key={`m${i}`}
          ref={el => {
            marks.current[i] = el
          }}
          geometry={TICK_GEO}
          material={PASS}
          position={markAt(i)}
          scale={isCard ? 1.2 : 1.6}
          visible={false}
        />
      ))}
      {(isCard || doc) &&
        [0, 1].map(i => (
          <mesh
            key={`t${i}`}
            ref={el => {
              tags.current[i] = el
            }}
            geometry={BAR_GEO}
            scale={[0.14, 0.035, 0.1]}
            position={[0.38 - i * 0.18, h + 0.017, -0.26]}
            visible={false}
          />
        ))}
      {(isCard || p.type === 'invoice' || p.type === 'paper' || p.type === 'pr') && (
        <group ref={weight} position={wAt} visible={false}>
          <mesh geometry={DOME_GEO} material={WEIGHT} castShadow />
          <mesh geometry={KNOB_GEO} material={WEIGHT} position={[0, 0.15, 0]} castShadow />
        </group>
      )}
    </group>
  )
}

/** A few tags, reused, so pieces never mount their own DOM. */
const TAGS = 4
function WeightTags() {
  useEffect(() => {
    for (let i = 0; i < TAGS; i++) PINS.set(`w${i}`, { at: new Vector3(), text: '', kind: 'weight', show: false })
    return () => {
      for (let i = 0; i < TAGS; i++) PINS.delete(`w${i}`)
    }
  }, [])
  useFrame(() => {
    const list = [...tags_.values()]
    for (let i = 0; i < TAGS; i++) {
      const pin = PINS.get(`w${i}`)
      const tg = list[i]
      if (!pin) continue
      pin.show = !!tg
      if (tg) {
        pin.at.copy(tg.pos)
        pin.at.y += 0.48
        pin.text = tg.text
      }
    }
  })
  return null
}

export function Pieces() {
  const [, setV] = useState(0)
  useEffect(() => subscribe(() => setV(x => x + 1)), [])
  useFrame(() => {
    const t = feed.now()
    let gone = false
    for (const [id, p] of pieces)
      if (t > p.die) {
        pieces.delete(id)
        shrinkTo.delete(id)
        tags_.delete(id)
        gone = true
      }
    if (gone) setV(x => x + 1)
  })
  return (
    <>
      {[...pieces.values()].map(p => (
        <PieceView key={p.id} p={p} />
      ))}
      <WeightTags />
    </>
  )
}
