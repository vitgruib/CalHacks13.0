# CalHacks 13.0

_One-line pitch: TBD_

## Team setup (once per person, ~2 min)

```sh
git clone https://github.com/vitgruib/CalHacks13.0 && cd CalHacks13.0
git config pull.rebase true        # rebase only your unpushed commits on pull
git config rebase.autoStash true   # don't block pulls on uncommitted work
git config rerere.enabled true     # reuse conflict resolutions
cp .env.example .env.local         # then fill in keys shared out-of-band
```

Point your agent at the repo. Claude Code reads `CLAUDE.md`, and Codex,
Cursor, and others read `AGENTS.md` (same rules). Each session, tell your
agent who you are, e.g. "I'm @alex; pick up the next task in TASKS.md."

## How we coordinate

| File | What it's for |
| --- | --- |
| `AGENTS.md` | Rules every agent follows: claiming, lanes, pushing, priorities |
| `TASKS.md` | Who's doing what right now. Claim before starting |
| `PROGRESS.md` | Append-only log of what landed and how it was verified |
| `DECISIONS.md` | Contract/stack/scope changes other lanes need to know about |
| `HUMAN_TODO.md` | Things only humans can do (keys, deploy, demo, Devpost) |

Golden rules: contracts and stubs first so every lane can run in parallel,
claim first, stay in your lane, unblock others before your own work, never
sit blocked (stub it and move on), never push red, never force-push, demo
path first.

## Run

TBD
