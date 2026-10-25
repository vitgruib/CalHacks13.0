// The three robots and everything they carry. Each robot is a different
// simple shape with its own accent, so you can tell them apart at a glance:
// Purchasing is round and carries a tray, Bookkeeping is a squat cash box
// that carries on its lid, Payment & report is tall with a paper slot.

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type ReactNode } from 'react'
import { Color, CylinderGeometry, MeshStandardMaterial, SphereGeometry, type Group, type Mesh } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { liquid } from '../a1/mats'
import { PAL } from '../a1/layout'
import { P, B, R, clock, things, type Bot } from './brain'

const clay = (color: string, roughness = 0.84) => new MeshStandardMaterial({ color, roughness, metalness: 0 })
export const MAT = {
  shell: clay('#F3EFE9', 0.7),
  ink: clay('#222A33', 0.5),
  wheel: clay('#4E5967', 0.8),
  eye: new MeshStandardMaterial({ color: '#EAF6FF', emissive: new Color('#BFE6FF'), emissiveIntensity: 0.6, roughness: 0.3 }),
}
export const ACCENT = { p: '#E9785C', b: '#2F9DB5', r: '#E3B23C' }

const noRay = () => null

/** Shared bits: eyes that blink now and then, an antenna whose tip glows when the robot does something. */
function Face({ y, z, gap = 0.12, children }: { y: number; z: number; gap?: number; children?: ReactNode }) {
  const eyes = useRef<Group>(null)
  const seed = useMemo(() => Math.random() * 10, [])
  useFrame(() => {
    const e = eyes.current
    if (!e) return
    const t = clock.t + seed
    const blink = t % 4.2 < 0.12 ? 0.15 : 1
    e.scale.y = blink
  })
  return (
    <group position={[0, y, z]}>
      {children}
      <group ref={eyes}>
        <mesh material={MAT.eye} position={[-gap, 0, 0.012]} raycast={noRay}>
          <sphereGeometry args={[0.045, 14, 10]} />
        </mesh>
        <mesh material={MAT.eye} position={[gap, 0, 0.012]} raycast={noRay}>
          <sphereGeometry args={[0.045, 14, 10]} />
        </mesh>
      </group>
    </group>
  )
}

function Antenna({ bot, y, accent, h = 0.22 }: { bot: Bot; y: number; accent: string; h?: number }) {
  const tip = useMemo(() => new MeshStandardMaterial({ color: accent, emissive: new Color(accent), emissiveIntensity: 0, roughness: 0.4 }), [accent])
  useFrame(() => {
    const age = clock.t - bot.ping
    tip.emissiveIntensity = age >= 0 && age < 1 ? 0.9 * (1 - age) : 0
  })
  return (
    <group position={[0, y, 0]}>
      <mesh material={MAT.ink} position={[0, h / 2, 0]} raycast={noRay}>
        <cylinderGeometry args={[0.016, 0.016, h, 8]} />
      </mesh>
      <mesh material={tip} position={[0, h + 0.04, 0]} castShadow raycast={noRay}>
        <sphereGeometry args={[0.055, 16, 12]} />
      </mesh>
    </group>
  )
}

/** Moves a robot's group from its brain state: position, facing, a bob and a lean while it rolls. */
function Rig({ bot, children }: { bot: Bot; children: ReactNode }) {
  const g = useRef<Group>(null)
  const body = useRef<Group>(null)
  useFrame(() => {
    if (!g.current || !body.current) return
    g.current.position.set(bot.pos.x, 0, bot.pos.z)
    g.current.rotation.y = bot.yaw
    const s = Math.min(1, bot.speed / 3)
    body.current.position.y = Math.abs(Math.sin(clock.t * 11)) * 0.035 * s + Math.sin(clock.t * 2 + bot.home[0]) * 0.012
    body.current.rotation.x = 0.16 * s
  })
  return (
    <group ref={g} scale={1.2}>
      <group ref={body}>{children}</group>
    </group>
  )
}

const discGeo = new CylinderGeometry(0.2, 0.2, 0.07, 24)

/** Purchasing: a round robot on a ball wheel, holding a tray in front. */
function PurchasingBot() {
  const accent = useMemo(() => clay(ACCENT.p, 0.7), [])
  return (
    <Rig bot={P}>
      <mesh material={MAT.wheel} position={[0, 0.16, 0]} castShadow raycast={noRay}>
        <sphereGeometry args={[0.16, 18, 12]} />
      </mesh>
      <mesh material={MAT.shell} position={[0, 0.64, 0]} castShadow raycast={noRay}>
        <sphereGeometry args={[0.42, 32, 24]} />
      </mesh>
      <mesh material={accent} position={[0, 0.5, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow raycast={noRay}>
        <torusGeometry args={[0.4, 0.05, 12, 40]} />
      </mesh>
      <mesh material={accent} position={[0, 1.02, 0]} castShadow raycast={noRay}>
        <sphereGeometry args={[0.13, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <Face y={0.74} z={0.36}>
        <mesh material={MAT.ink} scale={[1, 0.62, 0.4]} raycast={noRay}>
          <sphereGeometry args={[0.24, 24, 16]} />
        </mesh>
      </Face>
      <Antenna bot={P} y={1.12} accent={ACCENT.p} h={0.14} />
      {/* the tray and its two little arms */}
      <mesh material={accent} geometry={discGeo} position={[0, 0.42, 0.56]} scale={[1.25, 1, 1]} castShadow raycast={noRay} />
      <mesh material={MAT.shell} position={[-0.22, 0.47, 0.42]} rotation={[1.2, 0, 0]} raycast={noRay}>
        <capsuleGeometry args={[0.04, 0.18, 4, 8]} />
      </mesh>
      <mesh material={MAT.shell} position={[0.22, 0.47, 0.42]} rotation={[1.2, 0, 0]} raycast={noRay}>
        <capsuleGeometry args={[0.04, 0.18, 4, 8]} />
      </mesh>
    </Rig>
  )
}

const boxGeo = new RoundedBoxGeometry(0.78, 0.6, 0.64, 4, 0.14)
const lidGeo = new RoundedBoxGeometry(0.84, 0.14, 0.7, 3, 0.06)
const screenGeo = new RoundedBoxGeometry(0.46, 0.24, 0.04, 2, 0.02)

/** Bookkeeping: a squat cash box on two wheels; it carries things on its lid. */
function BookkeepingBot() {
  const accent = useMemo(() => clay(ACCENT.b, 0.7), [])
  const wheels = useRef<Group>(null)
  useFrame((_, dt) => {
    if (wheels.current) wheels.current.rotation.x += Math.min(dt, 0.1) * B.speed * 4
  })
  return (
    <Rig bot={B}>
      <mesh material={MAT.shell} geometry={boxGeo} position={[0, 0.5, 0]} castShadow raycast={noRay} />
      <mesh material={accent} geometry={lidGeo} position={[0, 0.84, 0]} castShadow raycast={noRay} />
      {/* a coin slot on the lid */}
      <mesh material={MAT.ink} position={[0.22, 0.915, -0.12]} raycast={noRay}>
        <boxGeometry args={[0.16, 0.012, 0.035]} />
      </mesh>
      <Face y={0.56} z={0.32} gap={0.1}>
        <mesh material={MAT.ink} geometry={screenGeo} raycast={noRay} />
      </Face>
      <group ref={wheels} position={[0, 0.17, 0]}>
        {[-0.42, 0.42].map(x => (
          <mesh key={x} material={MAT.wheel} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow raycast={noRay}>
            <cylinderGeometry args={[0.17, 0.17, 0.08, 20]} />
          </mesh>
        ))}
      </group>
      <group position={[-0.24, 0, -0.14]}>
        <Antenna bot={B} y={0.91} accent={ACCENT.b} h={0.2} />
      </group>
    </Rig>
  )
}

/** Payment & report: tall and narrow, with a paper slot across its chest and a cap. */
function PaymentBot() {
  const accent = useMemo(() => clay(ACCENT.r, 0.7), [])
  return (
    <Rig bot={R}>
      <mesh material={MAT.wheel} position={[0, 0.13, 0]} castShadow raycast={noRay}>
        <sphereGeometry args={[0.13, 16, 12]} />
      </mesh>
      <mesh material={MAT.shell} position={[0, 0.72, 0]} castShadow raycast={noRay}>
        <capsuleGeometry args={[0.3, 0.62, 8, 24]} />
      </mesh>
      <mesh material={accent} position={[0, 1.28, 0]} castShadow raycast={noRay}>
        <cylinderGeometry args={[0.2, 0.31, 0.2, 24]} />
      </mesh>
      <mesh material={MAT.ink} position={[0, 0.74, 0.29]} raycast={noRay}>
        <boxGeometry args={[0.3, 0.035, 0.04]} />
      </mesh>
      <Face y={1.02} z={0.255} gap={0.09}>
        <mesh material={MAT.ink} scale={[1, 0.6, 0.3]} raycast={noRay}>
          <sphereGeometry args={[0.18, 20, 14]} />
        </mesh>
      </Face>
      <Antenna bot={R} y={1.38} accent={ACCENT.r} h={0.16} />
      {[-0.3, 0.3].map(x => (
        <mesh key={x} material={MAT.shell} position={[x, 0.78, 0.18]} rotation={[1.0, 0, 0]} raycast={noRay}>
          <capsuleGeometry args={[0.04, 0.2, 4, 8]} />
        </mesh>
      ))}
    </Rig>
  )
}

// ── What they carry ──────────────────────────────────────────────────────

const POOL = 30
const parcelGeo = new RoundedBoxGeometry(0.42, 0.32, 0.42, 3, 0.05)
const bandGeo = new RoundedBoxGeometry(0.445, 0.15, 0.445, 2, 0.03)
const slipGeo = new RoundedBoxGeometry(0.4, 0.035, 0.3, 2, 0.012)
const stripeGeo = new RoundedBoxGeometry(0.4, 0.045, 0.08, 2, 0.015)
const ballGeo = new SphereGeometry(0.2, 24, 16)
const coinGeo = new CylinderGeometry(0.15, 0.15, 0.05, 24)
const coinMat = new MeshStandardMaterial({ color: '#E2B24F', roughness: 0.32, metalness: 0.35 })
const moneyMat = liquid(PAL.money)

interface Slot {
  g: Group | null
  parcel: Mesh | null
  band: Mesh | null
  slip: Mesh | null
  stripe: Mesh | null
  ball: Mesh | null
  coin: Mesh | null
}

function Things() {
  const slots = useMemo<Slot[]>(() => Array.from({ length: POOL }, () => ({ g: null, parcel: null, band: null, slip: null, stripe: null, ball: null, coin: null })), [])
  const mats = useMemo(
    () => Array.from({ length: POOL }, () => ({ body: clay('#EDE6DA', 0.8), tag: clay('#FFFFFF', 0.6) })),
    [],
  )
  useFrame(() => {
    let i = 0
    for (const th of things.values()) {
      if (i >= POOL) break
      const s = slots[i]
      const m = mats[i]
      i++
      if (!s.g || !s.parcel || !s.band || !s.slip || !s.stripe || !s.ball || !s.coin) continue
      s.g.visible = th.size > 0.01
      s.g.position.copy(th.pos)
      s.g.rotation.set(th.stand ? Math.PI / 2 - 0.12 : 0, th.stand ? 0 : th.yaw, 0)
      if (th.look === 'coin') s.g.rotation.set(0, th.spin, 0)
      s.g.scale.setScalar(Math.max(0.001, th.size * 1.2))
      // An answered thing takes on its outcome's glaze, so the colour reads from across the deck.
      m.body.color.copy(th.tone)
      if (th.tag) {
        m.tag.color.copy(th.tag)
        m.body.color.lerp(th.tag, th.look === 'parcel' ? 0.5 : 0.35)
      }
      s.parcel.visible = th.look === 'parcel'
      s.band.visible = th.look === 'parcel' && !!th.tag
      s.slip.visible = th.look === 'slip'
      s.stripe.visible = th.look === 'slip' && !!th.tag
      s.ball.visible = th.look === 'money'
      s.coin.visible = th.look === 'coin'
      if (th.look === 'money') s.ball.position.y = 0
    }
    for (; i < POOL; i++) if (slots[i].g) slots[i].g!.visible = false
  })
  return (
    <group>
      {slots.map((s, i) => (
        <group key={i} ref={el => void (s.g = el)} visible={false}>
          <mesh ref={el => void (s.parcel = el)} geometry={parcelGeo} material={mats[i].body} castShadow raycast={noRay} />
          <mesh ref={el => void (s.band = el)} geometry={bandGeo} material={mats[i].tag} castShadow raycast={noRay} />
          <mesh ref={el => void (s.slip = el)} geometry={slipGeo} material={mats[i].body} castShadow raycast={noRay} />
          <mesh ref={el => void (s.stripe = el)} geometry={stripeGeo} material={mats[i].tag} position={[0, 0.006, -0.11]} raycast={noRay} />
          <mesh ref={el => void (s.ball = el)} geometry={ballGeo} material={moneyMat} castShadow raycast={noRay} />
          <mesh ref={el => void (s.coin = el)} geometry={coinGeo} material={coinMat} castShadow raycast={noRay} />
        </group>
      ))}
    </group>
  )
}

export function Robots() {
  return (
    <>
      <PurchasingBot />
      <BookkeepingBot />
      <PaymentBot />
      <Things />
    </>
  )
}
