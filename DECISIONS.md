# Decisions

Anything another lane needs to know: contract changes, stack choices, config
changes, cut features. Newest at the bottom.
`- HH:MM @human — decision — why`

- Fri @ethan — Track eliminations recorded in `docs/TRACKS.md` (SpaceXAI, Meta, Mana, Notability, Creao 1-person, Solo/Hardware/Planet, Bitdeer, Moss). Visa kept open. — ineligible or off-theme for a finance-autonomy build
- Fri @ethan — Visa and Figma tracks also cut. — team decision
- Fri @ethan — No voice agents *for now*: idea #5 (collections voice desk) set aside. — team decision
- Fri @ethan — ~~Backend, if we need one, is **SpacetimeDB**.~~ *Superseded below.* — keeps the company world, ledger and audit trail in one real-time store with server-side rule enforcement; also qualifies us for the Spacetime track
- Fri @ethan — Factory Droid: stretch goal only. Use it as an automated rule-writing seat once the core works. — $2k track, but it shouldn't sit on the critical path
- Fri @ethan — Stretch goals: **voice (Cartesia)** and **Droid**. Only start them after the core demo path works, and keep each behind an interface the core doesn't need. — team decision
- Fri @ethan — Atlassian Agentic Workforce is a **stretch goal**: a Forge app with Jira escalations/approvals + Confluence policy pages, behind an adapter; SpacetimeDB stays the system of record. — team decision
- Fri @ethan — Creao tracks cut. — a Creao-built agent must do the core work, which conflicts with Claude + our backend
- Fri @ethan — **Backend is Convex, not SpacetimeDB.** — Convex's prize is $5k cash to one team vs Spacetime's $3.6k split three ways. Convex actions call Claude directly, its scheduler/crons drive autonomous work + simulated time, and coding agents write Convex reliably (SpacetimeDB 2.0 is an RC with syntax churn). Speed and demo reliability protect the $8k Hyphenate entry. Tradeoff: more teams will enter Convex. Segregation of duties is enforced in mutations, with each seat calling under its own identity.
- Fri @ethan — Coinbase x402 cut. — team decision
