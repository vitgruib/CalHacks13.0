// Paper forms for packets in flight, drawn once onto canvases. A request is a
// ruled slip; a verdict is the same slip already carrying its stamp form
// (box, arrow, strike, seal); money is an amber note; readings are punched
// cards; papers, invoices and payment requests have their own shapes.

import * as THREE from 'three'
import type { Packet } from '../../feed'

const W = 160
const H = 112
const PAPER = '#eef4f8'
const RULE = '#7d9fc4'
const RED = '#d8412f'
const AMBER = '#f4bb52'
const CHALK = '#eef4f8'

type Draw = (c: CanvasRenderingContext2D) => void

function slip(c: CanvasRenderingContext2D, x = 14, y = 16, w = W - 28, h = H - 32) {
  c.fillStyle = PAPER
  c.beginPath()
  c.moveTo(x, y)
  c.lineTo(x + w - 16, y)
  c.lineTo(x + w, y + 16)
  c.lineTo(x + w, y + h)
  c.lineTo(x, y + h)
  c.closePath()
  c.fill()
  c.strokeStyle = RULE
  c.lineWidth = 3
  for (let i = 0; i < 4; i++) {
    c.beginPath()
    c.moveTo(x + 12, y + 20 + i * 15)
    c.lineTo(x + w - (i === 3 ? 50 : 22), y + 20 + i * 15)
    c.stroke()
  }
}

function stampBox(c: CanvasRenderingContext2D) {
  c.strokeStyle = RED
  c.lineWidth = 6
  c.strokeRect(40, 30, 82, 50)
  c.lineWidth = 2.5
  c.strokeRect(48, 38, 66, 34)
  c.fillStyle = RED
  c.fillRect(56, 50, 50, 10)
}

function stampArrow(c: CanvasRenderingContext2D) {
  c.strokeStyle = RED
  c.lineWidth = 6
  c.beginPath()
  c.moveTo(34, 34)
  c.lineTo(104, 34)
  c.lineTo(130, 56)
  c.lineTo(104, 78)
  c.lineTo(34, 78)
  c.closePath()
  c.stroke()
  c.fillStyle = RED
  c.fillRect(46, 51, 52, 10)
}

function stampStrike(c: CanvasRenderingContext2D) {
  c.strokeStyle = RED
  c.lineWidth = 9
  c.lineCap = 'round'
  c.beginPath()
  c.moveTo(22, 22)
  c.lineTo(138, 92)
  c.moveTo(138, 22)
  c.lineTo(22, 92)
  c.stroke()
}

function stampSeal(c: CanvasRenderingContext2D) {
  c.strokeStyle = RED
  c.lineWidth = 6
  c.beginPath()
  c.arc(82, 56, 32, 0, Math.PI * 2)
  c.stroke()
  c.lineWidth = 2.5
  c.beginPath()
  c.arc(82, 56, 22, 0, Math.PI * 2)
  c.stroke()
  c.fillStyle = RED
  c.fillRect(68, 51, 28, 10)
}

function card(c: CanvasRenderingContext2D) {
  c.strokeStyle = CHALK
  c.lineWidth = 5
  c.strokeRect(26, 24, 108, 64)
  c.fillStyle = CHALK
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2 === 0) c.fillRect(38 + i * 15, 40 + j * 18, 7, 11)
}

function note(c: CanvasRenderingContext2D) {
  c.fillStyle = AMBER
  c.fillRect(18, 26, 124, 62)
  c.strokeStyle = '#0d3463'
  c.lineWidth = 3
  c.strokeRect(26, 33, 108, 48)
  c.beginPath()
  c.ellipse(80, 57, 16, 18, 0, 0, Math.PI * 2)
  c.stroke()
}

function doc(c: CanvasRenderingContext2D, amber = false) {
  c.fillStyle = PAPER
  c.fillRect(46, 8, 68, 96)
  c.strokeStyle = RULE
  c.lineWidth = 3
  for (let i = 0; i < 6; i++) {
    c.beginPath()
    c.moveTo(54, 22 + i * 12)
    c.lineTo(i === 0 ? 92 : 106, 22 + i * 12)
    c.stroke()
  }
  if (amber) {
    c.fillStyle = AMBER
    c.fillRect(54, 88, 52, 8)
  }
}

function receipt(c: CanvasRenderingContext2D) {
  c.fillStyle = PAPER
  c.beginPath()
  c.moveTo(50, 10)
  c.lineTo(110, 10)
  c.lineTo(110, 96)
  for (let i = 0; i < 6; i++) c.lineTo(110 - i * 10 - 5, i % 2 ? 96 : 104)
  c.lineTo(50, 96)
  c.closePath()
  c.fill()
  c.strokeStyle = RULE
  c.lineWidth = 3
  for (let i = 0; i < 5; i++) {
    c.beginPath()
    c.moveTo(58, 24 + i * 13)
    c.lineTo(102, 24 + i * 13)
    c.stroke()
  }
}

function folder(c: CanvasRenderingContext2D) {
  c.strokeStyle = CHALK
  c.lineWidth = 5
  c.beginPath()
  c.moveTo(24, 34)
  c.lineTo(60, 34)
  c.lineTo(68, 24)
  c.lineTo(100, 24)
  c.lineTo(108, 34)
  c.lineTo(136, 34)
  c.lineTo(136, 92)
  c.lineTo(24, 92)
  c.closePath()
  c.stroke()
  c.fillStyle = PAPER
  c.fillRect(36, 44, 88, 38)
}

function balloon(c: CanvasRenderingContext2D) {
  c.fillStyle = PAPER
  c.beginPath()
  c.ellipse(80, 50, 54, 32, 0, 0, Math.PI * 2)
  c.fill()
  c.beginPath()
  c.moveTo(52, 74)
  c.lineTo(40, 100)
  c.lineTo(72, 80)
  c.fill()
  c.fillStyle = RULE
  c.fillRect(56, 42, 48, 6)
  c.fillRect(56, 54, 32, 6)
}

function loupe(c: CanvasRenderingContext2D) {
  c.strokeStyle = CHALK
  c.lineWidth = 7
  c.beginPath()
  c.arc(72, 50, 26, 0, Math.PI * 2)
  c.stroke()
  c.lineCap = 'round'
  c.lineWidth = 10
  c.beginPath()
  c.moveTo(92, 70)
  c.lineTo(116, 94)
  c.stroke()
}

const DRAW: Record<string, Draw> = {
  request: c => slip(c),
  pushback: c => {
    slip(c)
    c.fillStyle = '#0d3463'
    c.beginPath()
    c.arc(118, 80, 12, 0, Math.PI * 2)
    c.fill()
  },
  'verdict:accept': c => {
    slip(c)
    stampBox(c)
  },
  'verdict:refine': c => {
    slip(c)
    stampArrow(c)
  },
  'verdict:reject': c => {
    slip(c)
    stampStrike(c)
  },
  'verdict:hold': c => {
    slip(c)
    stampSeal(c)
  },
  reading: card,
  recheck: loupe,
  payment: note,
  charge: note,
  hold: folder,
  'decision:accept': c => {
    slip(c)
    stampBox(c)
  },
  'decision:reject': c => {
    slip(c)
    stampStrike(c)
  },
  paper: c => doc(c),
  invoice: receipt,
  payment_request: c => doc(c, true),
  follow_up: balloon,
}

const cache = new Map<string, THREE.CanvasTexture>()

export function slipKey(p: Packet) {
  if (p.kind === 'verdict') return `verdict:${p.outcome ?? 'accept'}`
  if (p.kind === 'decision') return `decision:${p.outcome === 'reject' ? 'reject' : 'accept'}`
  return DRAW[p.kind] ? p.kind : 'request'
}

export function slipTexture(key: string) {
  const hit = cache.get(key)
  if (hit) return hit
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const c = cv.getContext('2d')!
  ;(DRAW[key] ?? DRAW.request)(c)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  cache.set(key, t)
  return t
}

/** World size of each form. */
export function slipSize(p: Packet): [number, number] {
  if (p.kind === 'request' || p.kind === 'verdict' || p.kind === 'pushback') return [0.78, 0.55]
  if (p.kind === 'reading' || p.kind === 'recheck') return [0.48, 0.34]
  return [0.62, 0.44]
}
