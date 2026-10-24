// The camera. One authored move on load: from a low oblique view of the
// closed building, the facade lifts off and the camera swings round to face
// the section. Then it is the viewer's: drag trucks along the section,
// scroll or pinch dollies, right-drag orbits a little. Clicking a room
// pulls it out of the model and the camera follows it.

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CameraControls, CameraControlsImpl } from '@react-three/drei'
import * as THREE from 'three'
import { PULL, roomMid, roomOf, terminalOf } from './layout'
import { intro, onSelect, ui } from './state'

const { ACTION } = CameraControlsImpl
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const DIR = V(-0.12, 0.08, 1).normalize()

export interface View {
  fov: number
  target: THREE.Vector3
  pos: THREE.Vector3
  dist: number
  portrait: boolean
}

export function homeView(width: number, height: number): View {
  const aspect = width / height
  const portrait = aspect < 0.95
  const fov = portrait ? 34 : 26
  const vt = Math.tan((fov * Math.PI) / 360)
  const ht = vt * aspect
  // a phone is too narrow for the whole section: frame the two wings and let the edges crop (drag to see them)
  const W = portrait ? 23.5 : 44
  const H = portrait ? 16 : 26
  const dist = Math.max(W / (2 * ht), H / (2 * vt))
  // on desktop the model sits low, so the top band is sky for the title and ledger
  const target = portrait ? V(0, 4.4, 0) : V(0.2, dist * vt - 5.8, 0)
  return { fov, target, pos: target.clone().addScaledVector(DIR, dist), dist, portrait }
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

export function Rig({ reduced }: { reduced: boolean }) {
  const ref = useRef<CameraControlsImpl>(null)
  const camera = useThree(s => s.camera) as THREE.PerspectiveCamera
  const width = useThree(s => s.size.width)
  const height = useThree(s => s.size.height)
  const home = useMemo(() => homeView(width, height), [width, height])
  const st = useRef({ t: reduced ? 1 : 0, done: reduced })
  const start = useMemo(() => {
    const target = home.portrait ? V(-4, 4.2, 0) : V(-5, 4.6, 0)
    return { target, pos: target.clone().add(home.portrait ? V(-26, -1.5, 40) : V(-22, -1.2, 24)) }
  }, [home])

  useEffect(() => {
    camera.fov = home.fov
    camera.updateProjectionMatrix()
    const c = ref.current
    if (!c) return
    c.mouseButtons.left = ACTION.TRUCK
    c.mouseButtons.right = ACTION.ROTATE
    c.mouseButtons.middle = ACTION.DOLLY
    c.mouseButtons.wheel = ACTION.DOLLY
    c.touches.one = ACTION.TOUCH_TRUCK
    c.touches.two = ACTION.TOUCH_DOLLY_TRUCK
    c.touches.three = ACTION.TOUCH_ROTATE
    c.dollyToCursor = true
    c.minDistance = 8
    c.maxDistance = home.dist * 1.3
    c.minPolarAngle = Math.PI / 2 - 0.55
    c.maxPolarAngle = Math.PI / 2 + 0.1
    c.minAzimuthAngle = -0.7
    c.maxAzimuthAngle = 0.7
    c.setBoundary(new THREE.Box3(V(-22, -3.5, -2), V(22, 13, PULL + 1)))
    c.smoothTime = reduced ? 0.05 : 0.4
    c.draggingSmoothTime = 0.1
    if (st.current.done) c.setLookAt(home.pos.x, home.pos.y, home.pos.z, home.target.x, home.target.y, home.target.z, false)
    else c.setLookAt(start.pos.x, start.pos.y, start.pos.z, start.target.x, start.target.y, start.target.z, false)
    intro.t = st.current.t
    const finish = () => {
      if (st.current.done) return
      st.current.done = true
      st.current.t = 1
      intro.t = 1
    }
    const touched = () => {
      ui.touchedAt = performance.now()
      finish()
    }
    c.addEventListener('controlstart', touched)
    return () => c.removeEventListener('controlstart', touched)
  }, [camera, home, start, reduced])

  // Follow the drawer that is pulled out; go home when it slides back.
  useEffect(
    () =>
      onSelect(() => {
        const c = ref.current
        if (!c) return
        if (!st.current.done) {
          st.current.done = true
          st.current.t = 1
          intro.t = 1
        }
        const id = ui.selected
        const anim = !reduced
        const room = id ? roomOf(id) : undefined
        if (!id) {
          c.setLookAt(home.pos.x, home.pos.y, home.pos.z, home.target.x, home.target.y, home.target.z, anim)
          return
        }
        const vt = Math.tan((home.fov * Math.PI) / 360)
        const ht = vt * (width / height)
        const m = room ? roomMid(room).setZ(PULL * 0.55) : terminalOf(id).clone()
        const span = room ? room.x1 - room.x0 + 2.4 : 9
        const d = Math.max(span / (2 * ht) / (home.portrait ? 1 : 0.72), (room ? 7.5 : 9) / (2 * vt), 11)
        const visW = 2 * d * ht
        const visH = 2 * d * vt
        const t = home.portrait ? V(m.x, m.y - visH * 0.2, m.z) : V(m.x + visW * 0.14, m.y + 0.2, m.z)
        const p = t.clone().addScaledVector(DIR, d)
        c.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, anim)
      }),
    [home, width, height, reduced],
  )

  useFrame((_, dt) => {
    const c = ref.current
    if (!c || st.current.done) return
    st.current.t = Math.min(1, st.current.t + dt / 5)
    intro.t = st.current.t
    const e = easeInOut(Math.min(1, Math.max(0, (st.current.t - 0.08) / 0.92)))
    c.lerpLookAt(
      start.pos.x,
      start.pos.y,
      start.pos.z,
      start.target.x,
      start.target.y,
      start.target.z,
      home.pos.x,
      home.pos.y,
      home.pos.z,
      home.target.x,
      home.target.y,
      home.target.z,
      e,
      false,
    )
    if (st.current.t >= 1) st.current.done = true
  })

  return <CameraControls ref={ref} makeDefault />
}
