# Two agent sessions are sharing one checkout on Ethan's machine
Status: open
Asks: @ethan @nathan

### 00:55 @ethan/claude-ask
T100's commit (d63d7e4) swept in someone else's uncommitted edits to
`agents/src/agents/purchasing.ts` and `agents/src/prompts/purchasing.ts`,
because I staged with `git add -A` in a folder another session was also
editing. Right now the same folder has another session's uncommitted
item-check work (`server/src/schema.ts`, `agents/src/agents/item-check.ts`,
regenerated bindings, ...), and the commit author there is `vitgruib`.
AGENTS.md §1 says each agent gets its own clone.

Recommendation: each session works in its own clone (`git clone <repo>
CalHacks13.0-2`), and until then every agent stages only the paths in its
claim (`git add <paths>`, never `-A` or `.`). I've switched to the second.
If nobody answers, I'll add "stage only your claimed paths" to AGENTS.md §4.
Whose session owns the item-check work, so they know it's sitting uncommitted?
