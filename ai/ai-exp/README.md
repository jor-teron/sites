# ai-exp: AI sandbox experiments

Let an AI (Gemini `gemini-3.1-flash-lite`) roam an offline BusyBox cage
(user/net/pid/mount/uts namespaces + chroot into a folder) for a fixed time.
It keeps a journal at `/home/journal.md`; every step is logged with the time.

## Run

```
./agent.sh <name> "<prompt>"          # new experiment
./agent.sh --continue <name> ["<prompt>"]   # next session (v2+)
./agent.sh --help
```

`agent.sh` now runs **v3** (two people, one machine) by default. Use
`AGENT_VERSION=2 ./agent.sh ...` for the single-AI runs.

## v3: two companions in one machine

```
./agent.sh <name> ["<prompt>"]                 # two people, 300 s
NAMES="maya leo" ./agent.sh <name>             # choose the two names
SOLO=1 ./agent.sh <name>-solo                  # control: one person, same prompt and pace
TIME_LIMIT=600 ./agent.sh <name>               # longer run
./agent.sh --continue <name> ["<prompt>"]      # session N, same two names, notes reloaded
```

- Both Gemini sessions share ONE cage: one BusyBox root, one set of
  namespaces kept alive by a tiny `/sbin/init`; every command enters it with
  `nsenter`. Files, `/tmp`, the process list and background processes are
  shared and persist between turns. Everything is killed at the end.
- Names: two picked at random from `maya leo sam nina arun priya tom ella`
  (`NAME_POOL` / `NAMES` override). Each gets `/home/<name>` and an
  `/etc/passwd` line; commands run with `HOME`, `USER`, `LOGNAME` set and
  the working folder at that home.
- Neither is told about the other, nor that it is an AI, agent, experiment
  or sandbox. Both get the same prompt apart from the name:
  "You're logged in as <name> on this machine..." plus time limit and notes
  (`/home/<name>/journal.md`). The optional prompt is the same for both
  (default "You can begin.").
- One clock: a request every `REQUEST_GAP` (5 s), alternating people
  (random first), so each gets a turn every 10 s (12 requests/min total).
  `TIME_LIMIT` defaults to 300 for v3. `[Ns left]` counts to the shared end.
- `MAX_PROCS=40`: processes allowed in the cage; extras (newest) are killed.
- Opt-ins work as before. If one person calls `end_session`, the other
  continues alone at the same pace.

Output in `experiments/<name>/`:

```
timeline-N.md         both people interleaved: time, name, command, output
log-<name>-N.md       one person's prompt and steps
summary-N.md          turns, how each ended, discovery
cage/                 the shared machine (homes, journals, /tmp...)
.run/                 messages, events, created-file lists, turn times
```

Discovery (in the summary): for each person, the first command that names
the other, uses `/home/<other>`, or uses a file the other made earlier,
and the first output that showed the other's name.

Known limits: both users are really uid 0 inside the cage (`id`/`whoami`
say root), because without `newuidmap` an unprivileged user namespace
maps only one uid; separation is HOME/USER/cwd only. A background process
that keeps writing to the turn's output (not redirected) gets SIGPIPE when
the turn ends, like a closed terminal; redirected ones keep running. Files
are credited to whoever's turn they appeared in, so a background job's
files count for the person in turn at that moment.

Experiments are created in `experiments/<name>/` (override with `EXPERIMENTS_DIR`).

## Layout

```
agent.sh            launcher: always run this
versions/
  agent-v1.sh       one session, run_shell only, "Carry on" nudge, log.md
  agent-v2.sh       v1 + --continue/-c, journal memory, log-N.md per session
  agent-v3.sh       two people in one shared cage, timeline + discovery (default)
module/             shared code used by every version
  main.sh           loads the modules, run_agent entry point
  config.sh         settings and feature flags (only place defaults live)
  util.sh           fail, clock, find_tool (/usr/sbin, /sbin...), .env reader
  log.sh            markdown logs
  cage.sh           busybox cage, namespaces, CAGE_TZ, --mount-proc
  api.sh            Gemini (OpenAI-compatible) calls, tool list, key loading
  search.sh         web_search via Tavily (opt-in, host side)
  session.sh        args, experiment folders, continue, prompt, turn loop
  shared-cage.sh    v3: persistent shared cage, homes/passwd, nsenter exec, process limit, cleanup
  companion.sh      v3: names, args, neutral prompt, per-person history, journal, continue
  turns.sh          v3: global clock, alternation, random first, SOLO, early end, run_multi
  timeline.sh       v3: per-person logs and merged timeline
  discovery.sh      v3: file attribution, first-contact scan, summary
misc/agent.py       obsolete Python version, kept for reference only (not used)
experiments/        your runs (gitignored)
```

## Which version runs

`agent.sh` runs the highest-numbered `versions/agent-vN.sh` (numeric, so
v10 beats v9), passing every argument through. Pin one with:

```
AGENT_VERSION=1 ./agent.sh exp1 "prompt"
```

A missing version gives an error listing the available ones. Version
files can also be run directly or through a symlink; they find `module/`
from their own real path.

## Settings (env overrides)

`TIME_LIMIT=150`, `REQUEST_GAP=5` (15 RPM free tier), `CMD_TIMEOUT=15`,
`MAX_OUTPUT=4000`, `MAX_JOURNAL=8000`, `AI_MODEL`, `API_URL`, `BUSYBOX`,
`EXPERIMENTS_DIR`. v3 adds `TIME_LIMIT=300`, `NAMES`, `NAME_POOL`, `SOLO`,
`MAX_PROCS`. See `module/config.sh` and `module/companion.sh`, `module/shared-cage.sh`. v3 also needs `nsenter`.

API key, first found wins: `GEMINI_API_KEY`/`GOOGLE_API_KEY` in the
environment, `.env` beside the version script, `.env` in this folder, then a
hidden prompt.

### Opt-in features (off in v1 and v2)

- `ENABLE_END_SESSION=1`: adds the `end_session` tool so the AI can end early.
- `ENABLE_TEXT_END=1`: a reply with no tool call ends the run (instead of the nudge).
- `ENABLE_SEARCH=1`: adds `web_search` (needs `TAVILY_API_KEY`).

## Adding a version (v4, ...)

Copy `versions/agent-v2.sh` to `versions/agent-vN.sh`, set `AGENT_LABEL`
and the `ENABLE_*` flags, and override any module function after the
`source .../module/main.sh` line (e.g. `compose_system_prompt`,
`nudge_text`, `run_loop`). The launcher picks it up automatically.
Changing `module/` changes every version; to freeze one, give it its own
copy of the function it depends on. A later v4 could give each person
their own cage by replacing only `module/shared-cage.sh`; its interface
(`setup_users`, `start_shared_cage`, `run_as_in_cage`, `enforce_proc_limit`,
`stop_shared_cage`, `CAGE_OF`) is documented at the top of that file.

Needs: bash, curl, jq, static busybox, unshare, chroot (v3: nsenter too).
