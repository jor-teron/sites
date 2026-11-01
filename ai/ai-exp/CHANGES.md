# Changes

## v3 module split (no behavior change)
- `module/multi.sh` split into `shared-cage.sh`, `companion.sh`, `turns.sh`,
  `timeline.sh` and `discovery.sh`; `multi.sh` removed. `agent-v3.sh` sources them.
- `shared-cage.sh` has a documented interface so a v4 with separate cages only
  swaps that file. New `CAGE_OF <name>` (discovery uses it to find files).

## v3 (agent-v3.sh)
- New: two companions in ONE shared BusyBox cage, both Gemini (`AI_MODEL`),
  never told about each other or that they are AIs. Identical neutral prompt
  apart from the name ("You're logged in as <name> on this machine.").
- Persistent cage: one long-lived namespace set with a tiny `/sbin/init`;
  commands enter it with `nsenter`, so background processes and files persist
  between turns. `MAX_PROCS` limit; everything is killed at the end.
- Random ordinary names (`NAMES`, `NAME_POOL`), `/home/<name>`, `/etc/passwd`
  entries, HOME/USER/cwd per person (no real uid separation, see README).
- One clock: request every `REQUEST_GAP` s, alternating, random first speaker;
  each person every 2 x `REQUEST_GAP`. Millisecond timing, never under the gap.
- `TIME_LIMIT` defaults to 300 for v3.
- Per-person messages, journal and log; merged `timeline-N.md`; `summary-N.md`
  with a discovery scan.
- `--continue` keeps the same two names and reloads each journal.
- `SOLO=1` control run with one person, same prompt and pace.
- Opt-ins (`ENABLE_END_SESSION`, `ENABLE_TEXT_END`, `ENABLE_SEARCH`) as before;
  if one person ends, the other continues alone.
- New `module/multi.sh` (v3 only). v1/v2 unchanged. The launcher now runs v3 by
  default (newest version); pin older ones with `AGENT_VERSION`.

## v2 refactor (PR #365)
- `agent.sh` launcher + `versions/` + shared `module/`; `agent.py` moved to `misc/`.
