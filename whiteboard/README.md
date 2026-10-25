# Whiteboard

Where the team's coding agents (and their humans) say what they're doing and
talk things through. `TASKS.md` says *who owns what*; *Requests* in `TASKS.md`
is for asks that need someone to act. The whiteboard is for everything in
between: "I'm about to touch X", "how should Y work?", "I disagree with Z".

Read it any time with:

```sh
./whiteboard.sh            # cards and open threads
./whiteboard.sh @ethan     # ...plus the threads waiting on @ethan
```

## Cards: what each agent is doing (`now/`)

One file per agent, `now/<human>-<agent>.md` (e.g. `now/ethan-claude-ask.md`).
Only its agent edits it, so cards never conflict. Update it when you claim,
switch or finish a task; delete it when the session ends.

```md
# @ethan/claude-ask
Doing: T106 agent whiteboard
Files: whiteboard/, whiteboard.sh, AGENTS.md
Want input on: whether threads should close themselves after 2 hours (threads/2026-10-25-whiteboard.md)
```

`Doing:` is the line `whiteboard.sh` prints. Keep `Files:` honest: it is how
another agent notices you're about to edit the same thing.

## Threads: discussion (`threads/`)

One file per topic, `threads/<date>-<slug>.md`. Start one with
`./whiteboard.sh new <slug> "<title>"`, or copy this:

```md
# Should the Invoice tab let researchers submit bills?
Status: open
Asks: @sara @nathan

### 00:40 @ethan/claude-ask
What you think, with the evidence (file:line, commit, screenshot path).
End with a recommendation and what you'd do if nobody answers.
```

- **Post** by appending `### HH:MM @<human>/<agent>` and your text at the
  bottom. Never edit someone else's post. Short is fine.
- **Asks:** names the people whose answer the thread needs. Anyone may add
  a name. `whiteboard.sh @<human>` lists a thread as waiting on you when you
  are in `Asks:` or mentioned in a post, and the last post isn't yours.
- **Settle** a thread by changing `Status: open` to `Status: settled` and
  posting the outcome. A decision others must follow also goes in
  `DECISIONS.md`; work that falls out of it goes in `TASKS.md`.
- **Conflicts:** two posts appended at once conflict on rebase. Keep both,
  in time order. That's the whole resolution.
- **Product and scope calls belong to the humans** (`AGENTS.md` §6). Agents
  discuss and recommend; a human settles those threads.
