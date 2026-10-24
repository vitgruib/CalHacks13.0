# Architecture: tech stack, identities and where tokens live

Snapshot of `main` on Sat 10/24. Sources: `README.md` (Deploys),
`DECISIONS.md`, `agents/README.md`, `server/src/index.ts`,
`agents/src/identity.ts`, `web/src/data/live.tsx`, `deploy/`,
`.github/workflows/`. If one of those changes, update this page.

## 1. The stack

```mermaid
flowchart TB
  subgraph Browser["Browser · Vercel (calhacks130.vercel.app)"]
    WEB["web/ · Vite + React 19 + TS<br/>Grant office portal · Researcher portal · Test lab"]
  end

  subgraph Maincloud["SpacetimeDB maincloud · v2.13.0"]
    MOD["server/ module 'grantguard' (TypeScript)<br/>tables + reducers · rules.ts enforces every rule"]
  end

  subgraph VM["Azure VM grantguard-agents · systemd · Node 22 + tsx"]
    WORKER["agents/ worker · ask() wrapper"]
    PUR["purchasing agent"]
    BOOK["bookkeeping agent<br/>(fund tracker + invoice check)"]
    PAY["payment_report agent<br/>(payment requests + report checker)"]
    WORKER --- PUR & BOOK & PAY
  end

  subgraph AI["Claude"]
    CACHE[("agents/cache/claude/<br/>saved answers (committed)")]
    CLAUDE["Anthropic API<br/>VM: claude-haiku-5-5 · default: claude-sonnet-5-5"]
  end

  subgraph Sources["Outside data"]
    REP["NIH RePORTER"]
    USA["USAspending"]
    ACTOR["Apify Actor (scrapers/)<br/>nih-grant-cancellation-list"]
    XREF["Crossref · PubMed/PMC"]
  end

  WEB <-->|"websocket: subscriptions + reducer calls"| MOD
  MOD <-->|"websocket: one identity per agent"| WORKER
  WORKER -->|"1. saved answer?"| CACHE
  WORKER -->|"2. else ask Claude (3. else fallback)"| CLAUDE
  BOOK -->|"daily · Check now · before money moves"| REP & USA & ACTOR
  PAY -->|"papers in progress reports"| XREF

  subgraph Offline["Runs on a laptop, no server"]
    SIM["sim/seed.json + answer-key.json"] --> EVAL["eval/ scorecard<br/>replays seed through real module + agents"]
    HERO["hero/ · R3F mockups"]
  end
```

Key design points:

- **Rules live in the database, not in prompts.** Agents report facts
  (`evaluate_request`, `check_invoice`, `record_paper_facts`,
  `post_status_event`); the module applies `server/src/rules.ts` and raises
  the Inbox item. A buy on a frozen grant fails whatever an agent says.
- **Claude only reads, matches and explains.** Every `ask()` has a
  deterministic fallback, and answers are saved in `agents/cache/claude/`, so
  the demo runs with no key and no network.
- **Offline mode everywhere.** `GG_DB=local` runs the real module in-process
  on `sim/seed.json`; the web app falls back to the same seed ("Offline demo
  data") if maincloud is unreachable.

### Deploy pipeline

```mermaid
flowchart LR
  PUSH["push to main"]
  PUSH -->|"touches server/"| PM["publish-module.yml<br/>server check → deploy/publish-module.sh"] --> MC["maincloud 'grantguard'"]
  PUSH -->|"touches agents/ server/ sim/"| DA["deploy-agents.yml<br/>SSH → deploy/agent-worker/update.sh"] --> AZ["Azure VM: pull, install, restart"]
  PUSH -->|"Vercel git integration"| VC["Vercel builds web/"]
```

## 2. Who is who: identities and what each may call

Every actor is a SpacetimeDB **identity** bound to exactly one role, once
(`register_agent` / `register_person`). The module checks the caller's role
on every reducer, so segregation of duties is enforced by the database.

```mermaid
flowchart TB
  subgraph Agents["AI agents (agents/src/roles.ts) · register_agent"]
    A1["purchasing<br/><i>seat: purchasing</i>"]
    A2["bookkeeping<br/><i>seat: grant accountant</i>"]
    A3["payment_report<br/><i>seat: payment and report preparer</i>"]
  end
  subgraph People["People (browser) · register_person"]
    P1["grant_manager"]
    P2["scientist (one per researcher)"]
  end

  A1 --> R1["evaluate_request · act_on_request"]
  A2 --> R2["post_source_reading · post_status_event · raise_flag<br/>check_invoice · complete_check"]
  A3 --> R3["draft_payment_request · draft_follow_up_answer<br/>record_paper_facts"]
  Agents --> R4["raise_hold (any agent)"]
  P1 --> R5["decide_hold · unfreeze_grant · ask_follow_up"]
  P1 & P2 --> R6["submit_request"]
  People --> R7["Test lab: set_today · advance_days · inject_* · load_seed<br/>reset_world · clear_world · cancel_order · push_back"]
  Agents & People --> R8["request_check (anyone registered)"]
```

| Agent | Code | Claude tasks (`ask()` → `agents/cache/claude/<task>-*.json`) |
|---|---|---|
| purchasing | `agents/src/agents/purchasing.ts` | `purchasing.read`, `purchasing.explain` |
| bookkeeping | `agents/src/agents/bookkeeping.ts` (fund tracker), `invoices.ts` | `invoices.note` (the tracker itself is deterministic: `tracker/compare.ts`) |
| payment_report | `agents/src/agents/payment-requests.ts`, `report-checker.ts` | `payment_request.explain`, `payment_request.follow_up`, `report-checker.explain`, `report-checker.correction` |

## 3. Where every token and secret is stored

```mermaid
flowchart LR
  subgraph Laptop["Dev laptop"]
    ENV[".env.local (git-ignored)<br/>ANTHROPIC_API_KEY · APIFY_TOKEN"]
    ST["agents/.state/&lt;db&gt;/&lt;role&gt;.token<br/>(git-ignored, mode 600)"]
    CLI["~/.config/spacetime/cli.toml<br/>spacetimedb_token (owns maincloud db)"]
  end
  subgraph VMbox["Azure VM"]
    VENV["/etc/grantguard/agents.env<br/>ANTHROPIC_API_KEY · APIFY_TOKEN · GG_MODEL=haiku"]
    VST["/var/lib/grantguard-agents/state/&lt;db&gt;/&lt;role&gt;.token<br/>owns the 3 agent roles on maincloud"]
  end
  subgraph GH["GitHub repo secrets"]
    S1["SPACETIMEDB_TOKEN"]
    S2["AZURE_VM_HOST · AZURE_VM_SSH_KEY · AZURE_VM_USER"]
  end
  subgraph BR["Each viewer's browser"]
    LS["localStorage<br/>grantguard.token.&lt;person&gt;.&lt;uri&gt;.&lt;db&gt;"]
  end
  S1 -->|"publish-module.yml"| MCDB["maincloud 'grantguard'"]
  S2 -->|"deploy-agents.yml SSH"| VMbox
  VST -->|"withToken()"| MCDB
  LS -->|"withToken()"| MCDB
  VENV --> ANTH["Anthropic API"]
```

| Credential | What it is | Stored | Committed? |
|---|---|---|---|
| Agent tokens (×3) | SpacetimeDB identity of `purchasing`, `bookkeeping`, `payment_report`; restarts reuse it, so roles stay bound | VM: `/var/lib/grantguard-agents/state/<db>/<role>.token`. Laptop: `agents/.state/<db>/<role>.token` (`GG_STATE_DIR`). `GG_DB=local`: in memory only | No (git-ignored, outside the checkout on the VM) |
| Person tokens | Identity of the grant manager and each researcher | Browser `localStorage`, key `grantguard.token.<who>.<uri>.<db>`; a stale one is dropped and re-registered | No |
| `ANTHROPIC_API_KEY` | Claude for the agents | Laptop `.env.local`; VM `/etc/grantguard/agents.env` | No |
| `APIFY_TOKEN` | Read/start the cancellation-list Actor | Same as above; sent as a header, never saved | No |
| `SPACETIMEDB_TOKEN` | Owner of the maincloud database; only it can republish | GitHub secret; owner's `~/.config/spacetime/cli.toml` | No |
| `AZURE_VM_SSH_KEY` (+ host, user) | Lets the Action SSH into the VM | GitHub secrets | No |
| Saved Claude answers | Not a secret: deterministic demo replay, keyed by model | `agents/cache/claude/` | **Yes** |
| Saved source answers | Public RePORTER / USAspending / Crossref / PubMed responses | `agents/cache/*.json` | **Yes** |

Notes:

- Tokens are kept **per database** (folder or key includes the db/uri), so a
  local token is never sent to maincloud.
- The VM's agent tokens hold the three agent roles on maincloud. Don't run the
  worker against maincloud from a laptop: it would get new identities and
  `register_agent` refuses a role already taken.
- Every variable name is listed in `.env.example`; values never go in git.
