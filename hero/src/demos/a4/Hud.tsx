// The sidebar dashboard: a fixed column on the left (a bottom sheet on a
// phone). The brand and headline on top, collapsible sections in the middle
// (one open at a time), and the story clock at the foot. Nothing here sits
// over the stage, and nothing here re-renders the Canvas.

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode, type RefObject } from 'react'
import { APP_URL } from '../../chrome'
import { feed } from '../../feed'
import { IconChevron, IconPause, IconPlay, IconPlus, IconReplay, Mark } from './icons'
import { LINES } from './lines'
import { ActivitySection, AgentsSection, BEATS, GrantsSection, RequestsSection, StorySection, WaitingSection, beatIndex, nowAt } from './Panels'
import { fmtDay } from './bits'
import { act, openSection, reducedMotion, selectNode, ui, useFeed, useUi, type Section } from './store'

const PHONE = '(max-width: 759px)'
const subPhone = (fn: () => void) => {
  const m = matchMedia(PHONE)
  m.addEventListener('change', fn)
  return () => m.removeEventListener('change', fn)
}
const usePhone = () => useSyncExternalStore(subPhone, () => matchMedia(PHONE).matches)

function Head() {
  return (
    <header className="a-head">
      <p className="a-brand">
        <Mark size={20} />
        <span>Grant Test Auto</span>
        <span className="a-demo">Simulated</span>
      </p>
      <h1>An AI grant office that keeps a lab’s spending inside its grants’ rules.</h1>
      <p className="a-lede">A simulated lab running a scripted story. Three AI agents check every request against the real spending rules; you, the grant manager, decide the exceptions.</p>
      <a className="a-applink" href={APP_URL}>Open the Grant Test Auto app</a>
      <button type="button" className="a-btn a-btn--primary" onClick={() => ui.set({ section: 'requests', composing: true, composeFor: null, selected: null })}>
        <IconPlus size={15} />
        Send a request
      </button>
    </header>
  )
}

// ── Collapsed summaries: one short line per closed section ───────────────

function WaitingSummary() {
  const n = useFeed(w => w.holds.reduce((k, h) => k + (h.open ? 1 : 0), 0))
  return n ? <span className="a-count" aria-label={`${n} waiting`}>{n}</span> : <span className="a-summary">Nothing waiting</span>
}
function GrantsSummary() {
  const frozen = useFeed(w => w.grants.filter(g => g.frozen).length)
  return <span className={`a-summary${frozen ? ' is-frozen' : ''}`}>{frozen ? `${frozen} frozen` : 'All active'}</span>
}
function RequestsSummary() {
  const n = useFeed(w => w.requests.length)
  return <span className="a-summary a-num">{n ? `${n} so far` : 'None yet'}</span>
}
function AgentsSummary() {
  const busy = useFeed(w => ['a:purchasing', 'a:bookkeeping', 'a:payment_report'].filter(id => nowAt(w, id).state !== 'idle').length)
  return <span className="a-summary">{busy ? `${busy} working` : 'All quiet'}</span>
}
function ActivitySummary() {
  const day = useFeed(w => w.log[0]?.day)
  return <span className="a-summary">{day ? `Latest ${fmtDay(day).replace(/, \d{4}$/, '')}` : 'Nothing yet'}</span>
}
function StorySummary() {
  const i = useFeed(w => beatIndex(w.beat?.id))
  return <span className="a-summary a-num">{i < 0 ? 'Starting' : `Stop ${i + 1} of ${BEATS.length}`}</span>
}

const SECTIONS: { id: Section; title: string; color: string; Summary: () => ReactNode; Body: () => ReactNode }[] = [
  { id: 'waiting', title: 'Waiting on you', color: LINES.people.color, Summary: WaitingSummary, Body: WaitingSection },
  { id: 'grants', title: 'Grants', color: LINES.money.color, Summary: GrantsSummary, Body: GrantsSection },
  { id: 'requests', title: 'Requests', color: LINES.requests.color, Summary: RequestsSummary, Body: RequestsSection },
  { id: 'agents', title: 'Agents', color: '#1C232C', Summary: AgentsSummary, Body: AgentsSection },
  { id: 'activity', title: 'Activity', color: LINES.readings.color, Summary: ActivitySummary, Body: ActivitySection },
  { id: 'story', title: 'Story', color: '#1C232C', Summary: StorySummary, Body: StorySection },
]

function Sections() {
  const open = useUi(s => s.section)
  const box = useRef<HTMLDivElement>(null)
  const prev = useRef(open)
  // Scroll just enough to show the section that opened, never past its header.
  // A layout effect, so a selected row's own reveal (a passive effect) still runs after it.
  // Comparing with the last section (not a first-run flag) keeps Strict Mode's re-run still.
  useLayoutEffect(() => {
    if (prev.current === open) return
    prev.current = open
    const sec = open && box.current?.querySelector<HTMLElement>(`#a-sec-${open}`)?.closest('section')
    const scroller = sec?.closest('.a-side-scroll')
    // A closed phone sheet shows no list, so there is nothing to scroll into view yet.
    if (!sec || !(scroller instanceof HTMLElement) || scroller.clientHeight < 120) return
    const top = sec.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
    const fit = top + sec.offsetHeight - scroller.clientHeight
    const to = Math.min(top, Math.max(scroller.scrollTop, fit))
    if (Math.abs(to - scroller.scrollTop) > 1) scroller.scrollTo({ top: to, behavior: reducedMotion() ? 'auto' : 'smooth' })
  }, [open])
  return (
    <div className="a-sections" ref={box}>
      {SECTIONS.map(({ id, title, color, Summary, Body }) => {
        const on = open === id
        return (
          <section key={id} className={`a-sec${on ? ' is-open' : ''}`} aria-labelledby={`a-sec-${id}`}>
            <h2 className="a-sec-head">
              <button type="button" id={`a-sec-${id}`} aria-expanded={on} aria-controls={`a-body-${id}`} onClick={() => openSection(on ? null : id)}>
                <span className="a-sec-line" style={{ background: color }} aria-hidden="true" />
                <span className="a-sec-title">{title}</span>
                <Summary />
                <IconChevron size={16} />
              </button>
            </h2>
            {on && (
              <div className="a-sec-body" id={`a-body-${id}`}>
                <Body />
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

// ── The story clock ──────────────────────────────────────────────────────

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
    <span className="a-progress" aria-hidden="true">
      <span ref={fill} />
    </span>
  )
}

function Clock() {
  const playing = useFeed(w => w.playing)
  const today = useFeed(w => w.today)
  const speed = useFeed(w => w.speed)
  const beat = useFeed(w => w.beat)
  return (
    <footer className="a-clock">
      <button type="button" className="a-now" onClick={() => openSection('story')} aria-label={`Now: ${beat?.title ?? 'starting'}. Open the story`}>
        <span className="a-now-title">{beat?.title ?? 'Starting'}</span>
        <Progress />
      </button>
      <div className="a-ctl" role="toolbar" aria-label="Story playback">
        <button type="button" className="a-iconbtn a-iconbtn--solid" aria-label={playing ? 'Pause the story' : 'Play the story'} onClick={() => act(() => (playing ? feed.pause() : feed.play()))}>
          {playing ? <IconPause /> : <IconPlay />}
        </button>
        <time className="a-date" dateTime={today}>
          {fmtDay(today)}
        </time>
        <div className="a-seg" role="group" aria-label="Speed">
          {[1, 2, 4].map(n => (
            <button key={n} type="button" aria-pressed={speed === n} aria-label={`${n} times speed`} onClick={() => act(() => feed.setSpeed(n))}>
              {n}x
            </button>
          ))}
        </div>
        <button
          type="button"
          className="a-iconbtn"
          aria-label="Replay the story from the start"
          onClick={() => {
            const { section, sheet } = ui.get()
            ui.reset()
            ui.set({ section, sheet })
            feed.restart()
          }}
        >
          <IconReplay />
        </button>
      </div>
    </footer>
  )
}

// ── Phone: the peek line that pulls the sheet up ─────────────────────────

function Peek() {
  const sheet = useUi(s => s.sheet)
  const n = useFeed(w => w.holds.reduce((k, h) => k + (h.open ? 1 : 0), 0))
  const beat = useFeed(w => w.beat?.title)
  const today = useFeed(w => w.today)
  return (
    <button
      type="button"
      className={`a-peek${n ? ' is-waiting' : ''}`}
      aria-expanded={sheet}
      aria-controls="a-side-body"
      onClick={() => ui.set(sheet ? { sheet: false } : n ? { sheet: true, section: 'waiting' } : { sheet: true })}
    >
      <span className="a-handle" aria-hidden="true" />
      <span className="a-peek-line">
        {n ? (
          <>
            <span className="a-count">{n}</span>
            <span>
              decision{n === 1 ? '' : 's'} waiting on you
            </span>
          </>
        ) : (
          <>
            <time className="a-peek-day" dateTime={today}>
              {fmtDay(today).replace(/, \d{4}$/, '')}
            </time>
            <span className="a-peek-beat">{beat ?? 'Grant Test Auto'}</span>
          </>
        )}
      </span>
      <span className="a-peek-chev" aria-hidden="true">
        <IconChevron size={18} />
      </span>
      <span className="a-sr">{sheet ? 'Close the dashboard' : 'Open the dashboard'}</span>
    </button>
  )
}

export function Sidebar() {
  const phone = usePhone()
  const sheet = useUi(s => s.sheet)
  return (
    <aside className="a-side" data-float={phone ? 'sheet' : 'sidebar'} data-open={phone && sheet ? '' : undefined} aria-label="Grant Test Auto dashboard">
      {phone && <Peek />}
      <div className="a-side-body" id="a-side-body" inert={phone && !sheet}>
        <div className="a-side-scroll">
          <Head />
          <Sections />
        </div>
        <Clock />
      </div>
    </aside>
  )
}

/** Keeps a few root attributes and the keyboard in sync without re-rendering the scene. */
export function RootSync({ root }: { root: RefObject<HTMLDivElement | null> }) {
  const hovered = useUi(s => s.hovered)
  const sheet = useUi(s => s.sheet)
  useEffect(() => {
    root.current?.toggleAttribute('data-hover', !!hovered)
  }, [hovered, root])
  useEffect(() => {
    root.current?.toggleAttribute('data-sheet', sheet)
  }, [sheet, root])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const s = ui.get()
      if (s.composing) ui.set({ composing: false, composeFor: null })
      else if (s.sheet && matchMedia(PHONE).matches) ui.set({ sheet: false })
      else if (s.openRequest) ui.set({ openRequest: null })
      else if (s.selected) selectNode(null)
      else return
      e.preventDefault()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
  // A new decision for the grant manager opens "Waiting on you", unless the viewer is mid-form.
  const open = useFeed(w => w.holds.reduce((k, h) => k + (h.open ? 1 : 0), 0))
  const was = useRef(open)
  useEffect(() => {
    if (open > was.current && !ui.get().composing) ui.set({ section: 'waiting' })
    was.current = open
  }, [open])
  // Drop request-local UI state when the story restarts.
  const restartKey = useFeed(w => w.log.length === 0 && w.requests.length === 0)
  const fresh = useRef(restartKey)
  useEffect(() => {
    if (restartKey && !fresh.current) ui.set({ mine: [], openRequest: null })
    fresh.current = restartKey
  }, [restartKey])
  return null
}
