// The DOM layer over the scene. Everything here reads the feed through
// hooks; nothing here re-renders the Canvas.

import { useEffect, useRef, type RefObject } from 'react'
import { feed } from '../../feed'
import { IconInbox, IconLedger, IconList, IconPause, IconPlay, IconReplay, Mark, TokenIcon, outcomeWord } from './icons'
import { PanelHost } from './Panels'
import { LedgerRows, fmtDay } from './bits'
import { act, openPanel, selectNode, ui, useFeed, useUi } from './store'

const APP_URL = import.meta.env.VITE_APP_URL ?? 'http://localhost:5173'

function HeroCopy() {
  return (
    <section className="a-hero" aria-labelledby="a-headline">
      <h1 id="a-headline">An AI grant office that keeps a lab’s spending inside its grants’ rules.</h1>
      <p>
        Researchers send requests. Three AI agents check each one against the spending rules and answer bought, rerouted, blocked or held, and only the
        human grant manager can approve an exception.
      </p>
      <div className="a-cta">
        <button type="button" className="a-btn a-btn--primary" onClick={() => openPanel('request')}>
          Send a request
        </button>
        <a className="a-link" href={APP_URL}>
          Open the grant office
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 8h9.5M9 4.5 12.5 8 9 11.5" />
          </svg>
        </a>
      </div>
    </section>
  )
}

function Bar() {
  const playing = useFeed(w => w.playing)
  const speed = useFeed(w => w.speed)
  const today = useFeed(w => w.today)
  const open = useFeed(w => w.holds.reduce((n, h) => n + (h.open ? 1 : 0), 0))
  const panel = useUi(s => s.panel)
  return (
    <div className="a-bar" role="toolbar" aria-label="Story playback">
      <div className="a-bar-row a-bar-row--meta">
        <p className="a-date">
          <span className="a-date-label">Simulated date</span>
          <time dateTime={today}>{fmtDay(today)}</time>
        </p>
        <span className="a-demo">Demo data</span>
      </div>
      <div className="a-bar-row">
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
        <button
          type="button"
          className="a-iconbtn"
          aria-label="Replay the story from the start"
          onClick={() => {
            ui.reset()
            feed.restart()
          }}
        >
          <IconReplay />
        </button>
        <span className="a-bar-gap" />
        <button type="button" className={`a-pill${open ? ' has-news' : ''}`} aria-pressed={panel === 'inbox'} onClick={() => openPanel(panel === 'inbox' ? null : 'inbox')}>
          <IconInbox />
          <span className="a-pill-text">Grant manager</span>
          <span className="a-count" aria-label={`${open} waiting`}>
            {open}
          </span>
        </button>
        <button type="button" className="a-iconbtn" aria-label="Full ledger" aria-pressed={panel === 'ledger'} onClick={() => openPanel(panel === 'ledger' ? null : 'ledger')}>
          <IconLedger />
        </button>
        <button type="button" className="a-iconbtn" aria-label="Everything in the scene" aria-pressed={panel === 'index'} onClick={() => openPanel(panel === 'index' ? null : 'index')}>
          <IconList />
        </button>
      </div>
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
  const status = !r.outcome ? (r.verdicts.length ? 'Checking the spending rules' : 'On its way to the purchasing agent') : traveling ? `${outcomeWord(r)}: on its way back` : outcomeWord(r)
  return (
    <button type="button" className="a-tracker" onClick={() => ui.set({ selected: `r:${r.researcherId}`, panel: 'detail', openRequest: r.id })}>
      <TokenIcon outcome={r.outcome} />
      <span className="a-tracker-item">Your request: {r.item.split(',')[0]}</span>
      <span className={`a-word a-word--${r.outcome ?? 'pending'}`}>{status}</span>
    </button>
  )
}

function Narration() {
  const beat = useFeed(w => w.beat)
  const live = useFeed(w => w.storyDone)
  return (
    <section className="a-caption" aria-live="polite" aria-label="What is happening">
      <Tracker />
      {beat && (
        <div key={beat.id} className="a-caption-body">
          <h2>{beat.title}</h2>
          <p>{beat.caption}</p>
        </div>
      )}
      <ul className="a-legend" aria-label="How answers come back">
        <li>
          <TokenIcon outcome="accept" /> Bought
        </li>
        <li>
          <TokenIcon outcome="refine" /> Rerouted or sent back
        </li>
        <li>
          <TokenIcon outcome="reject" /> Blocked
        </li>
        <li>
          <TokenIcon outcome="hold" /> Held
        </li>
      </ul>
      {live && <p className="a-live">Live: the story is done; the lab keeps working.</p>}
    </section>
  )
}

function Ledger() {
  const log = useFeed(w => w.log)
  const panel = useUi(s => s.panel)
  if (panel) return null
  return (
    <section className="a-ledger" aria-label="Live ledger">
      <h2>Ledger</h2>
      <LedgerRows rows={log.slice(0, 3)} />
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
          <span>GrantGuard</span>
        </header>
        <HeroCopy />
      </div>
      <div className="a-spacer" />
      <Bar />
      <Narration />
      <Ledger />
      <PanelHost />
      <RootSync root={root} />
    </div>
  )
}
