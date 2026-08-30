# Linear — how and when

Tracker: Linear workspace **Data Smarts**, project **War Room**. One tracker for the
whole system (both repos — this doc lives in each).

**The log and the law.** Linear is the log: past, present, and future work, and the
record of decisions. The workflows and CLAUDE.md are the law: how to behave at run
time. A decision is not done until its consequence lives in the file the agent reads.

## When to file

- Any non-trivial unit of work — before starting it, or the moment it is discovered
  and deferred. Past, present, and future all live here.
- Bugs, ideas, and follow-ups noticed mid-run. Filing takes ten seconds; losing one
  costs an Appendix C.
- Decisions worth remembering: file it, label `decision`, close it immediately —
  after folding the consequence into the workflow or doc it governs.
- **Skip**: typos, one-liners, doc touch-ups — anything where the issue would just
  restate the diff.

## How to file

- Title: `[Area] What changes` — `[Discovery] Sweep grid composer`,
  `[UI] Shortlist gate view`.
- Body: two sentences — what and why. Acceptance criteria only when they are not
  obvious from the title. No template.
- One issue = one shippable slice. Not `build discovery` (too big), not
  `create table` (too small).
- Project **War Room**, assignee Jesús, label `bug` / `feature` / `decision` —
  nothing else. No estimates, no cycles, no priorities unless one is screaming.

## States are the status

`Backlog → Todo → In Progress → Done` (or `Canceled` / `Duplicate`). Never narrate
progress in comments when a state change says it. Comments exist for exactly three
things: a blocker, a scope change, the closing note.

## Branches keep main safe

- Code changes ride a branch named after the issue: `<issue-id>-<slug>`
  (e.g. `war-12-sweep-grid`, lowercased team id + number).
- `main` always works. Merge only when it builds and runs. PRs are optional — open
  one when you want a preview deploy or a diff to stare at, not as ceremony.
- Put the issue ID in commit messages (`WAR-12: …`) so the trail survives the merge.

## Closing

Close with one comment saying what shipped, when the work is merged and true. If the
issue taught something, the lesson goes into the workflow **before** the close.
Wrong or superseded → `Canceled`; already exists → `Duplicate`. Never `Done` for
work that didn't happen.

## Agent operations

The agent files, updates, and closes issues via `tools/linear.py` in the private
repo (`LINEAR_API_KEY` in the SOPS-encrypted env). Session start: look at
`In Progress` and `Todo`. Session end: states accurate, nothing important unfiled.
