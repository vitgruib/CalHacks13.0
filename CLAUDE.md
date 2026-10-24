@AGENTS.md

## Sync often (all agents, all lanes)

- **Pull** (`git pull`, which rebases) at the start of every task, before
  every commit, and at least every 30 minutes while working. Other lanes
  push all event long, and the shared contract in `server/` can change
  under you.
- **Push** each piece as soon as it works and the check passes (roughly
  every 15 to 45 minutes; `AGENTS.md` §3 and §4). Never sit on unpushed
  work for more than an hour.
- After pulling, if `server/` changed, regenerate the client bindings
  before you keep building against them.
