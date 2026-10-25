// The sidebar dashboard: a dark column on the right (a bottom sheet on a
// phone) with the headline, the story's now-playing strip and seven
// collapsible sections, one open at a time. Nothing here sits over the stage.
// Until the viewer opens a section themselves, the sidebar follows the story.

import { useEffect, useRef, useSyncExternalStore, type ReactNode, type RefObject } from 'react'
import { APP_URL } from '../../chrome'
import { feed } from '../../feed'
import type { World } from '../../feed'
import { IconChevron, IconPause, IconPlay, IconReplay, Mark } from './icons'
import { ActivityLog, Agents, Grants, Lab, Requests, Scenes, Waiting, summaryOf } from './Panels'
import { act, openSection, sectionFor, selectNode, ui, useFeed, useUi, type SectionId } from './store'
import { BEATS, STORY_MS, agentNow, fmtDay, managerNow, nodeNow, plainDates, researcherNow } from './words'

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

const compose = () => ui.set({ section: 'requests', composing: true, sheet: true, chosen: true, selected: null })

function Head() {
  return (
    <header className="a-head">
      <div className="a-brand-row">
        <p className="a-brand">
          <Mark size={20} />
          <span>Grant Test Auto</span>
        </p>
        <button type="button" className="a-btn a-btn--primary" onClick={compose}>
          Send a request
        </button>
      </div>
      <h1 id="a5-headline">An AI grant office that keeps a lab’s spending inside its grants’ rules.</h1>
      <p className="a-lede">A simulated lab running a scripted story. Three AI agents check every request against the real spending rules; you decide the exceptions.</p>
      <a className="a-applink" href={APP_URL}>Open the Grant Test Auto app</a>
    </header>
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
    <span className="a-progress" aria-hidden="true">
      <span ref={fill} className="a-progress-fill" />
      {BEATS.slice(1).map(b => (
        <i key={b.id} style={{ left: `${(b.at / STORY_MS) * 100}%` }} />
      ))}
    </span>
  )
}

function NowPlaying() {
  const beat = useFeed(w => w.beat)
  const today = useFeed(w => w.today)
  const playing = useFeed(w => w.playing)
  const speed = useFeed(w => w.speed)
  const scenesOpen = useUi(s => s.section === 'story')
  const cur = BEATS.findIndex(b => b.id === beat?.id)
  return (
    <section className="a-now" aria-label="The story">
      <div className="a-now-top">
        <p className="a-date">
          <time dateTime={today}>{fmtDay(today)}</time>
          <span className="a-date-note"> · simulated</span>
        </p>
        <div className="a-transport" role="toolbar" aria-label="Story playback">
          <button type="button" className="a-iconbtn" aria-label={playing ? 'Pause the story' : 'Play the story'} onClick={() => act(() => (playing ? feed.pause() : feed.play()))}>
            {playing ? <IconPause /> : <IconPlay />}
          </button>
          <button
            type="button"
            className="a-iconbtn"
            aria-label="Replay the story from the start"
            onClick={() => {
              const sheet = ui.get().sheet
              ui.reset()
              ui.set({ sheet })
              act(() => feed.restart())
            }}
          >
            <IconReplay />
          </button>
          <div className="a-seg" role="group" aria-label="Speed">
            {[1, 2, 4].map(n => (
              <button key={n} type="button" aria-pressed={speed === n} aria-label={`${n} times speed`} onClick={() => act(() => feed.setSpeed(n))}>
                {n}x
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="a-now-text" aria-live="polite">
        {beat && (
          <>
            <h2 className="a-now-title">{beat.title}</h2>
            <p className="a-now-cap">{plainDates(beat.caption)}</p>
          </>
        )}
      </div>
      <div className="a-now-bar">
        <Progress />
        <button type="button" className="a-now-scenes" aria-expanded={scenesOpen} aria-controls="a5-sec-story" onClick={() => openSection('story')}>
          Scene <span className="a-num">{Math.max(1, cur + 1)}</span> of {BEATS.length}
        </button>
      </div>
    </section>
  )
}

const SECTIONS: { id: SectionId; title: string; Body: () => ReactNode }[] = [
  { id: 'grants', title: 'Grants', Body: Grants },
  { id: 'waiting', title: 'Waiting on you', Body: Waiting },
  { id: 'requests', title: 'Requests', Body: Requests },
  { id: 'agents', title: 'Agents', Body: Agents },
  { id: 'lab', title: 'Lab', Body: Lab },
  { id: 'activity', title: 'Activity', Body: ActivityLog },
  { id: 'story', title: 'Scenes', Body: Scenes },
]

const openHolds = (w: World) => w.holds.reduce((k, h) => k + (h.open ? 1 : 0), 0)

function Section({ id, title, Body }: (typeof SECTIONS)[number]) {
  const open = useUi(s => s.section === id)
  // Hovering a node in the scene lights the header of the closed section that holds its row.
  const hot = useUi(s => !!s.hovered && s.section !== id && sectionFor(s.hovered) === id)
  const summary = useFeed(w => (id === 'story' ? `${Math.max(1, BEATS.findIndex(b => b.id === w.beat?.id) + 1)} of ${BEATS.length}` : summaryOf(id, w)))
  const count = useFeed(w => (id === 'waiting' ? openHolds(w) : 0))
  const hid = `a5-sec-${id}-h`
  return (
    <section className={`a-sec${open ? ' is-open' : ''}${count ? ' is-due' : ''}`} data-sec={id}>
      <h2 className="a-sec-h">
        <button type="button" id={hid} className={hot ? 'is-hot' : undefined} aria-expanded={open} aria-controls={`a5-sec-${id}`} onClick={() => openSection(id)}>
          <span className="a-sec-title">{title}</span>
          {count > 0 && (
            <span className="a-badge a-num" aria-label={`${count} waiting`}>
              {count}
            </span>
          )}
          <span className="a-sec-sum">{open ? '' : summary}</span>
          <IconChevron />
        </button>
      </h2>
      {open && (
        <div className="a-sec-body" id={`a5-sec-${id}`} role="region" aria-labelledby={hid}>
          <Body />
        </div>
      )}
    </section>
  )
}

/** The phone's collapsed sheet: a handle and the one line that matters most. */
function Peek() {
  const sheet = useUi(s => s.sheet)
  const selected = useUi(s => s.selected)
  const n = useFeed(openHolds)
  const line = useFeed(w => {
    if (selected) {
      const node = w.nodes.find(x => x.id === selected)
      if (node) {
        const now = selected.startsWith('r:')
          ? researcherNow(selected.slice(2), w)
          : selected.startsWith('a:')
            ? agentNow(selected.slice(2) as 'purchasing', w)
            : selected === 'p:grant_manager'
              ? managerNow(w)
              : nodeNow(selected, w)
        return now.line ? `${node.label}: ${now.line}` : node.label
      }
    }
    if (openHolds(w)) return `${openHolds(w)} decision${openHolds(w) === 1 ? '' : 's'} waiting on you`
    return w.beat?.title ?? 'Grant Test Auto'
  })
  return (
    <button type="button" className="a-peek" aria-expanded={sheet} aria-controls="a5-side-body" onClick={() => toggleSheet(!sheet)}>
      <span className="a-handle" aria-hidden="true" />
      <Mark size={18} />
      <span className="a-peek-line">{line}</span>
      {n > 0 && !line.includes('waiting on you') && (
        <span className="a-badge a-num" aria-hidden="true">
          {n}
        </span>
      )}
      <span className="a-peek-chev" aria-hidden="true">
        <IconChevron />
      </span>
      <span className="a-sr">{sheet ? 'Collapse the dashboard' : 'Open the dashboard'}</span>
    </button>
  )
}

/** Opening the phone sheet lands on the open section (a decision, a selected row), not the headline. */
function toggleSheet(open: boolean) {
  ui.set({ sheet: open })
  if (!open) return
  const s = ui.get()
  if (!s.selected && !openHolds(feed.getWorld())) return
  requestAnimationFrame(() => {
    const body = document.getElementById('a5-side-body')
    const sec = body?.querySelector<HTMLElement>('.a-sec.is-open')
    if (body && sec) body.scrollTop += sec.getBoundingClientRect().top - body.getBoundingClientRect().top
  })
}

// Which section tells the story best at each beat, until the viewer picks one.
const FOLLOW: Record<string, SectionId> = {
  'the-scientist-pushes-to-buy': 'requests',
  'it-defends-the-decision': 'requests',
  'rerouted-to-a-grant-with-time-left': 'requests',
  'not-allowed-on-a-federal-grant': 'requests',
  'sent-back-to-refine': 'requests',
  'exactly-at-the-limit': 'requests',
  'over-the-limit-your-call': 'requests',
  'a-paper-credits-the-wrong-grant': 'agents',
  'a-bill-for-a-canceled-order': 'agents',
  'payment-request-drafted-and-defended': 'agents',
  live: 'requests',
}

/** Checks on every UI or world change (not on render), so a reset or a jump never leaves it behind. */
function FollowStory() {
  useEffect(() => {
    const check = () => {
      const s = ui.get()
      if (s.chosen || s.selected) return
      const w = feed.getWorld()
      const target = openHolds(w) ? 'waiting' : (FOLLOW[w.beat?.id ?? ''] ?? 'grants')
      if (s.section === target) return
      if (document.activeElement?.closest('.demo-a5 textarea, .demo-a5 input, .demo-a5 select')) return
      ui.set({ section: target })
    }
    check()
    const offUi = ui.subscribe(check)
    const offFeed = feed.subscribeWorld(check)
    return () => {
      offUi()
      offFeed()
    }
  }, [])
  return null
}

/** Pointer, Escape, a polite count, and dropping viewer state when the story restarts. */
function RootSync({ root, peek }: { root: RefObject<HTMLDivElement | null>; peek: RefObject<HTMLDivElement | null> }) {
  const hovered = useUi(s => s.hovered)
  const n = useFeed(openHolds)
  useEffect(() => {
    root.current?.toggleAttribute('data-hover', !!hovered)
  }, [hovered, root])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const s = ui.get()
      if (s.sheet && narrowNow()) {
        ui.set({ sheet: false })
        peek.current?.querySelector<HTMLElement>('.a-peek')?.focus()
      } else if (s.composing) ui.set({ composing: false, composeFor: null })
      else if (s.selected) selectNode(null)
      else if (s.openRequest) ui.set({ openRequest: null })
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [peek])
  const restartKey = useFeed(w => w.log.length === 0 && w.requests.length === 0)
  const was = useRef(restartKey)
  useEffect(() => {
    if (restartKey && !was.current) ui.set({ mine: [], openRequest: null })
    was.current = restartKey
  }, [restartKey])
  return (
    <p className="a-sr" aria-live="polite">
      {n ? `${n} decision${n === 1 ? '' : 's'} waiting on you` : ''}
    </p>
  )
}

export function Hud({ root }: { root: RefObject<HTMLDivElement | null> }) {
  const narrow = useNarrow()
  const sheet = useUi(s => s.sheet)
  const side = useRef<HTMLDivElement>(null)
  return (
    <aside ref={side} className="a-side" data-float={narrow ? 'sheet' : 'sidebar'} data-open={narrow && sheet ? '' : undefined} aria-label="Grant Test Auto dashboard">
      {narrow && <Peek />}
      <div className="a-side-body" id="a5-side-body" inert={narrow && !sheet}>
        <Head />
        <NowPlaying />
        <div className="a-secs">
          {SECTIONS.map(s => (
            <Section key={s.id} {...s} />
          ))}
        </div>
      </div>
      <FollowStory />
      <RootSync root={root} peek={side} />
    </aside>
  )
}
