// The DOM layer over the scene, kept quiet: at rest it is the headline, one
// button, a caption and a small cluster of controls. Everything else (the
// ledger, the scene index, speed) sits behind one menu, and the grant
// manager's pill appears only while a decision is waiting. Everything here
// reads the feed through hooks; nothing here re-renders the Canvas.

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { feed } from '../../feed'
import { IconMore, IconPause, IconPlay, IconReplay, Mark, outcomeWord } from './icons'
import { PanelHost } from './Panels'
import { fmtDay } from './bits'
import { act, openPanel, selectNode, ui, useFeed, useUi } from './store'

function HeroCopy() {
  return (
    <section className="a-hero" aria-labelledby="a-headline">
      <h1 id="a-headline">An AI grant office that keeps a lab’s spending inside its grants’ rules.</h1>
      <p>Three AI agents check every request against the spending rules. The grant manager decides the exceptions.</p>
      <button type="button" className="a-btn a-btn--primary" onClick={() => openPanel('request')}>
        Send a request
      </button>
    </section>
  )
}

function Replay({ className, onDone }: { className?: string; onDone?: () => void }) {
  return (
    <button
      type="button"
      className={className ?? 'a-iconbtn'}
      aria-label="Replay the story from the start"
      onClick={() => {
        ui.reset()
        feed.restart()
        onDone?.()
      }}
    >
      <IconReplay />
      {className && <span>Replay from the start</span>}
    </button>
  )
}

/** Speed, the ledger and the scene index: one menu, out of the way. */
function More() {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const speed = useFeed(w => w.speed)
  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLElement>('button')?.focus()
    const down = (e: PointerEvent) => {
      const t = e.target as Node
      if (!menu.current?.contains(t) && !btn.current?.contains(t)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
      btn.current?.focus()
    }
    addEventListener('pointerdown', down)
    addEventListener('keydown', key, true)
    return () => {
      removeEventListener('pointerdown', down)
      removeEventListener('keydown', key, true)
    }
  }, [open])
  const go = (p: 'ledger' | 'index') => {
    setOpen(false)
    openPanel(ui.get().panel === p ? null : p)
  }
  return (
    <div className="a-more">
      <button ref={btn} type="button" className="a-iconbtn" aria-label="More" aria-expanded={open} aria-controls="a-menu" onClick={() => setOpen(o => !o)}>
        <IconMore />
      </button>
      {open && (
        <div ref={menu} id="a-menu" className="a-menu" role="group" aria-label="More">
          <div className="a-menu-row">
            <span id="a-speed">Speed</span>
            <div className="a-seg" role="group" aria-labelledby="a-speed">
              {[1, 2, 4].map(n => (
                <button key={n} type="button" aria-pressed={speed === n} onClick={() => act(() => feed.setSpeed(n))}>
                  {n}x
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="a-menu-item" onClick={() => go('ledger')}>
            Ledger
          </button>
          <button type="button" className="a-menu-item" onClick={() => go('index')}>
            Everything in the scene
          </button>
          <Replay className="a-menu-item a-narrow-only" onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}

function Controls() {
  const playing = useFeed(w => w.playing)
  const today = useFeed(w => w.today)
  return (
    <div className="a-ctl" role="toolbar" aria-label="Story playback">
      <p className="a-date">
        <time dateTime={today}>{fmtDay(today)}</time>
        <span className="a-date-note"> · demo data</span>
      </p>
      <button type="button" className="a-iconbtn" aria-label={playing ? 'Pause the story' : 'Play the story'} onClick={() => act(() => (playing ? feed.pause() : feed.play()))}>
        {playing ? <IconPause /> : <IconPlay />}
      </button>
      <Replay />
      <More />
    </div>
  )
}

/** Appears only while the grant manager has something to decide. */
function Waiting() {
  const n = useFeed(w => w.holds.reduce((k, h) => k + (h.open ? 1 : 0), 0))
  const panel = useUi(s => s.panel)
  return (
    <div className="a-waiting" aria-live="polite">
      {n > 0 && (
        <button type="button" className="a-pill" aria-pressed={panel === 'inbox'} onClick={() => openPanel(panel === 'inbox' ? null : 'inbox')}>
          <span className="a-pill-dot" aria-hidden="true" />
          {n} decision{n === 1 ? '' : 's'} waiting
        </button>
      )}
    </div>
  )
}

function Tracker() {
  const mine = useUi(s => s.mine)
  const requests = useFeed(w => w.requests)
  const packets = useFeed(w => w.packets)
  const id = mine[0]
  if (!id) return null
  const r = requests.find(q => q.revisionOf === id) ?? requests.find(q => q.id === id)
  if (!r) return null
  const traveling = packets.some(p => p.refId === r.id && (p.kind === 'request' || p.kind === 'verdict'))
  const status = !r.outcome ? (r.verdicts.length ? 'checking the spending rules' : 'on its way') : traveling ? `${outcomeWord(r).toLowerCase()}, on its way back` : outcomeWord(r).toLowerCase()
  return (
    <button type="button" className="a-tracker" onClick={() => ui.set({ selected: `r:${r.researcherId}`, panel: 'detail', openRequest: r.id })}>
      <span className={`a-tracker-dot a-tracker-dot--${r.outcome ?? 'pending'}`} aria-hidden="true" />
      Your {r.item.split(',')[0].toLowerCase()}: {status}
    </button>
  )
}

/**
 * Two lines at most, measured: the whole caption when it fits, otherwise its
 * longest sentence that does. The full caption stays in the screen-reader copy.
 */
function useFit(el: RefObject<HTMLParagraphElement | null>, text: string | undefined) {
  useLayoutEffect(() => {
    const p = el.current
    if (!p || !text) return
    const parts = text.match(/[^.!?]+[.!?]+(\s|$)/g)?.map(s => s.trim()) ?? []
    const tries = [text, ...parts.sort((a, b) => b.length - a.length)]
    const fit = () => {
      for (const t of tries) {
        p.textContent = t
        if (p.scrollHeight <= p.clientHeight + 1) return
      }
      p.textContent = text
    }
    fit()
    document.fonts?.ready.then(fit)
    addEventListener('resize', fit)
    return () => removeEventListener('resize', fit)
  }, [el, text])
}

function Progress() {
  const fill = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const k = feed.storyProgress()
      if (fill.current) fill.current.style.transform = `scaleX(${k})`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div className="a-progress" aria-hidden="true">
      <span ref={fill} />
    </div>
  )
}

function Caption() {
  const beat = useFeed(w => w.beat)
  const today = useFeed(w => w.today)
  const body = useRef<HTMLParagraphElement>(null)
  useFit(body, beat?.caption)
  return (
    <section className="a-caption" aria-label="What is happening">
      <p className="a-date">
        <time dateTime={today}>{fmtDay(today)}</time>
        <span className="a-date-note"> · demo data</span>
      </p>
      <Tracker />
      <div aria-live="polite">
        {beat && (
          <div key={beat.id} className="a-caption-body">
            <h2>{beat.title}</h2>
            <p ref={body} aria-hidden="true" />
            <p className="a-sr">{beat.caption}</p>
          </div>
        )}
      </div>
      <Progress />
    </section>
  )
}

/** Keeps the pointer and a few root attributes in sync without re-rendering the scene. */
function RootSync({ root }: { root: RefObject<HTMLDivElement | null> }) {
  const hovered = useUi(s => s.hovered)
  const panel = useUi(s => s.panel)
  useEffect(() => {
    root.current?.toggleAttribute('data-hover', !!hovered)
  }, [hovered, root])
  useEffect(() => {
    root.current?.toggleAttribute('data-panel', !!panel)
  }, [panel, root])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (ui.get().panel || ui.get().selected)) selectNode(null)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
  // Drop scene-local UI state when the story restarts.
  const restartKey = useFeed(w => w.log.length === 0 && w.requests.length === 0)
  const was = useRef(restartKey)
  useEffect(() => {
    if (restartKey && !was.current) ui.set({ mine: [], openRequest: null })
    was.current = restartKey
  }, [restartKey])
  return null
}

export function Hud({ root }: { root: RefObject<HTMLDivElement | null> }) {
  return (
    <div className="a-hud">
      <div className="a-top">
        <header className="a-brand">
          <Mark />
          <span>Grant Test Auto</span>
        </header>
        <HeroCopy />
      </div>
      <div className="a-tr">
        <Waiting />
        <Controls />
      </div>
      <Caption />
      <PanelHost />
      <RootSync root={root} />
    </div>
  )
}
