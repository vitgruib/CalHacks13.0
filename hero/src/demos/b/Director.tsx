// Turns feed events into scene-local state: which rooms are lit, what the
// rule stations show, which answers are parked, what lands where.

import { useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useFlow } from '../../feed'
import { stationOf } from './layout'
import { C } from './materials'
import { ringColor } from './Capsules'
import { activity, bump, clock, effects, nextKey, parked, resetScene, run, stations, vaultHoldUntil, vaultShake } from './state'

const DONE = new Set(['bought', 'rerouted', 'blocked', 'rejected'])

export function Director() {
  useEffect(() => resetScene(), [])

  useFlow(e => {
    const now = clock()
    switch (e.type) {
      case 'reset':
        resetScene()
        break
      case 'packet': {
        const p = e.packet
        bump(p.from, 1)
        if (p.from === 'a:purchasing' && p.refId === run.refId) run.visible = false
        break
      }
      case 'arrive': {
        const p = e.packet
        bump(p.to, 1)
        effects.push({ kind: 'ring', t: now, node: p.to, color: ringColor(p), key: nextKey(), packet: p })
        if (p.kind === 'verdict' && p.refId) {
          if (p.outcome === 'hold') parked.set(p.refId, p.to)
          else {
            parked.delete(p.refId)
            effects.push({ kind: p.outcome ?? 'accept', t: now, node: p.to, color: ringColor(p), key: nextKey(), packet: p, outcome: p.outcome })
          }
        }
        if ((p.kind === 'request' || p.kind === 'pushback') && p.to === 'a:purchasing' && p.refId) {
          run.refId = p.refId
          run.visible = true
          run.target = -1
          run.outAt = 0
          for (const s of stations) s.state = 0
        }
        break
      }
      case 'rule': {
        const k = stationOf(e.verdict.rule)
        if (e.index === 0) for (const s of stations) s.state = 0
        // a split request checks some stations once per grant; a fail sticks
        if (!(stations[k].state === -1 && now - stations[k].t < 3)) stations[k].state = e.verdict.pass ? 1 : -1
        stations[k].t = now
        run.refId = e.requestId
        run.visible = true
        run.target = k
        run.outAt = e.index === e.total - 1 ? now + 0.3 : 0
        bump('a:purchasing', 1)
        break
      }
      case 'request':
        if (DONE.has(e.request.state)) parked.delete(e.request.id)
        break
      case 'grant': {
        const node = `g:${e.grant.id}`
        bump(node, 1)
        if (e.event?.kind === 'payment_received') {
          vaultHoldUntil[node] = now + 1.7
          effects.push({ kind: 'slug', t: now, node, color: C.money, key: nextKey() })
        }
        if (e.event?.kind === 'court_order') vaultShake[node] = now
        break
      }
      case 'hold':
        bump('p:grant_manager', 1)
        break
      case 'task':
        bump(`r:${e.researcherId}`, 0.3)
        break
      case 'paper':
        bump('a:payment_report', 1)
        break
      case 'invoice':
        bump('a:bookkeeping', 1)
        break
    }
  })

  useFrame((_, dt) => {
    for (const k in activity) activity[k] = Math.max(0, activity[k] - dt * 0.2)
    const now = clock()
    while (effects.length && now - effects[0].t > 12) effects.shift()
  })

  return null
}
