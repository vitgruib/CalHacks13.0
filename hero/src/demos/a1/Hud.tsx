// The sidebar dashboard: a fixed paper column on the right (a bottom sheet on
// a phone) beside the stage, never over it. Brand and headline, then what is
// waiting on you, then one open section at a time, with the story player at
// the foot. Everything here reads the feed through hooks; nothing here
// re-renders the Canvas.

import { useEffect, useRef, useSyncExternalStore, type RefObject } from 'react'
import { APP_URL } from '../../chrome'
import { feed } from '../../feed'
import type { World } from '../../feed'
import { CHAPTERS, SECTIONS, STORY_MS, Waiting, useChapter } from './Panels'
import { embed, useEmbed } from './embed'
import { IconChevron, IconPause, IconPlay, IconReplay, Mark, outcomeWord } from './icons'
import { act, jumpTo, selectNode, ui, useFeed, useUi, type Section } from './ui'
import { fmtDay, nodeName, nodeNow, requestStatus, shortItem } from './words'

const PHONE = '(max-width: 759px)'
const onPhoneChange = (fn: () => void) => {
  const m = matchMedia(PHONE)
  m.addEventListener('change', fn)
  return () => m.removeEventListener('change', fn)
}
const usePhone = () => useSyncExternalStore(onPhoneChange, () => matchMedia(PHONE).matches)

const focusEl = (sel: string) => requestAnimationFrame(() => document.querySelector<HTMLElement>(sel)?.focus())

function Head() {
  const compose = () => ui.set({ section: 'requests', composing: true })
  return (
    <header className="a-head">
      <p className="a-brand">
        <Mark />
        <span>Grant Test Auto</span>
      </p>
      <h1>An AI grant office that keeps a lab’s spending inside its grants’ rules.</h1>
      <p className="a-lede">A simulated lab running a scripted story. AI agents check every request and invoice against the real spending rules; you, the grant manager, decide the exceptions.</p>
      <a className="a-applink" href={APP_URL}>Open the Grant Test Auto app</a>
      <button type="button" className="a-btn a-btn--primary" onClick={compose}>
        Send a request
      </button>
    </header>
  )
}

function Accordion({ id, title, open, Summary, Body }: (typeof SECTIONS)[number] & { open: boolean }) {
  const bodyId = `a-sec-${id}`
  const toggle = (next: Section | null) => ui.set({ section: next, composing: next === 'requests' && ui.get().composing })
  return (
    <section className={`a-sec${open ? ' is-open' : ''}`} aria-labelledby={`${bodyId}-h`}>
      <h2 className="a-sec-h" id={`${bodyId}-h`}>
        <button type="button" aria-expanded={open} aria-controls={open ? bodyId : undefined} onClick={() => toggle(open ? null : id)}>
          <span className="a-sec-title">{title}</span>
          <span className="a-sec-sum">
            <Summary />
          </span>
          <IconChevron />
        </button>
      </h2>
      {open && (
        <div className="a-sec-body" id={bodyId}>
          <Body />
        </div>
      )}
    </section>
  )
}

function Sections() {
  const section = useUi(s => s.section)
  return (
    <div className="a-sections">
      {SECTIONS.map(s => (
        <Accordion key={s.id} {...s} open={section === s.id} />
      ))}
    </div>
  )
}

function Progress() {
  const fill = useRef<HTMLSpanElement>(null)
  const awake = useEmbed(s => s.awake)
  useEffect(() => {
    if (!awake) return
    let raf = 0
    const tick = () => {
      if (fill.current) fill.current.style.transform = `scaleX(${feed.storyProgress()})`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [awake])
  return (
    <div className="a-progress" aria-hidden="true">
      <span className="a-progress-track">
        <span ref={fill} className="a-progress-fill" />
      </span>
      {CHAPTERS.slice(1, -1).map(([ms]) => (
        <i key={ms} style={{ left: `${(ms / STORY_MS) * 100}%` }} />
      ))}
    </div>
  )
}

function Player() {
  const beat = useFeed(w => w.beat)
  const playing = useFeed(w => w.playing)
  const speed = useFeed(w => w.speed)
  const today = useFeed(w => w.today)
  const at = useChapter()
  const live = at === CHAPTERS.length - 1
  return (
    <div className="a-player">
      <div className="a-beat" aria-live="polite">
        {beat && (
          <div key={beat.id} className="a-beat-in">
            <div className="a-beat-top">
              <h2 className="a-beat-title">{beat.title}</h2>
              {at >= 0 && !live && (
                <span className="a-muted a-num">
                  {at + 1} of {CHAPTERS.length}
                </span>
              )}
            </div>
            <p className="a-beat-cap">{beat.caption}</p>
          </div>
        )}
      </div>
      <Progress />
      <div className="a-ctl" role="group" aria-label="Story playback">
        <button
          type="button"
          className="a-iconbtn a-iconbtn--play"
          aria-label={playing ? 'Pause the story' : 'Play the story'}
          onClick={() => act(() => (playing ? feed.pause() : feed.play()))}
        >
          {playing ? <IconPause /> : <IconPlay />}
        </button>
        <p className="a-date">
          <time dateTime={today}>{fmtDay(today)}</time>
          <span className="a-date-note">simulated</span>
        </p>
        <div className="a-seg" role="group" aria-label="Speed">
          {[1, 2, 4].map(n => (
            <button key={n} type="button" aria-pressed={speed === n} aria-label={`${n} times speed`} onClick={() => act(() => feed.setSpeed(n))}>
              {n}x
            </button>
          ))}
        </div>
        <button type="button" className="a-iconbtn" aria-label="Replay the story from the start" onClick={() => jumpTo(0)}>
          <IconReplay />
        </button>
      </div>
    </div>
  )
}

/** Where the viewer's own request is now, in a few words. */
const mineLine = (r: World['requests'][number], w: World) => {
  const how = requestStatus(r, w.packets)
  return `Your ${shortItem(r.item).toLowerCase()}: ${r.outcome ? outcomeWord(r).toLowerCase() : how}${r.outcome && how ? `, ${how}` : ''}`
}
const findMine = (id: string, w: World) => w.requests.find(q => q.revisionOf === id) ?? w.requests.find(q => q.id === id)

/** The phone peek's one line: what most needs the viewer, else what is selected, else the story. */
function usePeekLine(): { tone: string; text: string } {
  const w = useFeed(x => x)
  const selected = useUi(s => s.selected)
  const mine = useUi(s => s.mine[0])
  const n = w.holds.reduce((k, h) => k + (h.open ? 1 : 0), 0)
  if (n) return { tone: 'hold', text: `${n} decision${n === 1 ? '' : 's'} waiting on you` }
  if (selected) {
    const r = w.requests.find(q => q.id === selected)
    if (r) return { tone: r.outcome ?? 'pending', text: `${shortItem(r.item)}: ${outcomeWord(r).toLowerCase()}` }
    return { tone: nodeNow(selected, w).state, text: `${nodeName(selected, w)}: ${nodeNow(selected, w).line}` }
  }
  if (mine) {
    const r = findMine(mine, w)
    if (r) return { tone: r.outcome ?? 'pending', text: mineLine(r, w) }
  }
  return { tone: 'story', text: w.beat?.title ?? 'Grant Test Auto' }
}

function Peek({ open }: { open: boolean }) {
  const line = usePeekLine()
  return (
    <button type="button" className="a-peek" aria-expanded={open} aria-controls="a-side-body" onClick={() => ui.set({ sheet: !open })}>
      <span className="a-peek-handle" aria-hidden="true" />
      <span className="a-peek-row">
        <span className={`a-peek-dot a-peek-dot--${line.tone}`} aria-hidden="true" />
        <span className="a-peek-text">{line.text}</span>
        <span className="a-sr">{open ? ', close the dashboard' : ', open the dashboard'}</span>
        <IconChevron />
      </span>
    </button>
  )
}

/** Keeps a few root attributes in sync without re-rendering the scene, and handles Escape. */
function RootSync({ root, phone }: { root: RefObject<HTMLDivElement | null>; phone: boolean }) {
  const hovered = useUi(s => s.hovered)
  const sheet = useUi(s => s.sheet)
  useEffect(() => {
    root.current?.toggleAttribute('data-hover', !!hovered)
  }, [hovered, root])
  useEffect(() => {
    root.current?.toggleAttribute('data-sheet', phone && sheet)
    if (!phone && sheet) ui.set({ sheet: false })
  }, [phone, sheet, root])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const s = ui.get()
      if (s.composing) {
        ui.set({ composing: false, composeFor: null })
        focusEl('.demo-a1 .a-compose-toggle')
      } else if (s.sheet && matchMedia(PHONE).matches) {
        ui.set({ sheet: false })
        focusEl('.demo-a1 .a-peek')
      } else if (s.selected || s.openRequest) {
        const row = document.activeElement?.closest('.a-row, .a-req')
        const main = row?.querySelector<HTMLElement>('.a-row-main, .a-req-main')
        selectNode(null)
        ui.set({ openRequest: null })
        if (main) requestAnimationFrame(() => main.focus())
      }
    }
    // Inside another page, only while focus is in the demo: the page's own keys stay the page's.
    const target: HTMLElement | Window | null = embed.get().on ? root.current : window
    target?.addEventListener('keydown', onKey as EventListener)
    return () => target?.removeEventListener('keydown', onKey as EventListener)
  }, [root])
  // Drop the viewer's own requests when the story restarts.
  const restartKey = useFeed(w => w.log.length === 0 && w.requests.length === 0)
  const was = useRef(restartKey)
  useEffect(() => {
    if (restartKey && !was.current) ui.set({ mine: [], openRequest: null })
    was.current = restartKey
  }, [restartKey])
  return null
}

export function Hud({ root }: { root: RefObject<HTMLDivElement | null> }) {
  const phone = usePhone()
  const sheet = useUi(s => s.sheet)
  const open = !phone || sheet
  return (
    <aside className="a-side" data-float={phone ? 'sheet' : 'sidebar'} data-open={open ? '' : undefined} aria-label="Grant Test Auto dashboard">
      {phone && <Peek open={sheet} />}
      <div className="a-side-body" id="a-side-body" inert={!open}>
        <div className="a-scroll">
          <Head />
          <Waiting />
          <Sections />
        </div>
        <Player />
      </div>
      <RootSync root={root} phone={phone} />
    </aside>
  )
}

/**
 * Inside another page (embed.ts) the dashboard steps aside and the scene takes
 * the whole box: the name, the problem and what the agents do about it sit in
 * the sky over it, and the two ways in are named over their plinths
 * (zones.tsx ZoneLabels; Scene.tsx fits the scene under all of it). The way in is the scene itself;
 * the prompt's two phrases are the same two ways in for keys, screen readers
 * and anyone who would rather not aim, and they light their side of the scene.
 */
export function EmbedHud({ root }: { root: RefObject<HTMLDivElement | null> }) {
  return (
    <div className="a-embed-copy" data-float="embed-copy">
      <header className="a-embed-head">
        <h1>Grant Test Auto</h1>
        <p className="a-embed-sub">Researchers spend 44% of their federally funded research time on administration.</p>
        <p className="a-embed-sol">AI agents do the grant office’s checking: status, balance, rules and invoices. Researchers do science, and the grant manager decides only the exceptions.</p>
      </header>
      <RootSync root={root} phone={false} />
    </div>
  )
}
