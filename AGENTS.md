# Agent instructions — CalHacks 13.0

Several humans, each driving one or more coding agents, share this repo and
push to `main` for the whole event. These rules exist so nobody's agent
stomps on anybody else's. They apply to every agent (Claude Code, Codex,
Cursor, Gemini, ...). `CLAUDE.md` just imports this file.

If a rule here conflicts with a user's personal/global instructions, **this
file wins inside this repo**.

## 0. Project facts (fill in at kickoff, keep current)

- **What we're building (one sentence):** TBD
- **The demo path (the 3-minute story judges see):** TBD
- **Stack:** TBD
- **Run locally:** TBD (e.g. `./run.sh`)
- **Check command (must pass before every push):** TBD (e.g. `npm run check`)
- **Submission deadline:** TBD — hard stop on new features 2h before it.
- **Shared contracts file(s):** TBD (e.g. `lib/schema.ts`, `api/openapi.yaml`)

If this section still says TBD when you start a task, ask your human to fill
it in before writing code.

## 1. Before you start any task

1. `git pull` (it's configured to rebase; see README setup).
2. Read `TASKS.md`, the last ~20 lines of `PROGRESS.md`, and `DECISIONS.md`.
3. **Claim the task**: in `TASKS.md`, move it to *In progress* with
   `@<human>/<agent>` and the files/dirs you expect to touch. Commit and push
   **just that claim** right away (`chore(tasks): claim <task>`). If the push
   is rejected, pull and re-read — someone may have claimed it first. If so,
   pick something else.
4. If the task isn't in `TASKS.md`, add it before you start. No invisible work.

## 2. While working

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

## 3. Pushing — `main` must always run

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

## 4. When you finish (or stop) a task

1. Move it to *Done* in `TASKS.md`, or back to *Up next* with a note on
   what's left if you're stopping partway.
2. Add one entry to the bottom of `PROGRESS.md`:
   `- HH:MM @<human>/<agent> — <what changed>; <how verified>; <follow-ups>`
3. Anything only a human can do (accounts, API keys, real data, deploys
   needing login, recording the demo, Devpost) goes in `HUMAN_TODO.md`.
4. Commit and push those updates along with (or right after) the code.

## 5. Priorities and judgment

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

## 6. Final 2 hours

Feature freeze. Only fixes for the demo path, deploy, README, and submission
materials. Ask your human before anything else lands.
