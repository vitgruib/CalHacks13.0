// Everything that never moves: the soft deck, the troughs, the lab's arch,
// and the three agents' slate bodies. One clay family, so the moving parts
// (marbles, glazed plinths, money) are what the eye goes to.

import { RoundedBox } from '@react-three/drei'
import { useMemo } from 'react'
import { MeshStandardMaterial, Quaternion, Vector3 } from 'three'
import { M } from '../a1/mats'
import {
  BOOK,
  BOOK_IN,
  COLLECT_X,
  CUP,
  DECK,
  ENTRY,
  FUND_CHUTE,
  GM,
  GRANT_AT,
  GRANT_IDS,
  JUNCTION,
  MY,
  OFF_X,
  PAPER_IN,
  PORT_X,
  PR,
  PR_OUT,
  RECHECK,
  RET_Z,
  RUN_START,
  TO_CUP,
  v,
} from './layout'

const X = new Vector3(1, 0, 0)
const trough = new MeshStandardMaterial({ color: '#CFC6B8', roughness: 0.9, metalness: 0 })
const rail = new MeshStandardMaterial({ color: '#BDB2A3', roughness: 0.8, metalness: 0 })
const groove = new MeshStandardMaterial({ color: '#B9B0A4', roughness: 0.95, metalness: 0 })

/** A trough under a polyline: a shallow bed and two low rails, so a marble reads as riding a track. */
function Lane({ pts, w = 0.5, drop = MY - 0.1 }: { pts: Vector3[]; w?: number; drop?: number }) {
  const segs = useMemo(() => {
    const out: { pos: Vector3; q: Quaternion; len: number }[] = []
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]
      const b = pts[i]
      const d = b.clone().sub(a)
      const len = d.length()
      if (len < 1e-3) continue
      const q = new Quaternion().setFromUnitVectors(X, d.normalize())
      out.push({ pos: a.clone().add(b).multiplyScalar(0.5).setY((a.y + b.y) / 2 - drop), q, len: len + 0.06 })
    }
    return out
  }, [pts, drop])
  return (
    <>
      {segs.map((s, i) => (
        <group key={i} position={s.pos} quaternion={s.q}>
          <mesh material={trough} receiveShadow>
            <boxGeometry args={[s.len, 0.07, w]} />
          </mesh>
          <mesh material={rail} position={[0, 0.06, w / 2 - 0.03]} castShadow>
            <boxGeometry args={[s.len, 0.09, 0.06]} />
          </mesh>
          <mesh material={rail} position={[0, 0.06, -w / 2 + 0.03]} castShadow>
            <boxGeometry args={[s.len, 0.09, 0.06]} />
          </mesh>
        </group>
      ))}
    </>
  )
}

/** A line inlaid in the deck: a standing relationship, not a track. */
function Groove({ a, b, w = 0.07 }: { a: Vector3; b: Vector3; w?: number }) {
  const d = b.clone().sub(a).setY(0)
  const len = d.length()
  const ang = Math.atan2(-d.z, d.x)
  return (
    <mesh material={groove} position={[(a.x + b.x) / 2, 0.006, (a.z + b.z) / 2]} rotation={[0, ang, 0]}>
      <boxGeometry args={[len, 0.012, w]} />
    </mesh>
  )
}

/** One of the three agents: a slate drum with a pale top. */
function Drum({ at, r = 0.62 }: { at: Vector3; r?: number }) {
  return (
    <group position={at}>
      <mesh material={M.slate} position={[0, 0.25, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[r, r * 1.04, 0.5, 40]} />
      </mesh>
      <mesh material={M.porcelain} position={[0, 0.51, 0]} receiveShadow>
        <cylinderGeometry args={[r * 0.82, r * 0.82, 0.04, 40]} />
      </mesh>
    </group>
  )
}

export function Deck() {
  const collector = useMemo(
    () => [v(COLLECT_X, MY, CUP.accept.z - 0.3), v(COLLECT_X, MY, RET_Z - 0.4), v(COLLECT_X - 0.4, MY, RET_Z), v(-8.3, MY, RET_Z), v(OFF_X, 1.25, RET_Z)],
    [],
  )
  const run = useMemo(() => [ENTRY.pts[1].clone(), RUN_START.clone(), JUNCTION.clone()], [])
  return (
    <group>
      <RoundedBox args={[DECK.x1 - DECK.x0, 0.6, DECK.z1 - DECK.z0]} radius={0.28} smoothness={4} position={[(DECK.x0 + DECK.x1) / 2, -0.3, (DECK.z0 + DECK.z1) / 2]} material={M.labTop} receiveShadow castShadow />

      {/* The lab's arch on the left edge: requests come in under it, answers go back out. */}
      <group position={[PORT_X, 0, 0]}>
        <mesh material={M.clay} position={[0, 0.85, -1.9]} castShadow>
          <boxGeometry args={[0.42, 1.7, 0.42]} />
        </mesh>
        <mesh material={M.clay} position={[0, 0.85, 4.0]} castShadow>
          <boxGeometry args={[0.42, 1.7, 0.42]} />
        </mesh>
        <mesh material={M.clay} position={[0, 1.82, 1.05]} castShadow>
          <boxGeometry args={[0.46, 0.34, 6.5]} />
        </mesh>
      </group>

      <Lane pts={ENTRY.pts.slice(0, 2)} />
      <Lane pts={run} />
      {Object.values(TO_CUP).map((p, i) => (
        <Lane key={i} pts={p.pts.slice(0, 3)} w={0.44} />
      ))}
      <Lane pts={collector} w={0.46} />
      <Lane pts={BOOK_IN.pts} w={0.4} />
      <Lane pts={PAPER_IN.pts} w={0.4} />
      <Lane pts={PR_OUT.pts} w={0.4} />
      {GRANT_IDS.map(gid => (
        <Lane key={gid} pts={FUND_CHUTE[gid].pts.slice(0, 2)} w={0.38} drop={0.18} />
      ))}

      {/* The purchasing agent is the run itself: a long slate body under the six gates. */}
      <RoundedBox args={[7.6, 0.14, 1.25]} radius={0.06} smoothness={3} position={[-3.45, 0.02, 0]} material={M.slate} receiveShadow />
      {/* The switch housing at the end of the run. */}
      <mesh material={M.slate} position={[JUNCTION.x, 0.05, JUNCTION.z]} receiveShadow>
        <cylinderGeometry args={[0.62, 0.66, 0.14, 40]} />
      </mesh>

      <Drum at={BOOK} />
      <Drum at={PR} />
      {/* Bookkeeping keeps both grants' books: inlaid lines from its drum to each grant. */}
      <Groove a={BOOK} b={GRANT_AT[GRANT_IDS[1]]} />
      <Groove a={GRANT_AT[GRANT_IDS[1]]} b={GRANT_AT[GRANT_IDS[0]]} />
      <Groove a={RECHECK.pts[0]} b={RECHECK.pts[1]} w={0.05} />

      {/* The grant manager: the one person in the office, beside her latch. */}
      <group position={GM}>
        <mesh material={M.slateDeep} position={[0, 0.34, 0]} castShadow>
          <cylinderGeometry args={[0.16, 0.26, 0.62, 24]} />
        </mesh>
        <mesh material={M.clay} position={[0, 0.8, 0]} castShadow>
          <sphereGeometry args={[0.17, 24, 16]} />
        </mesh>
      </group>
    </group>
  )
}
