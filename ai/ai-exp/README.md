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

Experiments are created in `experiments/<name>/` (override with `EXPERIMENTS_DIR`).

## Layout

```
agent.sh            launcher: always run this
versions/
  agent-v1.sh       one session, run_shell only, "Carry on" nudge, log.md
  agent-v2.sh       v1 + --continue/-c, journal memory, log-N.md per session
module/             shared code used by every version
  main.sh           loads the modules, run_agent entry point
  config.sh         settings and feature flags (only place defaults live)
  util.sh           fail, clock, find_tool (/usr/sbin, /sbin...), .env reader
  log.sh            markdown logs
  cage.sh           busybox cage, namespaces, CAGE_TZ, --mount-proc
  api.sh            Gemini (OpenAI-compatible) calls, tool list, key loading
  search.sh         web_search via Tavily (opt-in, host side)
  session.sh        args, experiment folders, continue, prompt, turn loop
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
`EXPERIMENTS_DIR`. See `module/config.sh`.

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
copy of the function it depends on. v3 is reserved for a planned two-agent
(AI-to-AI) version.

Needs: bash, curl, jq, static busybox, unshare, chroot.
