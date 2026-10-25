// The deck the robots work on, in a1's studio: a pale seamless void, a warm
// key light, matte clay. Left: the doorway from the lab. Middle: six rule
// posts in a row. Back: the two grant vaults either side of the funder and
// court gate. Front: the grant manager's desk. Right: the vendors' dock.

import { ContactShadows, Environment, Lightformer } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useMemo, useRef } from 'react'
import { BackSide, Color, DoubleSide, MeshStandardMaterial, ShaderMaterial, Vector3, type Group, type Mesh } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { R01, R21, feed, useFlow } from '../../feed'
import { GLAZE, GRANT_COLOR, PAL } from '../a1/layout'
import { glass } from '../a1/mats'
import { Robots } from './Bots'
import { LabelTracker } from './Labels'
import { DECK, DESK, DOCK, GATE, GM_AT, PORT, POSTS, VAULT, clear, clock, gm, onEvent, posts, sync, update, vaults } from './brain'

const clay = (color: string, roughness = 0.86) => new MeshStandardMaterial({ color, roughness, metalness: 0 })
const MAT = {
  deck: clay('#E9E4DC', 0.92),
  lane: clay('#DDD6CB', 0.95),
  base: clay(PAL.clayDeep),
  clay: clay(PAL.clay),
  chalk: clay(PAL.chalk),
  slate: clay(PAL.slate, 0.78),
  ink: clay(PAL.ink, 0.7),
  roof: clay('#8F99A6', 0.8),
  tunnel: new MeshStandardMaterial({ color: '#4A535E', roughness: 1, side: DoubleSide }),
}
const noRay = () => null

// ── Studio (copied from a1's Scene.tsx, bounds fitted to this deck) ───────

function Backdrop() {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        uniforms: { top: { value: new Color(PAL.voidHi) }, bottom: { value: new Color(PAL.void) } },
        vertexShader: 'varying vec3 vP; void main() { vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader:
          'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main() { float h = smoothstep(-0.25, 0.55, vP.y); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }',
      }),
    [],
  )
  return (
    <mesh material={mat} renderOrder={-1} raycast={noRay}>
      <sphereGeometry args={[120, 32, 16]} />
    </mesh>
  )
}

function Ground() {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        depthWrite: false,
        uniforms: { inner: { value: new Color(PAL.ground) }, outer: { value: new Color(PAL.void) } },
        vertexShader: 'varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader:
          'uniform vec3 inner; uniform vec3 outer; varying vec2 vP; void main() { float d = length(vP * vec2(0.62, 1.0)) / 20.0; float k = 1.0 - smoothstep(0.0, 1.0, d); gl_FragColor = vec4(mix(outer, inner, k * k), 1.0); }',
      }),
    [],
  )
  return (
    <mesh material={mat} position={[0, -2.6, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1} raycast={noRay}>
      <planeGeometry args={[140, 140]} />
    </mesh>
  )
}

function Lights() {
  return (
    <>
      <hemisphereLight args={['#FFF8EE', '#8A93A0', 0.62]} />
      <directionalLight
        position={[-8, 16, 10]}
        intensity={2.5}
        color="#FFF0DC"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.03}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-camera-near={1}
        shadow-camera-far={60}
      />
      <directionalLight position={[16, 7, 8]} intensity={0.55} color="#CFE0F5" />
      <directionalLight position={[6, 9, -16]} intensity={0.85} color="#EAF2FF" />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.0} position={[-4, 9, 3]} rotation={[Math.PI / 2, 0, 0]} scale={[16, 8, 1]} color="#FFF6EA" />
        <Lightformer form="rect" intensity={1.0} position={[-12, 4, 6]} rotation={[0, Math.PI / 2.4, 0]} scale={[10, 4, 1]} color="#FFF1E2" />
        <Lightformer form="rect" intensity={0.9} position={[12, 3, -4]} rotation={[0, -Math.PI / 2.2, 0]} scale={[10, 3, 1]} color="#D6E4F2" />
        <Lightformer form="ring" intensity={1.4} position={[6, 6, -12]} scale={4} color="#EAF2FF" />
      </Environment>
    </>
  )
}

// ── The deck and its stations ────────────────────────────────────────────

const deckGeo = new RoundedBoxGeometry(DECK.w, 0.5, DECK.d, 4, 0.22)
const laneGeo = new RoundedBoxGeometry(5.3, 0.02, 0.86, 2, 0.01)

function Deck() {
  return (
    <group>
      <mesh geometry={deckGeo} material={MAT.deck} position={[0, -0.25, 0]} receiveShadow raycast={noRay} />
      {/* the purchasing robot's lane past the rule posts */}
      <mesh geometry={laneGeo} material={MAT.lane} position={[-2.75, 0.005, -0.66]} receiveShadow raycast={noRay} />
    </group>
  )
}

/** A low doorway on a deck edge: things come in and go out through it. */
function Doorway({ x, z, w, flip = false }: { x: number; z: number; w: number; flip?: boolean }) {
  return (
    <group position={[x, 0, z]} rotation={[0, flip ? Math.PI : 0, 0]}>
      {[-w / 2, w / 2].map(dz => (
        <mesh key={dz} material={MAT.chalk} position={[0, 0.5, dz]} castShadow receiveShadow raycast={noRay}>
          <boxGeometry args={[0.32, 1.0, 0.3]} />
        </mesh>
      ))}
      <mesh material={MAT.chalk} position={[0, 1.08, 0]} castShadow raycast={noRay}>
        <boxGeometry args={[0.36, 0.2, w + 0.34]} />
      </mesh>
      <mesh material={MAT.tunnel} position={[-0.14, 0.49, 0]} rotation={[0, Math.PI / 2, 0]} raycast={noRay}>
        <planeGeometry args={[w - 0.28, 0.98]} />
      </mesh>
    </group>
  )
}

function RulePosts() {
  const stems = useRef<(Group | null)[]>([])
  const mats = useMemo(() => POSTS.map(() => new MeshStandardMaterial({ color: '#D8D0C3', roughness: 0.5, emissive: new Color('#000000') })), [])
  const IDLE = useMemo(() => new Color('#D8D0C3'), [])
  const PASS = useMemo(() => new Color(GLAZE.accept), [])
  const FAIL = useMemo(() => new Color(GLAZE.reject), [])
  useFrame((_, delta) => {
    const k = 1 - Math.exp(-Math.min(delta, 0.1) * 8)
    posts.forEach((s, i) => {
      const age = clock.t - s.at
      // A lit post stays lit a while, then fades back so stale answers don't linger.
      const lit = s.state !== 0 && age < 6
      const target = !lit ? IDLE : s.state === 1 ? PASS : FAIL
      const m = mats[i]
      m.color.lerp(target, k)
      m.emissive.lerp(lit ? target : new Color(0, 0, 0), k)
      m.emissiveIntensity = 0.32
      const g = stems.current[i]
      if (g) g.scale.setScalar(1 + (age >= 0 && age < 0.5 ? 0.22 * Math.sin((age / 0.5) * Math.PI) : 0))
    })
  })
  return (
    <group>
      {POSTS.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]} ref={el => void (stems.current[i] = el)}>
          <mesh material={MAT.base} position={[0, 0.04, 0]} castShadow receiveShadow raycast={noRay}>
            <cylinderGeometry args={[0.22, 0.26, 0.08, 24]} />
          </mesh>
          <mesh material={MAT.clay} position={[0, 0.34, 0]} castShadow raycast={noRay}>
            <cylinderGeometry args={[0.06, 0.08, 0.56, 14]} />
          </mesh>
          <mesh material={mats[i]} position={[0, 0.74, 0]} castShadow raycast={noRay}>
            <sphereGeometry args={[0.17, 24, 16]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

const iceGeo = new RoundedBoxGeometry(1.5, 1.75, 1.3, 4, 0.18)
const safeGeo = new RoundedBoxGeometry(1.2, 1.3, 1.0, 4, 0.12)
const COINS = 6

/** A grant is a closed clay safe; the coins on top are the money left, and frost covers it while frozen. */
function Vault({ gid }: { gid: string }) {
  const [x, z] = VAULT[gid]
  const coins = useRef<(Mesh | null)[]>([])
  const mats = useMemo(() => {
    const ice = glass()
    ice.userData.u.uFrost.value = 1
    ice.userData.u.uFade.value = vaults[gid].frozen ? 1 : 0
    return {
      door: new MeshStandardMaterial({ color: PAL.clay, roughness: 0.8, emissive: new Color(PAL.money), emissiveIntensity: 0 }),
      collar: clay(GRANT_COLOR[gid] ?? '#999999', 0.7),
      coin: new MeshStandardMaterial({ color: '#E2B24F', roughness: 0.35, metalness: 0.35 }),
      ice,
    }
  }, [gid])
  const shown = useRef({ ice: vaults[gid].frozen ? 1 : 0 })
  useFrame((_, delta) => {
    const v = vaults[gid]
    const dt = Math.min(delta, 0.1)
    const s = shown.current
    s.ice += ((v.frozen ? 1 : 0) - s.ice) * (1 - Math.exp(-dt * 2.2))
    mats.ice.userData.u.uFade.value = s.ice
    mats.ice.visible = s.ice > 0.01
    // A brief glow when money arrives or the books are checked.
    const pa = Math.min(clock.t - v.pulse, clock.t - v.check)
    mats.door.emissiveIntensity = pa >= 0 && pa < 1.2 ? 0.6 * (1 - pa / 1.2) : 0
    const n = Math.max(1, Math.round(v.level * COINS))
    coins.current.forEach((c, i) => c && (c.visible = i < n))
  })
  return (
    <group position={[x, 0, z]}>
      <mesh geometry={safeGeo} material={MAT.clay} position={[0, 0.65, 0]} castShadow receiveShadow raycast={noRay} />
      <mesh material={mats.collar} position={[0, 0.12, 0]} castShadow raycast={noRay}>
        <boxGeometry args={[1.24, 0.1, 1.04]} />
      </mesh>
      <mesh material={mats.door} position={[0, 0.68, 0.5]} rotation={[Math.PI / 2, 0, 0]} castShadow raycast={noRay}>
        <cylinderGeometry args={[0.36, 0.36, 0.06, 32]} />
      </mesh>
      <mesh material={MAT.slate} position={[0, 0.68, 0.55]} rotation={[0, 0, Math.PI / 4]} raycast={noRay}>
        <boxGeometry args={[0.36, 0.06, 0.05]} />
      </mesh>
      {Array.from({ length: COINS }, (_, i) => (
        <mesh key={i} ref={el => void (coins.current[i] = el)} material={mats.coin} position={[0.25, 1.33 + i * 0.06, 0]} castShadow raycast={noRay}>
          <cylinderGeometry args={[0.16, 0.16, 0.05, 20]} />
        </mesh>
      ))}
      <mesh geometry={iceGeo} material={mats.ice} position={[0, 0.85, 0]} renderOrder={2} raycast={noRay} />
    </group>
  )
}

/** The funder and court gate: a small portico on the back edge. */
function Gate() {
  const [x] = GATE.mouth
  return (
    <group position={[x, 0, -4.05]}>
      <mesh material={MAT.chalk} position={[0, 0.06, 0]} receiveShadow castShadow raycast={noRay}>
        <boxGeometry args={[2.1, 0.12, 0.8]} />
      </mesh>
      {[-0.75, 0.75].map(dx => (
        <mesh key={dx} material={MAT.chalk} position={[dx, 0.68, 0]} castShadow raycast={noRay}>
          <cylinderGeometry args={[0.11, 0.13, 1.14, 18]} />
        </mesh>
      ))}
      <mesh material={MAT.chalk} position={[0, 1.33, 0]} castShadow raycast={noRay}>
        <boxGeometry args={[2.0, 0.16, 0.62]} />
      </mesh>
      <mesh material={MAT.roof} position={[0, 1.47, 0]} castShadow raycast={noRay}>
        <boxGeometry args={[2.1, 0.12, 0.7]} />
      </mesh>
      <mesh material={MAT.tunnel} position={[0, 0.66, -0.2]} raycast={noRay}>
        <planeGeometry args={[1.3, 1.1]} />
      </mesh>
    </group>
  )
}

function Dock() {
  return (
    <group>
      <Doorway x={7.62} z={DOCK.mouth[1]} w={1.3} flip />
      <mesh material={MAT.base} position={[DOCK.rest[0] - 0.05, 0.03, DOCK.rest[1]]} receiveShadow raycast={noRay}>
        <boxGeometry args={[1.1, 0.06, 1.1]} />
      </mesh>
      {/* a few crates say "vendors" without a word */}
      {[
        [7.0, 0.2, 2.55, 0.4],
        [7.05, 0.56, 2.55, 0.32],
        [6.5, 0.17, 2.75, 0.34],
      ].map(([cx, cy, cz, s], i) => (
        <mesh key={i} material={i === 1 ? MAT.chalk : MAT.clay} position={[cx, cy, cz]} rotation={[0, i * 0.4, 0]} castShadow receiveShadow raycast={noRay}>
          <boxGeometry args={[s, s, s]} />
        </mesh>
      ))}
    </group>
  )
}

const deskGeo = new RoundedBoxGeometry(0.8, 0.54, 1.8, 3, 0.06)
const deskTopGeo = new RoundedBoxGeometry(0.96, 0.07, 1.96, 3, 0.03)

/** The grant manager: the one human here, at a desk where held things wait for a decision. */
function Desk() {
  const head = useRef<Group>(null)
  const MATS = useMemo(() => ({ sweater: clay('#5D7190', 0.9), skin: clay('#E2BC9C', 0.8), hair: clay('#3B302A', 0.9) }), [])
  useFrame(() => {
    const a = clock.t - gm.nod
    if (head.current) head.current.rotation.z = a >= 0 && a < 0.9 ? -0.28 * Math.sin((a / 0.9) * Math.PI * 2) * (1 - a / 0.9) : 0.04 * Math.sin(clock.t * 0.7)
  })
  return (
    <group>
      <mesh geometry={deskGeo} material={MAT.clay} position={[DESK.at[0], 0.27, DESK.at[1]]} castShadow receiveShadow raycast={noRay} />
      <mesh geometry={deskTopGeo} material={MAT.chalk} position={[DESK.at[0], DESK.top - 0.035, DESK.at[1]]} castShadow receiveShadow raycast={noRay} />
      <group position={[GM_AT[0], 0, GM_AT[1]]} rotation={[0, Math.PI / 2, 0]}>
        <mesh material={MAT.slate} position={[0, 0.24, -0.08]} castShadow raycast={noRay}>
          <cylinderGeometry args={[0.22, 0.24, 0.48, 20]} />
        </mesh>
        <mesh material={MATS.sweater} position={[0, 0.8, -0.05]} castShadow raycast={noRay}>
          <capsuleGeometry args={[0.24, 0.42, 8, 20]} />
        </mesh>
        <group ref={head} position={[0, 1.32, 0]}>
          <mesh material={MATS.skin} castShadow raycast={noRay}>
            <sphereGeometry args={[0.2, 24, 18]} />
          </mesh>
          <mesh material={MATS.hair} position={[0, 0.05, -0.04]} scale={[1.05, 0.9, 1.05]} raycast={noRay}>
            <sphereGeometry args={[0.2, 24, 18, 0, Math.PI * 2, 0, Math.PI / 1.9]} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

function Stations() {
  return (
    <>
      <Deck />
      <Doorway x={-7.62} z={(PORT.rest[1] + PORT.laneR) / 2} w={1.85} />
      <RulePosts />
      <Vault gid={R01} />
      <Vault gid={R21} />
      <Gate />
      <Dock />
      <Desk />
    </>
  )
}

// ── Driving it ───────────────────────────────────────────────────────────

function Brain() {
  useFlow(onEvent)
  useEffect(() => () => clear(), [])
  // Capped like the feed's own clock, so a slow frame never jumps the robots.
  useFrame((_, delta) => update(Math.min(delta, 0.1)))
  return null
}

const TARGET = new Vector3(0.1, -0.3, 0.6)
function Camera() {
  const { camera } = useThree()
  const base = useMemo(() => new Vector3(0.3, 15.0, 15.4), [])
  useFrame(() => {
    // A very slow sway keeps the clay alive without pulling the eye.
    const t = clock.t
    camera.position.set(base.x + Math.sin(t * 0.07) * 0.6, base.y, base.z + Math.cos(t * 0.05) * 0.2)
    camera.lookAt(TARGET)
  })
  return null
}

export default function Scene() {
  // Start from what the world says now (the story may be partway in).
  useMemo(() => {
    clear()
    sync(feed.getWorld())
  }, [])
  return (
    <Canvas
      className="n2-canvas"
      shadows="percentage"
      dpr={[1, 1.5]}
      camera={{ fov: 31, near: 0.5, far: 300, position: [0.3, 15.0, 15.4] }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      role="img"
      aria-label="Three small clay robots run the grant office. The purchasing robot carries each request from the lab past six rule posts that light pass or fail, then sends it back bought, rerouted, blocked, or parks it on hold. The bookkeeping robot carries money and news from the funder's gate into the two grant vaults, which freeze and thaw. The payment and report robot checks papers and takes payment requests to the funder. Held things wait on the grant manager's desk."
    >
      <Backdrop />
      <Ground />
      <Lights />
      <Stations />
      <Robots />
      <Brain />
      <Camera />
      <LabelTracker />
      <ContactShadows position={[0, -2.58, 0]} scale={[30, 18]} blur={3} far={4} opacity={0.28} resolution={512} frames={1} color="#3A3530" />
      <EffectComposer multisampling={4}>
        <N8AO halfRes quality="low" aoRadius={0.5} distanceFalloff={0.7} intensity={1.8} color="#26303B" />
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      </EffectComposer>
    </Canvas>
  )
}
