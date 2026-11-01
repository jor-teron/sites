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

`agent.sh` now runs **v4** (two people, two machines, hidden links) by
default. Use `AGENT_VERSION=3 ./agent.sh ...` for one shared machine, or
`AGENT_VERSION=2` for the single-AI runs.

## v4: two companions, two machines, two hidden links

Like v3 (same neutral prompt, names, SOLO, `--continue`, `ENABLE_*`,
per-person logs, timeline, summary), but each person gets their **own** cage:
own BusyBox files, own `/home`, own process list (`ps` shows only theirs), own
hostname (their name). Nothing in the prompt mentions the other person, `/srv`
or the network. Two links join the cages:

1. **Shared folder**: `<experiment>/shared/` is bind-mounted read-write at
   `/srv` in both cages.
2. **Shared localhost**: both cages live in ONE network namespace with only
   `lo` (no outside network), so `nc -l -p 5555` in one cage is reachable with
   `nc 127.0.0.1 5555` from the other.

Timing: `REQUEST_GAP=4.35` (v4 allows up to 3 decimals; the clock is in ms),
so each person gets a turn about every 8.7 s; the prompt says "about every 9
seconds". `TIME_LIMIT` defaults to 300.

`summary-N.md` adds, per person: first touch of `/srv`, first read of a `/srv`
file the other wrote, first network use (nc/telnet/wget/curl to 127.0.0.1 or
localhost, or a listener such as `nc -l`/`httpd`).

Folder: `cages/<name>/` (each rootfs), `shared/` (behind `/srv`), plus the v3
files (`timeline-N.md`, `summary-N.md`, `log-<name>-N.md`, `.run/`).

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
  agent-v3.sh       two people in one shared cage, timeline + discovery
  agent-v4.sh       two people in separate cages + shared /srv + shared localhost (default)
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
  separate-cages.sh v4: one cage per person, shared /srv, shared netns (same interface as shared-cage.sh)
  discovery-links.sh v4: /srv attribution, first /srv touch/read, first network use
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

Needs: bash, curl, jq, static busybox, unshare, chroot (v3/v4: nsenter too).
