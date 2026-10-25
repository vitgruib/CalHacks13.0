# Grant Test Auto interview kit (print this)

For @ethan, Sat 10/24. Two in-person jobs: **(A)** the Hyphenate booth and
**(B)** one interview with a PI or research administrator. Devpost is due
**Sun 9:00 AM**. Quotes go into Devpost and the pitch, so follow
`docs/research/README.md`. Quotes must be verbatim, attributed by role
unless the person says a name is OK, and tagged `[interview]` along with
the date.

**Drafts only.** Nothing in section C has been sent. You send each message
yourself, by hand.

---

## A. Hyphenate booth sheet

**One-line pitch:** "Grant Test Auto is an AI grant office for a university
research lab. Three agent seats (purchasing, grant accountant, and the
payment-and-report preparer) keep spending within grant rules and keep the
books reconciled across sources that disagree. They ask the human grant
manager when they should, and they log why."

**The moment (if they ask):** a court restores a canceled grant, and
Grant Test Auto still won't spend until the money actually arrives.

### What hyphenate.ai says publicly (checked Sat 10/24)

- They sell an "autonomous finance platform" for the office of the CFO. The
  target roles are the **CFO and controller**. It has five modules:
  order-to-cash, treasury, GL accounting and close, procure-to-pay, and
  reporting. It runs on top of the ERP (NetSuite and SAP are named), and
  the ledger stays the system of record. https://hyphenate.ai,
  https://hyphenate.ai/platform
- **Named customers are all commercial companies:** Kiteworks, HiBid,
  Dura Software, and Mini Melts USA (which runs SAP). The site also shows
  logos for Quantum, Eightfold.ai, Sierra, and Rently.
  https://hyphenate.ai
- **No page we read mentions nonprofit, higher-ed, university, grants,
  fund accounting, or government.** That covers the home page, the platform
  page, and the procure-to-pay page, plus one search. We read the pages;
  we did not crawl the whole site.
  https://hyphenate.ai/procure-to-pay
- Their language matches the track brief: "Audit-Ready Agents", "Every
  figure traces back to its source", and people step in "only where it
  matters." On procure-to-pay they mention PO matching, with "a person
  approving the exceptions." The page doesn't mention vendor-bank-change
  fraud.
- The company was formerly **Maximor** and rebranded as Hyphenate on about
  Oct 1, 2026. The CEO is Ramnandan Krishnamurthy. It raised a $9M seed
  led by Foundation Capital.
  https://thenextweb.com/news/maximor-rebrands-hyphenate-86x-growth-autonomous-finance

**Likely booth answer:** "Yes, any finance function counts." Higher ed is
outside their current customer base, which works for criterion 3 ("Did we
see something new?"). Expect pushback that grant work is compliance rather
than finance. Our counter: grant accounting is restricted-fund accounting.
It has a subledger per grant, a fixed spend window, and allowability rules
that work like a policy engine. It also has reimbursement drawdowns, which
are the lab's receivables.

### Questions, in priority order (stop when time runs out)

1. **Fit.** "Our company is a university research lab, and our corner is its
   post-award grant office: purchasing, grant accounting, and drawdowns.
   Does that count as a finance team for this track?"
2. **Hardest exceptions.** "Here are our exceptions: a canceled grant a court
   restores before any cash arrives; supplies bought in a grant's last 90
   days; one shared cost split across grants; and an invoice for a canceled
   order. Which of these would impress you, and which exceptions would a
   real controller say we're missing?"
3. **"Would you hire it?" and seats.** "We claim three seats: purchasing
   agent, grant accountant, and payment-and-report preparer. Is three seats
   with separate permissions the right scope? Or should we go deeper on
   one?"
4. **Real vs simulated.** "We use real public NIH and USAspending records
   for the grants. The ERP, the vendors, and the funder's follow-up
   questions are simulated, with planted errors and an answer key. Is that
   real enough? What one thing would you want to be real?"
5. **Judge scenario.** "Will you inject a scenario at judging? What kind:
   a new document, a bad data row, a human saying no, a time jump?
   Anything we should make sure the Test lab can take?"
6. **Proof.** "Is a scorecard of caught, missed, and false alarms on
   planted errors enough proof? Or do you want a public benchmark score
   too?"
7. **The moment.** "Our demo opens with the court-order-but-no-cash freeze.
   Would that make you stop and look?"

### Answers (fill in at the booth)

| # | Who answered (name / role at Hyphenate) | Answer, verbatim where you can | What we change |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |
| 6 | | | |
| 7 | | | |

Time: ______. Post the takeaways in `PROGRESS.md` and the team chat right
away. Scope changes go to the humans.

---

## B. Interview guide: PI, research administrator, or lab manager

**Who counts:** a PI, a department or central research administrator
(pre-award or post-award), someone in contracts and grants accounting, or a
lab manager or grad student who orders supplies on a grant. Grad students
and lab managers are fine for the Anthropic track ("someone who lived it").
For Microsoft and Customer Impact, aim for 2–3 people, with at least one
admin or PI.

**Consent line (read it word for word, before any questions):**

> "We're building a hackathon project about grant budgets and purchasing.
> Can I quote what you say in our public Devpost write-up and pitch? You can
> choose: (1) your name and role, (2) your role only, for example 'research
> administrator at a large public university', or (3) don't quote me, notes
> only. You can change your mind any time before tomorrow 9 AM."

Write down the level they choose **before** you start. Don't record audio
unless they say yes to that separately.

**Rules:** ask open questions, never "Wouldn't it be great if...". Ask them
about the last real time something happened, not about what usually
happens. Don't describe Grant Test Auto until the end. Write the best line down
word for word, then read it back to them.

### 10-minute version

| # | Question (open, not leading) | Pain point / feature it tests |
|---|---|---|
| 1 | "What's your role, and how many grants do you touch?" | context |
| 2 | "Walk me through the last time you needed to know how much money was left on a grant. Where did you look, and did you trust it?" | 07 balances, F2 fund tracker |
| 3 | "Tell me about the last purchase that got questioned or moved to a different grant. What happened?" | 08 unallowable / wrong grant, P2–P3 purchase rules |
| 4 | "What happens with purchases near the end of an award?" | 08 last-90-days rule |
| 5 | "When a cost is shared by two grants, how is the split decided and recorded?" | 08 shared costs |
| 6 | "Have any of your grants had their status change: terminated, suspended, reinstated? What happened to spending in between?" | 01, 02, 06, the freeze (the moment) |
| 7 | "When the award says one amount and the money actually received says another, how do you find out?" | 06 awarded vs paid |
| 8 | "How do drawdown or payment-request justifications work for you now? Any follow-up questions from the agency?" | 10, P5 payment request writer |
| 9 | "How do invoices get matched to orders? What goes wrong?" | P4 invoice check |
| 10 | "If software did part of this on its own, what would you **never** let it do without you?" | segregation of duties, "knowing when to ask" |
| 11 | *(Now show the one-line pitch.)* "What would make you trust or distrust this?" | Microsoft responsible design, Anthropic failure modes |

If they ran a finance-system migration, ask: "Did the system switch change
any of this?" (pain point 09). For people who work on progress reports:
"How do you check that the papers listed actually credit the grant?" (P7).

### 3-minute version (hallway or line)

1. Consent line (short): "Can I quote you by name, by role only, or not at
   all?"
2. "What's the most annoying part of spending grant money?"
3. "When did a grant's status or balance last surprise you?"
4. "What would you never let software do without you?"

### Quote-capture template (one block per person)

```
Who:              ____________   (leave blank if role-only or anonymous)
Role / org type:  ____________   e.g. "post-award RA, large public R1"
Date / time:      2026-10-24 __:__   Where: ____________
Permission:       [ ] name+role   [ ] role only   [ ] notes only, don't quote
Verbatim quote:   "______________________________________________"
Read back & OK'd: [ ] yes
Pain point:       [ ] 01 [ ] 02 [ ] 06 [ ] 07 [ ] 08 [ ] 09 [ ] 10 [ ] new: ____
Feature it backs: [ ] fund tracker/freeze [ ] purchase rules [ ] invoice check
                  [ ] payment requests [ ] report checker [ ] approvals/log
Surprise / contradicts us?: ____________________________________
Follow-up contact OK?: [ ] yes ________ [ ] no
```

Afterwards, type the blocks into a place the team picks. Add a quote to a
`pain-points/NN` file only at the permission level the person gave. Never
use the private name of someone who chose "role only".

---

## C. Finding interviewees fast (it's Saturday, so offices are closed)

Fastest first:

1. **Hackers in the room.** Grad students and postdocs at CalHacks often
   order lab supplies on grants. Use the Slack/Discord post below and ask
   people at nearby tables. *Best odds in the next hour.*
2. **Mentors, judges, and sponsors who used to be academics.** Ask at the
   help desk or in the mentor channel.
3. **UC Berkeley grant offices (email now; replies may come Monday).**
   SPO's own contact page says to start with your **department or unit
   research administrator**: https://spo.berkeley.edu/staff.html.
   Post-award and accounting are handled by Contracts & Grants Accounting:
   https://controller.berkeley.edu/cga/award-management/post-award-management.
   Department RA emails are often listed on department "staff" pages
   (Molecular & Cell Biology, Chemistry, and so on).
4. **Your own network.** Text any PI, lab manager, or grad student you know.
   A 5-minute phone call counts.
5. **LinkedIn.** Search for "research administrator" or "grants accountant"
   with "Berkeley", "UCSF", or "Stanford". Send the short DM.
6. **r/researchadmin** (and r/labrats for lab managers). Read the sub's
   rules first. Answers there are role-only quotes, so tag them that way.
7. **NCURA communities** (National Council of University Research
   Administrators): https://www.ncura.edu. Posting may need membership.
   Use this only if someone on the team is already a member.

### Draft: short DM (LinkedIn / Discord / text)

> Hi [name], I'm Ethan, a student at Cal Hacks this weekend. We're building
> a tool that helps research labs keep grant spending within the rules and
> see real balances. Could I ask you 4 quick questions (5 minutes, call or
> text) today or before 8 AM Sunday? Happy to keep you anonymous. Thanks!

### Draft: email (department RA / grants office)

> **Subject:** 10-minute question from a Cal Hacks student team (grant
> budgets)
>
> Hi [name],
>
> I'm Ethan Cai, on a student team at Cal Hacks 13.0 this weekend. We're
> prototyping software for a university research lab's post-award work:
> checking purchases against award terms, tracking real balances (awarded
> vs. received vs. spent), and drafting drawdown justifications, always
> with a human grant manager approving.
>
> Would you be open to a 10-minute call before Sunday 8 AM, or a few lines
> by email? I'd like to know where this work actually hurts and what you'd
> never let software do on its own. Your answers can be anonymous, role
> only, or not quoted at all; your choice.
>
> Thank you,
> Ethan Cai · [phone] · [email]

### Draft: Slack / Discord post (hackathon channel)

> **Grad students / postdocs / lab managers:** do you buy lab supplies on
> a grant? Our team is building an AI grant office (Grant Test Auto). We'd love
> 5 minutes of your stories about grant balances, purchases getting
> bounced, or end-of-award spending. Anonymous is fine. DM me or come to
> table [##]. We have snacks/stickers to trade. 🙏

---

## D. After each conversation (2 minutes)

- [ ] Quote typed up verbatim, with its permission level and a pain-point tag
- [ ] Anything that contradicts our assumptions gets flagged to the team
      right away
- [ ] One line in `PROGRESS.md` ("interviewed 1 post-award RA; quote
      captured; role-only")
- [ ] Thank-you message sent (by you)
