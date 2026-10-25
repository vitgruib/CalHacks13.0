// The landing (T75, T96): the 3D hero fills the first screen (its title is
// Grant Test Auto) and its two big choices open a portal; the problem and the
// solution, in numbers, sit below it. The hero keeps its full height, so it is
// never cut off: scrolling down moves it up whole.
// "Who are you?" (Entry.tsx) is no longer shown here; the UserSwitch inside
// each portal changes who you are.
import { useLayoutEffect } from 'react'
import type { HeroRole } from '@hero/embed'
import HeroSlot from './HeroSlot'
import './Landing.css'

// The demo path's researcher: "Research portal" opens as her.
const DEMO_RESEARCHER = 'priya'

type Fact = { figure: string; title: string; text: string }
const PROBLEM: Fact[] = [
  { figure: '$117.7B', title: 'Annual university R&D spending', text: 'A massive research-funding ecosystem to manage.' },
  { figure: '44%', title: 'Time spent on administration', text: 'One study reported researchers spending this share of their federally funded research time on pre- and post-award grant administration.' },
  { figure: 'Fragmented & complex', title: 'Slow, difficult grant reviews', text: 'Researchers and administrators must connect scientific aims, funding rules, budgets, and approvals across documents and systems.' },
]
const SOLUTION: Fact[] = [
  { figure: '3-in-1', title: 'Research scope + financial management + approvals', text: 'Checks scientific alignment with grant aims, tracks expenses and invoices, and helps route spending requests for the right approvals, with evidence and an audit trail.' },
  { figure: '5 min', title: 'Target research-spend planning assessment time', text: 'Assess a proposed experiment and its planned costs against grant terms, budget availability, and potential approval requirements.' },
  { figure: '30–50%', title: 'Target reduction in initial review effort', text: 'Reduce administrator time spent gathering documents, checking costs, and preparing initial feedback.' },
]

function Column({ title, sub, facts }: { title: string; sub: string; facts: Fact[] }) {
  return (
    <section className="facts-col">
      <h3>{title}</h3>
      <p className="facts-sub">{sub}</p>
      {facts.map(f => (
        <div key={f.title} className="fact">
          <p className="fact-figure">{f.figure}</p>
          <p className="fact-title">{f.title}</p>
          <p className="fact-text">{f.text}</p>
        </div>
      ))}
    </section>
  )
}

function Facts() {
  return (
    <section className="facts" aria-labelledby="facts-title">
      <h2 id="facts-title">Problem vs. solution</h2>
      <div className="facts-grid">
        <Column title="The problem" sub="Scale, time and complexity" facts={PROBLEM} />
        <Column title="Our solution" sub="One copilot from planning to approval" facts={SOLUTION} />
      </div>
      <p className="facts-note">The 44% figure is from one study (FDP faculty workload survey, 2018), not a universal estimate of wasted time. The 5-minute and 30–50% figures are proposed pilot targets, not validated results. Expense tracking and approval functionality depends on available data and integrations.</p>
    </section>
  )
}

export default function Landing({ onPick }: { onPick: (portal: string) => void }) {
  // The landing and the portals both open at the top.
  useLayoutEffect(() => {
    scrollTo(0, 0)
    return () => scrollTo(0, 0)
  }, [])
  // No role (an older call to action) falls back to the grant office.
  const enter = (role?: HeroRole) => onPick(role === 'researcher' ? DEMO_RESEARCHER : 'grant_office')

  return (
    <div className="landing">
      <header className="landing-bar"><span className="landing-mark">Grant Test Auto</span></header>
      <div className="landing-stage">
        <div className="landing-embed"><HeroSlot onEnter={enter} /></div>
      </div>
      <Facts />
    </div>
  )
}
