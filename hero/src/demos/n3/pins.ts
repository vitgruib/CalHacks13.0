// The few words on screen: three agent names, two grant names, the lab's
// arch, and short outcome words that fade in beside a cup only while a marble
// is there. Run.tsx writes text and opacity; the projector pins them to 3D.

import { Vector3 } from 'three'
import { R01, R21 } from '../../feed'
import { CUP, COLLECT_X, GRANT_AT, LABEL_AT, BOOK_NOTCH, PR_NOTCH, notchOf, v } from './layout'

export interface Pin {
  at: Vector3
  text: string
  op: number // what Run wants
  shown: number // what is on screen (eased toward op)
  kind: 'name' | 'word' | 'lab'
  align: 'center' | 'left'
}

const name = (at: Vector3, text: string, kind: Pin['kind'] = 'name'): Pin => ({ at, text, op: 1, shown: 1, kind, align: 'center' })
const word = (at: Vector3, align: Pin['align'] = 'left'): Pin => ({ at, text: '', op: 0, shown: 0, kind: 'word', align })

export const pins: Record<string, Pin> = {
  purchasing: name(LABEL_AT.purchasing, 'Purchasing agent'),
  bookkeeping: name(LABEL_AT.bookkeeping, 'Bookkeeping agent'),
  payment_report: name(LABEL_AT.payment_report, 'Payment & report agent'),
  [`g:${R01}`]: name(GRANT_AT[R01].clone().add(v(0, 0, 1.08)), 'Mitochondria grant'),
  [`g:${R21}`]: name(GRANT_AT[R21].clone().add(v(0, 0, 1.08)), 'Antibiotic grant'),
  lab: name(LABEL_AT.lab, 'From the lab', 'lab'),
  'w:accept': word(v(COLLECT_X + 0.42, 0.25, CUP.accept.z)),
  'w:refine': word(v(COLLECT_X + 0.42, 0.25, CUP.refine.z)),
  'w:reject': word(v(COLLECT_X + 0.42, 0.25, CUP.reject.z)),
  'w:hold': word(v(COLLECT_X + 0.42, 0.25, CUP.hold.z)),
  [`w:n:${R01}`]: word(notchOf(R01).add(v(0.0, 0.5, 0.0)), 'center'),
  [`w:n:${R21}`]: word(notchOf(R21).add(v(0.0, 0.5, 0.0)), 'center'),
  'w:book': word(BOOK_NOTCH.clone().add(v(0.45, 0, 0))),
  'w:pr': word(PR_NOTCH.clone().add(v(0.45, 0, 0))),
}

export const PIN_KEYS = Object.keys(pins)
