// The sidebar dashboard: a warm column on the left (a bottom sheet on a
// phone) with the brand and headline, a "Waiting on you" banner while a
// decision is open, three tabs, and the story controls at the foot. It is
// the one place for words; nothing of it sits over the scene.

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import { APP_URL } from '../../chrome'
import { feed } from '../../feed'
import { BEATS, beatIndex, jumpTo } from './beats'
import { IconChapters, IconChevron, IconPause, IconPlay, IconPlus, IconReplay, Mark } from './icons'
import { fmtDay, nodeLine, nodeName, shortItem } from './now'
import { Activity, Overview, Requests, Waiting } from './Panels'
import { act, selectNode, ui, useFeed, useUi, type Tab } from './ui'

const PHONE = '(max-width: 759px)'
const mq = (q: string) => (typeof matchMedia === 'undefined' ? null : matchMedia(q))
function useMedia(q: string) {
  return useSyncExternalStore(
    fn => {
      const m = mq(q)
      m?.addEventListener('change', fn)
      return () => m?.removeEventListener('change', fn)
    },
    () => !!mq(q)?.matches,
  )
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'requests', label: 'Requests' },
  { id: 'activity', label: 'Activity' },
]

function Tabs() {
  const tab = useUi(s => s.tab)
  const list = useRef<HTMLDivElement>(null)
  // A new tab starts at its top, with the tabs still stuck in place.
  useEffect(() => {
    const el = list.current
    const box = el?.closest('.a-scroll')
    if (el && box && box.scrollTop > el.offsetTop) box.scrollTop = el.offsetTop
  }, [tab])
  const go = (t: Tab, focus = false) => {
    ui.set({ tab: t })
    if (focus) list.current?.querySelector<HTMLElement>(`#a2-tab-${t}`)?.focus()
  }
  return (
    <div
      ref={list}
      className="a-tabs"
      role="tablist"
      aria-label="Dashboard"
      onKeyDown={e => {
        const i = TABS.findIndex(t => t.id === tab)
        const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : null
        if (n === null) return
        e.preventDefault()
        go(TABS[(n + TABS.length) % TABS.length].id, true)
      }}
    >
      {TABS.map(t => (
        <button
          key={t.id}
          id={`a2-tab-${t.id}`}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          aria-controls="a2-pane"
          tabIndex={tab === t.id ? 0 : -1}
          onClick={() => go(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

function Pane() {
  const tab = useUi(s => s.tab)
  return (
    <div id="a2-pane" className="a-pane" role="tabpanel" aria-labelledby={`a2-tab-${tab}`} tabIndex={-1}>
      {tab === 'overview' && <Overview />}
      {tab === 'requests' && <Requests />}
      {tab === 'activity' && <Activity />}
    </div>
  )
}

function Head() {
  return (
    <header className="a-head">
      <div className="a-brandrow">
        <p className="a-brand">
          <Mark />
          <span>GrantGuard</span>
        </p>
        <button type="button" className="a-btn a-btn--primary a-btn--small" onClick={() => ui.set({ tab: 'requests', composing: true, composeFor: null })}>
          <IconPlus size={14} />
          Send a request
        </button>
      </div>
      <h1>An AI grant office that keeps a lab’s spending inside its grants’ rules.</h1>
      <p className="a-head-note">A simulated lab running a scripted story. The spending rules are the real ones.</p>
      <a className="a-applink" href={APP_URL}>Open the GrantGuard app</a>
    </header>
  )
}

// ── Story controls ───────────────────────────────────────────────────────

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

function Chapters({ close, anchor }: { close: () => void; anchor: RefObject<HTMLButtonElement | null> }) {
  const beat = useFeed(w => w.beat?.title)
  const cur = beatIndex(beat)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('[aria-current="step"]') ?? box.current?.querySelector<HTMLElement>('button')
    el?.focus({ preventScroll: true })
    el?.scrollIntoView({ block: 'nearest' })
    const down = (e: PointerEvent) => {
      const t = e.target as Node
      if (!box.current?.contains(t) && !anchor.current?.contains(t)) close()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      close()
      anchor.current?.focus()
    }
    addEventListener('pointerdown', down)
    addEventListener('keydown', key, true)
    return () => {
      removeEventListener('pointerdown', down)
      removeEventListener('keydown', key, true)
    }
  }, [close, anchor])
  return (
    <div ref={box} id="a2-chapters" className="a-chapters" data-float="chapters" role="group" aria-label="Chapters">
      <p className="a-chapters-head">Jump to a chapter</p>
      <ol>
        {BEATS.map((b, i) => (
          <li key={b.title}>
            <button
              type="button"
              className={i < cur ? 'is-done' : i === cur ? 'is-now' : undefined}
              aria-current={i === cur ? 'step' : undefined}
              onClick={() => {
                close()
                jumpTo(b.at + 150)
                anchor.current?.focus()
              }}
            >
              <span className="a-chapter-n a-num">{i + 1}</span>
              <span>{b.title}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Story() {
  const beat = useFeed(w => w.beat)
  const today = useFeed(w => w.today)
  const playing = useFeed(w => w.playing)
  const speed = useFeed(w => w.speed)
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const cur = beatIndex(beat?.title)
  const close = useRef(() => setOpen(false)).current
  return (
    <footer className="a-story" aria-label="The story">
      {open && <Chapters close={close} anchor={btn} />}
      <button ref={btn} type="button" className="a-chapter" aria-expanded={open} aria-controls={open ? 'a2-chapters' : undefined} onClick={() => setOpen(o => !o)}>
        <IconChapters />
        <span className="a-chapter-title">
          <span className="a-sr">Chapter </span>
          <span className="a-chapter-n a-num">{cur >= 0 ? `${cur + 1}/${BEATS.length}` : ''}</span> {beat?.title ?? 'Starting'}
        </span>
        <IconChevron />
      </button>
      <p className="a-caption" aria-live="polite">
        {beat?.caption}
      </p>
      <Progress />
      <div className="a-ctl" role="toolbar" aria-label="Story playback">
        <p className="a-date">
          <time dateTime={today}>{fmtDay(today)}</time>
        </p>
        <button type="button" className="a-iconbtn" aria-label={playing ? 'Pause the story' : 'Play the story'} onClick={() => act(() => (playing ? feed.pause() : feed.play()))}>
          {playing ? <IconPause /> : <IconPlay />}
        </button>
        <div className="a-seg" role="group" aria-label="Speed">
          {[1, 2, 4].map(n => (
            <button key={n} type="button" aria-pressed={speed === n} onClick={() => act(() => feed.setSpeed(n))}>
              {n}x
            </button>
          ))}
        </div>
        <button type="button" className="a-iconbtn" aria-label="Replay the story from the start" onClick={() => jumpTo(0)}>
          <IconReplay />
        </button>
      </div>
    </footer>
  )
}

// ── Phone: the sheet's peek ──────────────────────────────────────────────

/** The one line that matters most right now: a decision, the pick, your request, or the chapter. */
function usePeekLine(): { text: string; tone: string; count?: number } {
  const w = useFeed(x => x)
  const selected = useUi(s => s.selected)
  const mine = useUi(s => s.mine)
  const open = w.holds.filter(h => h.open)
  if (open.length) return { text: `${open.length === 1 ? 'A decision is' : `${open.length} decisions are`} waiting on you`, tone: 'hold', count: open.length }
  if (selected) {
    const line = nodeLine(w, selected).text
    return { text: `${nodeName(w, selected)}${line ? `: ${line}` : ''}`, tone: 'pick' }
  }
  const id = mine[0]
  const r = id ? (w.requests.find(q => q.revisionOf === id) ?? w.requests.find(q => q.id === id)) : undefined
  if (r && (!r.outcome || w.packets.some(p => p.refId === r.id))) return { text: `Your ${shortItem(r.item).toLowerCase()}: ${r.outcome ? 'on its way back' : 'checking the rules'}`, tone: r.outcome ?? 'pending' }
  return { text: w.beat?.title ?? fmtDay(w.today), tone: 'beat' }
}

function Peek({ open }: { open: boolean }) {
  const line = usePeekLine()
  return (
    <button type="button" className="a-peek" aria-expanded={open} aria-controls="a2-sheet-body" onClick={() => ui.set({ sheet: !open, hovered: null })}>
      <span className="a-handle" aria-hidden="true" />
      <span className="a-peek-row">
        <Mark size={20} />
        <span className={`a-peek-line a-peek-line--${line.tone}`}>
          {line.count ? (
            <span className="a-badge a-num" aria-hidden="true">
              {line.count}
            </span>
          ) : null}
          <span className="a-peek-text">{line.text}</span>
        </span>
        <span className="a-sr">{open ? 'Close the dashboard' : 'Open the dashboard'}</span>
        <IconChevron />
      </span>
    </button>
  )
}

// ── Root ─────────────────────────────────────────────────────────────────

/** Keeps the pointer, the tab and a few root attributes in sync without re-rendering the scene. */
function RootSync({ root }: { root: RefObject<HTMLDivElement | null> }) {
  const hovered = useUi(s => s.hovered)
  const reveal = useUi(s => s.reveal)
  useEffect(() => {
    root.current?.toggleAttribute('data-hover', !!hovered)
  }, [hovered, root])
  // The scene picked something: show it in the sidebar.
  useEffect(() => {
    if (!reveal) return
    const s = ui.get().selected
    if (!s) return
    ui.set({ tab: /^[a-z]:/.test(s) ? 'overview' : 'requests' })
  }, [reveal])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const s = ui.get()
      if (s.sheet && matchMedia(PHONE).matches) {
        ui.set({ sheet: false })
        root.current?.querySelector<HTMLElement>('.a-peek')?.focus()
      } else if (s.selected || s.openRequest) selectNode(null)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [root])
  // Drop the viewer's own picks when the story restarts.
  const restartKey = useFeed(w => w.log.length === 0 && w.requests.length === 0)
  const was = useRef(restartKey)
  useEffect(() => {
    if (restartKey && !was.current) ui.set({ mine: [], openRequest: null })
    was.current = restartKey
  }, [restartKey])
  return null
}

export function Hud({ root }: { root: RefObject<HTMLDivElement | null> }) {
  const phone = useMedia(PHONE)
  const sheet = useUi(s => s.sheet)
  const open = !phone || sheet
  return (
    <>
      <aside className={`a-side${phone ? ' is-sheet' : ''}${phone && sheet ? ' is-open' : ''}`} data-float={phone ? 'sheet' : 'sidebar'} aria-label="GrantGuard dashboard">
        {phone && <Peek open={sheet} />}
        <div id="a2-sheet-body" className="a-side-body" inert={!open}>
          <div className="a-scroll">
            <Head />
            <Waiting />
            <Tabs />
            <Pane />
          </div>
          <Story />
        </div>
      </aside>
      <RootSync root={root} />
    </>
  )
}
