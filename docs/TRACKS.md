# Event rules and prize tracks

Source: the Cal Hacks 13.0 hacker guide (pasted Fri 10/23). Sponsor details
can change, so check the Live Site and starter packs at kickoff.

## Event rules that constrain us

- **All projects must be started during the event.** Write no project code
  before hacking opens. Teams are disqualified for this every year.
- Teams have at most 4 people. Add every teammate on Devpost.
- **Devpost deadline: Sun 9:00 AM.** Late entries aren't judged. Submit a
  draft Sat night, then keep editing it.
- Judging runs Sun 10:30 AM–12:30 PM at an assigned table. **The whole team
  must be present** the entire time, or we aren't judged. Each judge visit
  is a ~2-min pitch plus a **live demo**.
- General judging looks at impact, quality, technical complexity, and
  creativity.
- Hardware rentals: no soldering at the venue.

## Primary target: Hyphenate, "The Hyphenated Enterprise: Autonomous Systems for Finance"

$8,000 / $5,000 / $3,000, plus expedited interviews for the top 5. **The full
brief, judging criteria, deliverables, resources and our build implications
are in `docs/HYPHENATE.md`.** Read it before building anything.

## Tracks we also enter

Each one requires *meaningful* use, so we enter only tracks that are core to
the build.

| Track | Prize | What judges want | How GrantGuard uses it |
| --- | --- | --- | --- |
| **Microsoft: Built for the Real World** (+ Customer Impact Award) | Grand: Surface laptop per member, a Microsoft FDE tech talk, 1:1 mentorship with senior FDEs. Customer Impact Award: the talk and mentorship | A production-minded finance agent: customer understanding, measurable usefulness, path to production, responsible design, end-to-end function. No Azure requirement | The agent worker runs always-on on an Azure VM; the scorecard is the measurement; limits live in the database; real-user interviews feed the Customer Impact Award |
| **Anthropic** | $5k Claude credits + Max 20x | A **named community** with a real problem someone lived; Claude must matter; know where it fails | Research administrators and PIs; Claude reads requests and writes explanations, checked against the records |
| **SpacetimeDB** | $2,048 / $1,024 / $512 | The **core** real-time backend; agent coordination, live dashboards, financial apps | The whole grant office (20 tables, 27 actions); rules and limits enforced in the module; one identity per agent |
| **Apify** | $2k / $1k / $800 / $400 / $400 (+ Best Actor) | Real scraped public data | Our Actor scrapes the Grant Witness NIH cancellation list for the fund tracker (`scrapers/`) |
| **Meta** | See the hacker guide | Human connection | Re-added Sat by Ethan; how GrantGuard fits is still to be written |
| **General: Most Technically Complex / People-First** | Prizes | Automatic consideration | — |

## Cut tracks

Not entered (reasons in `DECISIONS.md`): SpaceXAI, Mana.space,
Notability, Creao, Best Solo / Hardware / Planet-First, Bitdeer, Moss, Visa,
Figma, Convex, Atlassian, Bright Data, Armadin, Elastic, Coinbase x402, CRS,
and the former stretch tracks Factory Droid, Capital One Nessie, Fetch.ai
and Cartesia.
