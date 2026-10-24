# GrantGuard demo script

Drafted Sat 10/24 before product code landed. It follows the demo path in
`docs/MASTER-PLAN.md` §5 and the windows in §4. Every step that depends on
an unbuilt task is tagged `[needs Tn]`; walk the script on fresh `main`
before rehearsing and cut or fake (and say so) any step that doesn't run.

Judging slot (Devpost page): **3 min pitch + 2 min judge questions**, live
demo required. The judge plays the grant manager. The Devpost video should
stay under 3:00.

Roles at the table:
- **Driver:** runs the laptop (Test lab and Requests windows).
- **Narrator:** talks; hands the judge the Inbox when it's their turn.
- **Backup:** watches the Log window for errors; has the video open in a tab
  in case the live demo breaks.

---

## (a) Live demo, ~3 minutes

Pre-state: seed loaded, clock at the "before cancellation" point, Funds
window open, Inbox empty. All outside lookups cached.

| Time | Window | Action | Say |
|---|---|---|---|
| 0:00 | Funds | Nothing yet. Point at grant A's "truly available" number. | "GrantGuard is an AI grant office for a university lab. Three agents fill the purchasing, grant accountant, and payment-and-report seats. You're the grant manager, the only one who can approve. In June 2025 a federal court ordered canceled UC grants reinstated. A court order is not a payment. Watch." |
| 0:15 | Test lab | Drop in a **cancellation** for grant A. `[needs T18, T5]` | "The government cancels grant A." |
| 0:20 | Funds | Grant A turns frozen; status timeline gains a "canceled" event with its source. `[needs T17]` | "The bookkeeping agent records the change with its source and freezes spending." |
| 0:30 | Test lab | Drop in a **court order** restoring grant A. Claude reads the notice text. `[needs T10/T18]` | "Now a court restores it. The agent read the notice and matched it to the grant." |
| 0:40 | Requests | Driver switches to **Dr. Priya Nair's researcher portal**, asks to buy a reagent on grant A and pushes: "the court restored it." Switch back to the **grant office portal**: the request says "Requested by Dr. Priya Nair". `[needs T11]` | "Priya, a postdoc, wants to buy; the grant office sees exactly who asked. A rule engine reading 'status: active' would say yes." |
| 0:50 | Requests / Log | Request held; explanation shown. Click "why?" on the Log row. `[needs T7, T11]` | "GrantGuard holds it: the order restored the grant, but no money has arrived. Here's the rule and the reason." |
| 1:05 | Test lab | Drop in the **payment** for grant A. | "Now the payment lands." |
| 1:10 | Funds / Requests | Grant A unfreezes; the held purchase rechecks and goes through by itself. A second item (supplies in grant A's last 90 days) is blocked and rerouted to grant B. `[needs T5, T6, T11]` | "It unfreezes, rechecks, and buys on its own. The second item would land in the grant's last 90 days, which is what auditors disallowed at West Virginia, so it reroutes it to grant B, which has time and money left." |
| 1:30 | Invoices | An invoice for a **canceled order** shows red with its timeline. `[needs T12]` | "The bookkeeping agent caught an invoice for an order we canceled. Every record looks fine alone; the timeline shows the problem." |
| 1:45 | Inbox | **Judge's turn.** Hand over the laptop: judge rejects or asks the vendor; the reason field is required. `[needs T17]` | "You're the grant manager. Decide this one. It won't let you skip the reason." |
| 2:05 | Payment requests | Drafted justification (≤1,000 chars) with the held invoice left out; the funder's follow-up (from the seed) and the drafted answer quoting exact purchases. `[needs T13]` | "Every federal payment request now needs a written justification. It drafts one from the purchase records, leaves out what's on hold, and answers the government's follow-up with the exact purchases. You approve before anything is sent." |
| 2:25 | Reports | A paper flagged: it credits grant A but its costs sit on grant B; days left on the 90-day fix window. `[needs T14]` | "The progress report check found a paper crediting the wrong grant, and how many days are left to fix the charge." |
| 2:40 | Test lab | Scorecard. `[needs T19]` | "Proof: we planted [N] mistakes from real audit findings plus decoys. It caught [N], missed [N], and raised [N] false alarms. The check runs on every build." (Read the numbers off the screen; never from memory.) |
| 2:55 | any | — | "Purchasing agent, grant accountant, payment and report preparer. Limits live in the database, every decision has a why. Try your own scenario." |

**If short on time,** cut in this order: Reports (2:25), Payment requests
(2:05), Invoices (1:30). Never cut the moment or the scorecard.

---

## (b) Backup video script and shot list (target 2:45, hard cap 3:00)

Per `docs/HYPHENATE.md`: the video **opens with the moment**, no title card
first. Record at 1080p, browser zoomed so text is readable, cursor
highlighting on. Narration is recorded over screen capture (or live, if
cleaner).

| Time | Shot (on screen) | Narration |
|---|---|---|
| 0:00–0:05 | Funds window, grant A **frozen** (red), timeline shows "canceled". Caption: "Grant canceled." | "This research grant was just canceled. GrantGuard froze its spending." |
| 0:05–0:15 | Test lab: court order dropped in. Funds timeline gains "court order: restored", grant **stays frozen**. Caption: "Court restores it." | "Then a court restored it. Most systems would flip it back to active. GrantGuard doesn't." |
| 0:15–0:27 | Requests: Priya asks to buy from her researcher portal, pushes back. Hold appears with explanation; close-up on the "why?" text. `[needs T11]` | "Priya asks to buy. The agent holds: a court order is not a payment, and no money has arrived." |
| 0:27–0:37 | Payment lands. Grant A unfreezes; purchase rechecks and executes by itself; Log rows appear live. `[needs T5, T17]` | "The moment the payment lands, it rechecks and buys on its own." |
| 0:37–0:45 | Title card: "GrantGuard: an AI grant office for a university research lab." Below: the seats line. | "GrantGuard fills three seats: purchasing agent, grant accountant, and payment and report preparer, under one human grant manager." |
| 0:45–1:00 | Quote cards (one at a time): "I won't believe it until ALL the funding has been disbursed" (r/AskAcademia, NEH grantee). Then the WVU $17,335 end-of-award disallowance. | "Researchers lived this in 2025. And the spending mistakes it guards against are the ones auditors keep finding, like supplies bought at the very end of a grant." |
| 1:00–1:12 | Requests: second item blocked (last 90 days) and rerouted to grant B, citing the rule and the audit case. `[needs T6, T11]` | "This item would arrive in the grant's last 90 days, so it's rerouted to a grant with time left, with the rule and the audit case cited." |
| 1:12–1:30 | Invoices: canceled-order invoice red, timeline expanded. Cut to Inbox: grant manager rejects with a reason. `[needs T12, T17]` | "An invoice for a canceled order: each record looks fine, the timeline doesn't. It's held for the grant manager, who has to give a reason." |
| 1:30–1:50 | Payment requests: draft justification with the character count; follow-up question and drafted answer listing exact purchases. `[needs T13]` | "Every federal payment request now needs a written justification. GrantGuard drafts it from the purchase records, leaves out anything on hold, and answers the government's follow-ups." |
| 1:50–2:02 | Reports: paper credits the wrong grant; proposed cost move with days left. `[needs T14]` | "It checks the lab's progress report too: this paper credits the wrong grant, and here's how long we have to fix the charge." |
| 2:02–2:17 | Log window, then a self-approval attempt rejected by the database (e.g. an agent tries to approve its own payment request; error shown). `[needs T6, T7]` | "Each agent logs in as itself. The database, not the prompt, stops anyone approving their own work, and every action has a reason in the log." |
| 2:17–2:35 | Test lab scorecard, full screen. `[needs T19]` | "Proof it works: [N] planted mistakes from real audits plus decoys. Caught [N], missed [N], false alarms [N]. It runs on every build." (Fill from the recorded screen.) |
| 2:35–2:45 | Real vs simulated table (from the Devpost draft) as a card, then the repo URL. | "Real NIH grant records and Claude; simulated lab, invoices and funder. Code and the answer key are on GitHub." |

Video fallbacks: if a step isn't built, cut its row and say nothing about it
in narration. Don't stage a fake screen. If a step is faked with fixture
data, the caption says "fixture data".

---

## (c) "Try your own scenario" playbook

Hyphenate: "We may ask you to try a scenario of our own." Everything goes
through the Requests window or the Test lab, the same pipeline as the demo.
Say what you expect before you click, then let the result speak.

| Judge asks | Do this | Expected result |
|---|---|---|
| "Buy something on grant X." | Requests: type their item, price, grant, purpose. `[needs T11]` | Allowed and bought, blocked, rerouted, or sent to the Inbox, each with the rule cited. |
| "Make it expensive." | Same, over the card limit. | Goes to the Inbox; judge decides with a reason. |
| "What if the grant ends next month?" | Test lab: fast-forward the clock into the last 90 days, then request supplies. `[needs T18]` | Blocked or rerouted, citing the 90-day rule and audit precedent. |
| "Cancel a different grant." / "Restore it." / "Pay it." | Test lab: drop the event on grant B. | Freeze on cancel; still frozen on court order; unfreezes on payment. |
| "The sources disagree." | Test lab: one source says active, another canceled. `[needs T10/T18]` | Flag raised, spending frozen, Inbox asks which source is right. |
| "Send a weird invoice." | Test lab: invoice for a canceled order or a different amount. `[needs T12]` | Held with the mismatch and timeline spelled out. |
| "Ask it why." | Log: click "why?" on any row, including old ones. | Rule, source and person behind the decision. |
| "Can the agent approve its own work?" | Try it (Test lab or a scripted call). `[needs T6]` | Rejected by the database, with the error shown. |
| "Say no to it." | Inbox: reject with a reason. | Action doesn't happen; the agent replans or stops; Log shows the reason. |
| Something we can't handle | Say so plainly: "That's outside what we built this weekend; here's what it would do..." | Honesty beats a broken demo. |

Rules for the driver: type their wording as given; don't pre-clean it. If
Claude is slow, narrate the Log while it works. If an outside API is down,
the cache answers; say "cached lookup".

---

## (d) Pre-record checklist

Build state:
- [ ] Fresh `git pull` on the recording machine; check command passes `[TBD: command from T2]`.
- [ ] Scorecard numbers on screen come from that same run; note the commit hash in `PROGRESS.md`.
- [ ] Walk the live script top to bottom once; mark every row that doesn't run and cut it from both scripts.
- [ ] All outside lookups cached (RePORTER, USAspending, PubMed, Crossref, Apify output); demo works with Wi-Fi off.
- [ ] Seed reset to the "before cancellation" state; a one-command reset exists `[TBD]`.

Screen:
- [ ] Browser zoom so table text is readable at 1080p; dark/light mode chosen and consistent.
- [ ] Close other tabs, Slack, notifications (Do Not Disturb on).
- [ ] No API keys, `.env.local`, or terminal history with secrets visible.
- [ ] Real names of private people nowhere on screen; Reddit quotes credited by role only.

Content:
- [ ] Video opens on the frozen grant, not a title card.
- [ ] Under 3:00. Every number spoken matches the screen.
- [ ] *Thakur v. Trump* line matches the docket check (MASTER-PLAN §10, item 1).
- [ ] Any fixture-data step is captioned as such.

Upload:
- [ ] YouTube, public or unlisted, link pasted into Devpost; play it logged-out to confirm.
- [ ] Devpost has the project image and the GitHub link (both required).
- [ ] Laptop at the table has the video open in a tab as the fallback.
