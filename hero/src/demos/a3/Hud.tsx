// The sidebar: brand and headline, four tabs (Overview, Requests,
// Decisions, Activity), the detail of whatever is selected, and the story
// controls at the foot. On a phone it is a bottom sheet whose peek shows one
// line. Nothing here sits over the stage, and nothing here re-renders the Canvas.

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'
import { APP_URL } from '../../chrome'
import { feed } from '../../feed'
import { IconChevron, IconPause, IconPlay, IconReplay, Mark } from './icons'
import { Activity, Decisions, Detail, Overview, Requests } from './Panels'
import { act, openTab, selectNode, ui, useFeed, useUi, type Tab } from './ui'
import { BEATS, STORY_MS, agentNow, fmtDay, outcomeText, shortItem } from './words'

const NARROW = '(max-width: 759px)'
const narrowNow = () => typeof matchMedia !== 'undefined' && matchMedia(NARROW).matches
function useNarrow() {
  return useSyncExternalStore(
    fn => {
      const m = matchMedia(NARROW)
      m.addEventListener('change', fn)
      return () => m.removeEventListener('change', fn)
    },
    narrowNow,
  )
}

const TABS: [Tab, string][] = [
  ['overview', 'Overview'],
  ['requests', 'Requests'],
  ['decisions', 'Decisions'],
  ['activity', 'Activity'],
]

function Header() {
  return (
    <header className="a-head">
      <div className="a-brand-row">
        <p className="a-brand">
          <Mark />
          <span>GrantGuard</span>
        </p>
        <button type="button" className="a-btn a-btn--primary a-btn--sm" onClick={() => ui.set({ tab: 'requests', selected: null, composing: true, sheet: true })}>
          Send a request
        </button>
      </div>
      <h1 id="a-headline">An AI grant office that keeps a lab’s spending inside its grants’ rules.</h1>
      <p className="a-lede">A simulated lab running a scripted story. Three AI agents check every request against the real spending rules; you, the grant manager, decide the exceptions.</p>
      <a className="a-applink" href={APP_URL}>Open the GrantGuard app</a>
    </header>
  )
}

function Tabs() {
  const tab = useUi(s => s.tab)
  const open = useFeed(w => w.holds.reduce((k, h) => k + (h.open ? 1 : 0), 0))
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: ReactKeyboardEvent) => {
    const i = TABS.findIndex(([t]) => t === tab)
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (i + step + TABS.length) % TABS.length
    openTab(TABS[j][0])
    refs.current[j]?.focus()
  }
  return (
    <div className="a-tabs" role="tablist" aria-label="Dashboard" onKeyDown={onKey}>
      {TABS.map(([t, label], i) => (
        <button
          key={t}
          ref={el => {
            refs.current[i] = el
          }}
          type="button"
          role="tab"
          id={`a-tab-${t}`}
          aria-selected={tab === t}
          aria-controls="a-body"
          tabIndex={tab === t ? 0 : -1}
          onClick={() => openTab(t)}
        >
          {label}
          {t === 'decisions' && (
            <span className={`a-badge a-num${open ? ' is-live' : ''}`}>
              {open}
              <span className="a-sr"> waiting</span>
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

function Body() {
  const tab = useUi(s => s.tab)
  const selected = useUi(s => s.selected)
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    body.current?.scrollTo({ top: 0 })
  }, [tab, selected])
  return (
    <div ref={body} className="a-body" id="a-body" role="tabpanel" aria-labelledby={`a-tab-${tab}`}>
      {selected ? (
        <Detail key={selected} id={selected} />
      ) : tab === 'overview' ? (
        <Overview />
      ) : tab === 'requests' ? (
        <Requests />
      ) : tab === 'decisions' ? (
        <Decisions />
      ) : (
        <Activity />
      )}
    </div>
  )
}

function Progress() {
  const fill = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      if (fill.current) fill.current.style.transform = `scaleX(${feed.storyProgress()})`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div className="a-progress" aria-hidden="true">
      <span ref={fill} className="a-progress-fill" />
      {BEATS.slice(1).map(b => (
        <span key={b.at} className="a-progress-tick" style={{ left: `${(b.at / STORY_MS) * 100}%` }} />
      ))}
    </div>
  )
}

/** Restart the story and run it forward to `ms`, the same way ?at does. */
function jump(ms: number) {
  ui.set({ mine: [], openRequest: null, selected: null, hovered: null, hoverSrc: null, composing: false })
  act(() => {
    feed.restart()
    if (ms) feed.advance(ms)
  })
}

function Story() {
  const playing = useFeed(w => w.playing)
  const speed = useFeed(w => w.speed)
  const today = useFeed(w => w.today)
  const beat = useFeed(w => w.beat)
  const [open, setOpen] = useState(false)
  const toggle = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLOListElement>(null)
  const idx = Math.max(0, BEATS.findIndex(b => b.title === beat?.title))
  useEffect(() => {
    if (!open) return
    list.current?.querySelector<HTMLElement>('[aria-current]')?.scrollIntoView({ block: 'nearest' })
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      setOpen(false)
      toggle.current?.focus()
    }
    addEventListener('keydown', key, true)
    return () => removeEventListener('keydown', key, true)
  }, [open])
  return (
    <footer className="a-story" aria-label="Story controls">
      {open && (
        <ol ref={list} id="a-scenes" className="a-scenes" aria-label="Jump to a scene">
          {BEATS.map((b, i) => (
            <li key={b.at}>
              <button type="button" aria-current={i === idx ? 'step' : undefined} className={i < idx ? 'is-past' : undefined} onClick={() => jump(i === 0 ? 0 : b.at)}>
                <span className="a-scene-n a-num">{i + 1}</span>
                <span>{b.title}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <Progress />
      <button ref={toggle} type="button" className="a-scene-toggle" aria-expanded={open} aria-controls="a-scenes" onClick={() => setOpen(o => !o)}>
        <span className="a-scene-n a-num">{idx + 1}</span>
        <span className="a-scene-title">
          <span className="a-sr">Scene {idx + 1} of {BEATS.length}: </span>
          {BEATS[idx].title}
        </span>
        <span className="a-scene-all">All scenes</span>
        <IconChevron />
      </button>
      <div className="a-story-row" role="toolbar" aria-label="Playback">
        <button type="button" className="a-iconbtn" aria-label={playing ? 'Pause the story' : 'Play the story'} onClick={() => act(() => (playing ? feed.pause() : feed.play()))}>
          {playing ? <IconPause /> : <IconPlay />}
        </button>
        <button type="button" className="a-iconbtn" aria-label="Replay the story from the start" onClick={() => jump(0)}>
          <IconReplay />
        </button>
        <p className="a-date">
          <time dateTime={today}>{fmtDay(today)}</time>
          <span className="a-date-note"> · simulated</span>
        </p>
        <div className="a-seg" role="group" aria-label="Speed">
          {[1, 2, 4].map(n => (
            <button key={n} type="button" aria-pressed={speed === n} aria-label={`${n} times speed`} onClick={() => act(() => feed.setSpeed(n))}>
              {n}x
            </button>
          ))}
        </div>
      </div>
    </footer>
  )
}

/** Phone: the collapsed sheet's one line, most important first. */
function Peek() {
  const w = useFeed(x => x)
  const sheet = useUi(s => s.sheet)
  const selected = useUi(s => s.selected)
  const mine = useUi(s => s.mine)
  const open = w.holds.filter(h => h.open)
  let line = w.beat?.title ?? 'GrantGuard'
  const sel = selected ? w.nodes.find(n => n.id === selected) : undefined
  const r = mine[0] ? (w.requests.find(q => q.revisionOf === mine[0]) ?? w.requests.find(q => q.id === mine[0])) : undefined
  if (sheet) line = 'GrantGuard' // open, the sheet itself shows everything else
  else if (sel) line = sel.kind === 'agent' || sel.id === 'p:grant_manager' ? `${sel.label}: ${agentNow(w, sel.id).word.toLowerCase()}` : sel.label
  else if (open.length) line = `Waiting on you: ${open[0].title}`
  else if (r && (!r.outcome || w.packets.some(p => p.refId === r.id))) line = `Your ${shortItem(r.item).toLowerCase()}: ${outcomeText(r, w).toLowerCase()}`
  return (
    <button type="button" className="a-peek" aria-expanded={sheet} aria-controls="a-side-inner" onClick={() => ui.set({ sheet: !sheet })}>
      <span className="a-handle" aria-hidden="true" />
      <span className="a-peek-row">
        <Mark size={20} />
        <span className={`a-peek-line${sheet ? ' is-brand' : ''}`}>{line}</span>
        {open.length > 0 && <span className="a-badge a-num is-live">{open.length}</span>}
        <span className="a-sr">{sheet ? 'Close the dashboard' : 'Open the dashboard'}</span>
        <IconChevron />
      </span>
    </button>
  )
}

/** Keeps a few root attributes in sync, and Escape closes the topmost thing. */
function RootSync({ root, narrow }: { root: RefObject<HTMLDivElement | null>; narrow: boolean }) {
  const hovered = useUi(s => s.hovered)
  const sheet = useUi(s => s.sheet)
  useEffect(() => {
    root.current?.toggleAttribute('data-hover', !!hovered)
  }, [hovered, root])
  useEffect(() => {
    root.current?.toggleAttribute('data-sheet', narrow && sheet)
  }, [narrow, sheet, root])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const s = ui.get()
      if (s.selected) selectNode(null)
      else if (s.composing) ui.set({ composing: false, composeFor: null })
      else if (narrowNow() && s.sheet) ui.set({ sheet: false })
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
  // Drop sidebar-local state when the story restarts.
  const restartKey = useFeed(w => w.log.length === 0 && w.requests.length === 0)
  const was = useRef(restartKey)
  useEffect(() => {
    if (restartKey && !was.current) ui.set({ mine: [], openRequest: null })
    was.current = restartKey
  }, [restartKey])
  return null
}

export function Hud({ root }: { root: RefObject<HTMLDivElement | null> }) {
  const narrow = useNarrow()
  const sheet = useUi(s => s.sheet)
  const shut = narrow && !sheet
  return (
    <aside className="a-side" data-float={narrow ? 'sheet' : 'sidebar'} data-open={narrow && sheet ? '' : undefined} aria-label="GrantGuard dashboard">
      {narrow && <Peek />}
      <div className="a-side-inner" id="a-side-inner" inert={shut}>
        <Header />
        <Tabs />
        <Body />
        <Story />
      </div>
      <RootSync root={root} narrow={narrow} />
    </aside>
  )
}
