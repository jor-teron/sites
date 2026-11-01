# Changes

## v5 (flags and presets)
- One launcher, flags instead of versions: `agent.sh <name> ["prompt"] [flags]`,
  flags before or after the name. New `module/flags.sh` parses, validates
  (clear errors plus a `--help` hint), picks the modules and runs the engine.
- Flags: `--companions N` (1-2), `--separate`, `--shared-folder`,
  `--shared-localhost`, `--time`, `--gap` (fractional with 2 companions or
  `--solo`), `--names`, `--solo`, `--end-session`, `--text-end`,
  `--nudge/--no-nudge`, `--search`, `--memory/--no-memory` (`--journal`),
  `--preset v1|v2|v3|v4|ai2ai`, `--ai2ai`, `-c/--continue`, `-h/--help [topic]`.
  Env vars still work as defaults; flags override them.
- Presets v1-v4 reproduce the old versions (prompts, timing, nudge, logs,
  log label). Default (no flags) = v2. `ai2ai` = v4 setup with new wording.
- Wording: multi-companion prompts say "there is no internet access" instead
  of "there is no network" only with `--shared-localhost`; preset `v4` keeps
  the exact v4 text.
- `--separate` without `--shared-localhost` gives each cage its own network
  namespace; without `--shared-folder` nothing is mounted at `/srv`.
- Resolved flags saved to `<exp>/.run/flags`; `--continue` reuses them, allows
  time/gap/opt-in changes, rejects setup flags. Folders made before v5 get
  their preset inferred from the layout (noted on screen and in `.run/flags`).
- Removed `versions/` and `AGENT_VERSION` (setting it is an error naming the
  matching `--preset`). v1/v2 prompt moved into `session.sh`.
- `MANUAL.md` updated (synced with the final flags); README shortened.

## v4 (agent-v4.sh)
- New: each companion gets its OWN cage (`module/separate-cages.sh`, same
  interface as `shared-cage.sh`): own rootfs under `cages/<name>/`, own mount,
  PID and UTS namespaces, hostname = name, `/etc/passwd` with only that user.
- Hidden link 1: `<experiment>/shared/` bind-mounted read-write at `/srv` in both.
- Hidden link 2: both cages join one unprivileged network namespace (lo only),
  so localhost listeners are reachable across cages. A holder process owns the
  user+net namespace; cages are `unshare`d inside it via `nsenter`.
- `REQUEST_GAP` may be fractional when a version sets `FRACTIONAL_GAP=1`
  (v4 default 4.35 s; `gap_ms` in config.sh). The prompt rounds the per-person
  interval ("about every 9 seconds"). v1-v3 still require whole numbers.
- `module/discovery-links.sh`: `/srv` files are attributed to the person whose
  turn wrote them; summary adds first `/srv` touch, first read of the other's
  `/srv` file, first network use.
- Small shared changes: `shared-cage.sh` gains `build_cages`/`repair_cages`
  and `CAGE_ROOT_NAME` (v3 behavior unchanged); `companion.sh` reads journals
  via `CAGE_OF`; `turns.sh` uses `gap_ms`. Launcher default is now v4.

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
