# Agent instructions — CalHacks 13.0

Several humans, each driving one or more coding agents, share this repo and
push to `main` for the whole event. These rules exist so nobody's agent
stomps on anybody else's. They apply to every agent (Claude Code, Codex,
Cursor, Gemini, ...). `CLAUDE.md` just imports this file.

If a rule here conflicts with a user's personal/global instructions, **this
file wins inside this repo**.

## 0. Project facts (fill in at kickoff, keep current)

- **What we're building (one sentence):** Grant Test Auto, the interface
  between a university lab's researchers and its grant office: agents track
  every grant's money and status and check invoices; the grant manager
  approves every request and invoice (T108, no purchasing agent). Payment
  requests and progress reports are out of scope (T105). Full scope, owners and kickoff prompts: `docs/MASTER-PLAN.md`.
- **The demo path (the 3-minute story judges see):** a grant is canceled
  and spending freezes; a court restores it, but Grant Test Auto flags spending
  until the money actually arrives, then the grant manager can approve it. Then an invoice for a
  canceled order is held, and the scorecard shows results on planted
  mistakes (`docs/MASTER-PLAN.md` §5).
- **Stack:** backend = **SpacetimeDB** (see `DECISIONS.md`); pinned
  at **2.13.0** (npm `spacetimedb` and the CLI);
  module language **TypeScript** (`server/src/`). The agent loop runs in a separate worker that
  connects as a client. Model = Claude. Everything else TBD.
- **Track priority:** maximize the chance of winning *anything*. Tracks with
  more placing prizes beat tracks with one big prize.
- **Run locally:** `npm --prefix server run dev` (starts local SpacetimeDB,
  publishes `grantguard`, regenerates client bindings; `-- --reset` wipes
  data). Needs the SpacetimeDB CLI: `curl -sSf https://install.spacetimedb.com | sh`
- **Check command (must pass before every push):** `./check.sh` (runs
  `npm run check` in `server/`, `agents/`, `web/`). Docs-only pushes need no check
- **Submission deadline:** Devpost, **Sun 10/25 9:00 AM** (no late entries).
  Feature freeze 7:00 AM. Draft submission up by Sat night. Judging is
  10:30–12:30 with the whole team present and a live demo.
- **Target tracks:** Hyphenate (primary) plus stackable tracks. See
  `docs/HYPHENATE.md` and `docs/TRACKS.md`. Every feature should
  serve the primary track's judging criteria.
- **Research / evidence:** pain points, user quotes and sources live in
  `docs/research/`. Read `docs/research/README.md` before citing a claim or
  adding research; it sets the evidence and verification rules.
- **Event rule:** all project code must be written *after* hacking opens.
  Planning docs are fine, but no code before the start.
- **Shared contracts file(s):** the SpacetimeDB schema and actions in
  `server/` (Track A, @suhu, owns them; T3 in `TASKS.md`). Exact file names
  land with T3.

If this section still says TBD when you start a task, ask your human to fill
it in before writing code.

## 1. Parallel distribution: nobody waits

The goal is for every human and every agent to always have unblocked work.
What slows a team down is almost never typing speed. It's waiting on another
lane, merge conflicts, and waiting on humans. Every rule below attacks one
of those.

### Kickoff (first ~45 min)

1. **Cut lanes along file boundaries.** Agree on the demo path, then split it
   into lanes (e.g. UI, API/backend, AI pipeline, data/fixtures,
   deploy/infra). Give each lane one owning human and a set of directories
   that no other lane shares. Record this in the *Lanes* table in `TASKS.md`.
2. **Contracts first, the only serial step.** One agent writes the shared
   contracts file(s), realistic fixture data, and stub implementations that
   return those fixtures. They should land within ~30 min. Meanwhile, the
   other lanes do setup, research, and scaffolding inside their own
   directories only. After that, every lane builds against the stubs and
   never waits on a real implementation.
3. **Scaffold once.** One agent creates the project skeleton and check
   command. Nobody else runs a project generator.
4. **Start slow external things now**, in parallel: API key or access
   approvals, deploy setup, model and dataset downloads, sponsor-tech signup.
   Each goes in `HUMAN_TODO.md` with an owner.

### Writing tasks

- **Size:** 30–90 min of agent work, with a checkable `done when:` line.
  Split anything bigger before claiming it.
- **Tag each task** with an ID (`T12`), its lane, `needs:` (IDs it depends
  on, or `—`), and ★ if it's on the critical path to the demo.
- A task is **ready** when everything in its `needs:` is done *or stubbed*.
  Write tasks so they can be finished against the contract alone. A task
  that needs another lane's real code is a planning smell, so split it.
- Prefer vertical slices within your lane over horizontal layers that drag
  in other lanes.
- **Keep the queue full:** each lane should have ≥2 ready tasks in *Up
  next*. Whoever notices one running low adds tasks. Agents may propose and
  add tasks for their own lane.

### Picking work (agents, in this order)

1. **Unblock others first.** Do any *Requests* entry aimed at your lane, or
   any task that's listed in someone else's `needs:`. Unblocking a teammate
   beats your own progress.
2. Ready ★ tasks in your lane.
3. Other ready tasks in your lane.
4. Ready tasks in a lane whose owner is busy. Get the owner's OK via a
   *Requests* note or your human, and claim the files first.
5. If nothing is ready, refill the queue: write tasks, fixtures, or demo-path
   smoke tests, then pick one.

**Never sit blocked.** If a dependency isn't ready, stub it against the
contract, note `stubbed: <what>` on your task, and keep going. If that's
impossible, release the task with a note, log the blocker under *Requests*,
and pick the next one. **WIP limit: one claimed task per agent.**

### Removing hidden serial points

- **Hot files** (router/registry, root layout, app entry point, shared
  config, package manifest): keep edits as tiny additive lines, and commit
  and push them immediately. Never sit on an uncommitted diff to a hot file.
  Prefer one file per route, component, or tool, so new features register
  without touching shared files.
- **Humans are the scarcest resource.** Batch your questions. Give each
  question a recommended default. If the choice is easy to reverse, proceed
  on the default (or switch to another task) while waiting. Don't block on
  an answer.
- **Swap stubs promptly.** When a real implementation lands, its owner
  replaces the stub at the call sites in the same or the next commit, then
  runs the demo path end to end.
- **Integration check** roughly every 2 hours: whoever is least loaded runs
  the full demo path on fresh `main` and logs the result in `PROGRESS.md`.
  Breakages become ★ tasks.

### Multiple agents per human

Run extra agents only on disjoint sub-areas of your lane. Give each agent its
**own clone** (`git clone <repo> CalHacks13.0-2`), never a shared checkout,
plus its own tag (`@alex/claude-2`) and its own claim.

### Rebalancing

When a lane runs dry, or at each integration check, the humans look at
`TASKS.md` and move people toward the critical path: the longest remaining
chain of ★ tasks. A lane that finishes early takes over tasks from the
busiest lane, with that owner's OK.

## 2. Before you start any task

1. `git pull` (it's configured to rebase; see README setup).
2. Read `TASKS.md`, the last ~20 lines of `PROGRESS.md`, and `DECISIONS.md`.
   Read `docs/HYPHENATE.md` once per session: every feature should serve
   its judging criteria.
   Run `./whiteboard.sh @<human>/<agent>` and answer every thread listed
   under *Waiting on you* before you start (`whiteboard/README.md`).
3. Pick the next task using the order in §1 (*Picking work*). It must be
   **ready**.
4. **Claim the task**: in `TASKS.md`, move it to *In progress* with
   `@<human>/<agent>` and the files/dirs you expect to touch. Commit and push
   **just that claim** right away (`chore(tasks): claim <task>`). If the push
   is rejected, pull and re-read — someone may have claimed it first. If so,
   pick something else. Put your card in `whiteboard/now/` (what you're
   doing, the files) in the same commit.
5. If the task isn't in `TASKS.md`, add it (with ID, lane, `needs:`)
   before you start. No invisible work.

## 3. While working

- **Stay in your lane.** Only edit the files/dirs you listed in your claim.
  If you need to change something outside it, check `TASKS.md` for whoever
  owns that area; if it's claimed, leave a note under *Requests* in
  `TASKS.md` instead of editing it. If nobody holds it, update your claim
  first.
- **Shared contracts are special.** Types, API shapes, DB schema, and env
  var names in the shared contracts file(s) are what lets lanes work in
  parallel. Prefer *adding* fields over renaming/removing. Any breaking
  change needs a line in `DECISIONS.md` and a fix for every caller in the
  same commit.
- **Keep the Rules page current.** The grant office's Rules page
  (`web/src/windows/Rules.tsx`, `#rules`) lists every check a purchase
  request goes through. When you add, remove or change one (a spending rule
  in `server/src/rules.ts`, a limit in `vocab.ts`, or an agent check such as
  the item check in `agents/`: what it checks, a threshold, or what happens
  when it fails), update that page in the same commit, whichever lane you're in.
- **Talk on the whiteboard** (`whiteboard/`). Start a thread, naming who
  you need in `Asks:`, when you're about to make a choice another lane will
  live with, when you disagree with how something works, or when you're
  stuck and want ideas. Each time you pull, run `./whiteboard.sh
  @<human>/<agent>` and reply to anything waiting on you or touching your
  files: agree, push back with evidence, or say it isn't yours. Keep posts
  short and end with a recommendation. A thread doesn't replace a
  *Requests* entry when someone has to act, or `DECISIONS.md` once settled.
- **Mock across boundaries.** If the thing you depend on isn't built yet,
  code against the contract with a stub/fixture. Don't wait and don't build
  it yourself.
- **No drive-by changes.** Don't reformat, rename, "clean up", or upgrade
  dependencies in code you aren't working on. Don't change lint/format/build
  config without a `DECISIONS.md` entry.
- **Dependencies:** adding one is fine. Commit the lockfile with it. On a
  lockfile merge conflict, take `origin`'s version and re-run the install.
  Don't hand-merge it.
- **Secrets:** never commit them. Real values go in `.env.local` (ignored).
  Add every new variable *name* to `.env.example` with a comment.
- **Small commits, pushed often.** Commit and push each piece as soon as it
  works (roughly every 15–45 min). Small diffs make conflicts rare and cheap.
  Conventional prefixes: `feat:`, `fix:`, `chore:`, `docs:`.

## 4. Pushing — `main` must always run

- Run the check command (§0) **after** pulling the latest `main` and
  **before** every push. Never push red. If `main` is already red and it
  isn't your fault, say so in `PROGRESS.md` and tell your human. Don't push
  on top of it unless your commit is the fix.
- On a rejected push: `git pull --rebase`, re-run checks, push again. Resolve
  conflicts so that **both** sides' intent survives. If you can't tell what
  the other side meant, stop and ask your human.
- **Never** force-push, `reset --hard`, rewrite pushed history, delete
  branches, or `git clean`. No long-lived branches: everything lands on
  `main`.

## 5. When you finish (or stop) a task

1. Move it to *Done* in `TASKS.md`, or back to *Up next* with a note on
   what's left if you're stopping partway.
2. Add one entry to the bottom of `PROGRESS.md`:
   `- HH:MM @<human>/<agent> — <what changed>; <how verified>; <follow-ups>`
   Update your whiteboard card (or delete it when your session ends), and
   post the outcome in any thread your task settled.
3. Anything only a human can do (accounts, API keys, real data, deploys
   needing login, recording the demo, Devpost) goes in `HUMAN_TODO.md`.
4. Commit and push those updates along with (or right after) the code.

## 6. Priorities and judgment

- **The demo path beats everything.** A working end-to-end path with fake
  data is worth more than one polished component. Build the thin vertical
  slice first, then make it deeper.
- **Timebox.** If something takes ~45 min longer than expected, stop. Write
  down what you tried in `PROGRESS.md` and ask your human whether to keep
  going, cut it, or fake it for the demo.
- **Product and scope decisions belong to the humans.** Raise them; don't
  just pick one. Small technical choices are yours: make them, and log the
  ones others need to know about in `DECISIONS.md`.
- **Testing:** smoke-test the demo path, and add focused tests for the
  tricky logic (parsers, scoring, anything with edge cases). Skip
  exhaustive suites. Manually run the actual feature before calling it done.
- **Be honest in `PROGRESS.md`.** "Works with fixture data, untested against
  the live API" is useful. "Done" when it isn't costs the team the demo.

## 7. Final 2 hours

Feature freeze. Only fixes for the demo path, deploy, README, and submission
materials. Ask your human before anything else lands.
