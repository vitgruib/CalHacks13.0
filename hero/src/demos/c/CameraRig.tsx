// The camera: one authored establishing move (from the lab's lamps up and
// back until the whole terrain is in view), then the viewer's. Clicking a
// grant flies over its landform; "Back to the overview" flies home.

import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, type ComponentRef } from 'react'
import * as THREE from 'three'
import { BOUNDS, HERO, INTRO, MESA_BASE, mesaHeights, MESAS } from './layout'
import { reducedMotion, ui } from './store'

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

interface Shot {
  pos: THREE.Vector3
  target: THREE.Vector3
}

export function CameraRig() {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const { camera, size } = useThree()
  const wide = size.width >= 900
  const home = useMemo<Shot>(() => {
    const aspect = size.width / size.height
    const k = aspect < 0.8 ? 1.5 : aspect < 1.3 ? 1.2 : 1
    const target = HERO.target.clone().add(new THREE.Vector3(0, 0, aspect < 0.8 ? -2 : 0))
    return { pos: target.clone().add(HERO.pos.clone().sub(HERO.target).multiplyScalar(k)), target }
  }, [size.width, size.height])
  const homeRef = useRef(home)
  homeRef.current = home
  const anim = useRef<{ from: Shot; to: Shot; t0: number; dur: number; lift: number; intro?: boolean } | null>(null)

  // Shift the picture off-centre so the copy has room: right on desktop, down on a phone.
  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    cam.fov = wide ? 40 : 54
    if (wide) cam.setViewOffset(size.width, size.height, -size.width * 0.17, 0, size.width, size.height)
    else cam.setViewOffset(size.width, size.height, 0, -size.height * 0.07, size.width, size.height)
    cam.updateProjectionMatrix()
  }, [camera, size.width, size.height, wide])

  useEffect(() => {
    const c = controls.current
    if (!c) return
    const h = homeRef.current
    if (reducedMotion()) {
      camera.position.copy(h.pos)
      c.target.copy(h.target)
      c.update()
      ui.set({ cameraIdle: true })
    } else {
      camera.position.copy(INTRO.pos)
      c.target.copy(INTRO.target)
      c.update()
      anim.current = { from: { pos: INTRO.pos.clone(), target: INTRO.target.clone() }, to: h, t0: performance.now() + 300, dur: 7200, lift: 3, intro: true }
    }
    const stop = () => {
      if (anim.current?.intro) ui.set({ cameraIdle: true })
      anim.current = null
    }
    c.addEventListener('start', stop)

    let nonce = ui.get().fly.nonce
    const unsub = ui.subscribe(() => {
      const f = ui.get().fly
      if (f.nonce === nonce || !controls.current) return
      nonce = f.nonce
      const from = { pos: camera.position.clone(), target: controls.current.target.clone() }
      let to = homeRef.current
      const i = MESAS.findIndex(m => `g:${m.id}` === f.id)
      if (i >= 0) {
        const m = MESAS[i]
        const H = mesaHeights[i]
        const target = new THREE.Vector3(m.cx + (window.innerWidth >= 900 ? 3 : 0), MESA_BASE + H * 0.5, m.cz)
        to = { target, pos: target.clone().add(new THREE.Vector3(m.cx * 0.25, 9 + H * 0.5, 16)) }
      }
      const instant = reducedMotion()
      anim.current = { from, to, t0: performance.now(), dur: instant ? 1 : 1900, lift: i >= 0 ? 2.5 : 1.5 }
    })
    return () => {
      c.removeEventListener('start', stop)
      unsub()
    }
  }, [camera])

  const lo = useMemo(() => new THREE.Vector3(BOUNDS.minX, BOUNDS.minY, BOUNDS.minZ), [])
  const hi = useMemo(() => new THREE.Vector3(BOUNDS.maxX, BOUNDS.maxY, BOUNDS.maxZ), [])

  useFrame(() => {
    const c = controls.current
    if (!c) return
    const a = anim.current
    if (a) {
      const k = Math.min(1, Math.max(0, (performance.now() - a.t0) / a.dur))
      const e = ease(k)
      camera.position.lerpVectors(a.from.pos, a.to.pos, e)
      camera.position.y += Math.sin(Math.PI * e) * a.lift
      c.target.lerpVectors(a.from.target, a.to.target, e)
      if (k >= 1) {
        anim.current = null
        if (a.intro) ui.set({ cameraIdle: true })
      }
    }
    c.target.clamp(lo, hi)
    c.update()
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.5}
      zoomSpeed={0.7}
      panSpeed={0.6}
      screenSpacePanning={false}
      minDistance={6}
      maxDistance={wide ? 56 : 80}
      minPolarAngle={0.25}
      maxPolarAngle={1.32}
    />
  )
}
