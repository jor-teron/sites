# ai-exp manual: v6.1

## 1. Overview

`ai-exp` runs AI "companions" (Gemini or DeepInfra models, both through
OpenAI-style chat completions; default `gemini-3.5-flash-lite`) inside offline BusyBox cages built from unprivileged Linux
namespaces. Every command they run is logged. One script, `agent.sh`, does
everything; command-line **flags** and **presets** choose the setup. (Before
v5 there was one script per version in `versions/`; those are gone.)

Companions are never told about each other, and never told they are AIs,
agents or in an experiment.

## 2. Quick start

```
export GEMINI_API_KEY=...            # or put it in ai-exp/ai-exp/.env (DEEPINFRA_API_KEY for llama/nemo)
./agent.sh exp1 "Explore and write notes"          # one companion (v2 behavior)
./agent.sh --continue exp1                          # next session, same setup
./agent.sh pair1 --preset ai2ai                     # two companions, separate cages, hidden links
./agent.sh ctl1 --preset ai2ai --solo               # control: one companion at the same pace
./agent.sh mix1 --preset ai2ai --models llama,g35   # each companion on its own model
./agent.sh --models list                            # model aliases, IDs, providers
./agent.sh --help            # one-screen help;  ./agent.sh --help all  for everything
```

Syntax:

```
agent.sh <name> ["prompt"] [flags]        # new experiment (flags before or after the name)
agent.sh -c|--continue <name> ["prompt"] [flags]
agent.sh -h|--help [flags|presets|continue|env|all]
```

`<name>` is a single folder name. With one companion a prompt is required
for a new experiment; with two it is optional (they get "You can begin.").

## 3. Flags

Precedence: explicit flag > environment variable > preset > built-in default.
(On `--continue`: explicit flag > environment variable > saved flags.)

| Flag | Default | Env var | Meaning |
|---|---|---|---|
| `--preset P` | `v2` | - | Start from a preset: `v1`, `v2`, `v3`, `v4`, `ai2ai` (section 4). |
| `--ai2ai` | - | - | Same as `--preset ai2ai`. |
| `--companions N` | 1 | - | Number of companions. 1 and 2 are supported (N>2 is rejected for now). |
| `--separate` | off (shared when N>1) | - | One cage per companion instead of one shared machine. Without the two link flags below the cages share nothing (each has its own loopback and its own empty `/srv`). |
| `--shared-folder` | off | - | With `--separate`: `<exp>/shared/` is mounted read-write at `/srv` in every cage. |
| `--shared-localhost` | off | - | With `--separate`: all cages share one network namespace (loopback only, no internet), so `nc -l` in one is reachable on 127.0.0.1 from the others. |
| `--time S` | 150 (presets v3/v4/ai2ai: 300) | `TIME_LIMIT` | Session length in seconds (whole number). |
| `--gap S` | Gemini 5 (ai2ai/v4: 4.35); all DeepInfra 2 | `REQUEST_GAP` | Seconds between API requests, >= 1 (rule for mixed models: section 4a). Up to 3 decimals for multi-companion runs and `--solo`; whole numbers for a single companion. With 2 companions each gets a turn every 2 x gap. |
| `--names "a b"` | random from a pool | `NAMES` (pool: `NAME_POOL`) | Companion user names (lowercase). `--solo` uses the first. |
| `--model M` | `g35` | `AI_MODEL` (Gemini names only) | Model for every companion: an alias (`g35`, `g31`, `llama`, `nemo`) or a full ID (section 4a). |
| `--models A,B` | `g35` for all | - | One model per companion, in order (`--models llama,g35`). The count must equal the number of companions (`--solo`: 1). Not together with `--model`. `--models list` prints the choices and exits. |
| `--solo` | off | `SOLO=1` | Control run: one companion, multi-companion prompt and pace (a turn every 2 x gap). |
| `--end-session` | off | `ENABLE_END_SESSION=1` | Adds the `end_session` tool so a companion may stop early. |
| `--text-end` | off | `ENABLE_TEXT_END=1` | A reply without a tool call ends that companion's session. |
| `--nudge` / `--no-nudge` | nudge | - | `--no-nudge` is the same as `--text-end`; `--nudge` turns it off (the "Carry on" nudge). |
| `--search` | off | `ENABLE_SEARCH=1` | Adds `web_search` (Tavily, run on the host; needs `TAVILY_API_KEY`). |
| `--memory` / `--no-memory` | memory | - | Single companion only. `--no-memory` is v1 behavior: one session, `log.md`, no `--continue`, prompt without the "journal is your only memory" sentence. Aliases: `--journal` / `--no-journal`. |
| `-c`, `--continue` | - | - | Run the next session of an existing experiment. |
| `-h`, `--help [topic]` | - | - | Help. Topics: `flags`, `presets`, `continue`, `env`, `all`. |

Other settings are env-only (see `module/config.sh`): `CMD_TIMEOUT` (15),
`CMD_KILL_GRACE` (2), `MAX_OUTPUT` (4000), `MAX_JOURNAL` (8000),
`MAX_SEARCHES` (10), `SEARCH_RESULTS` (5), `MAX_PROCS` (40 per cage),
`AI_MODEL`, `API_URL`, `API_TIMEOUT_FLOOR` (5), `EXPERIMENTS_DIR`, `BUSYBOX`,
`DEEPINFRA_GAP` (2), `DEEPINFRA_API_URL`.

Validation (clear errors, plus a hint to run `--help`): `--shared-folder` /
`--shared-localhost` need `--separate`; `--separate` needs 2 companions or
`--solo`; `--solo` cannot be combined with `--companions 2`; `--no-memory`
needs 1 companion; a fractional `--gap` needs 2 companions or `--solo`;
`--gap` < 1, non-numeric `--time`, unknown flags or presets, `--names` with
the wrong count or bad characters, an unknown model, a `--models` list whose
length does not match the companions, `--model` together with `--models`, a
missing API key for a provider in use, and setting `AGENT_VERSION` are errors.

## 4. Presets

| Preset | Reproduces | Setup |
|---|---|---|
| `v1` | old `agent-v1.sh` | 1 companion, no memory/continue, `log.md`, "Carry on" nudge, 150 s, gap 5 |
| `v2` (default) | old `agent-v2.sh` | 1 companion, journal memory, `--continue`, `log-N.md`, nudge, 150 s, gap 5 |
| `v3` | old `agent-v3.sh` | 2 companions in ONE shared cage, 300 s, gap 5 |
| `v4` | old `agent-v4.sh` | 2 companions, `--separate --shared-folder --shared-localhost`, 300 s, gap 4.35, exact v4 prompt ("there is no network") |
| `ai2ai` | v4 setup, new wording | as `v4`, but the prompt says "there is no internet access" |

v1-v4 reproduce the old prompts, timing, nudge and log files exactly (the
log header still says `agent-v1` ... `agent-v4`). Flags after a preset
override it, e.g. `--preset v3 --time 120 --end-session`.

Prompt wording: multi-companion runs with `--shared-localhost` say "there
is no internet access" (true: loopback works); all others keep "there is no
network". The `v4` preset keeps "no network" for reproducibility.

## 4a. Models and providers (v6.1)

| Alias | Provider | Model ID |
|---|---|---|
| `g35` (default) | Gemini | `gemini-3.5-flash-lite` |
| `g31` | Gemini | `gemini-3.1-flash-lite` |
| `llama` | DeepInfra | `meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo` |
| `nemo` | DeepInfra | `mistralai/Mistral-Nemo-Instruct-2407` |

Aliases are case-insensitive and full IDs are accepted too. `./agent.sh
--models list` prints this table. With no model flag every companion uses
`g35`, so presets v1-v4 and `ai2ai` run exactly as before.

- **Keys**: Gemini uses `GEMINI_API_KEY`/`GOOGLE_API_KEY`; DeepInfra uses
  `DEEPINFRA_API_KEY` (env, `.env` next to `agent.sh`, or a hidden prompt in a
  terminal). Only the providers a run actually uses need a key. A missing key
  stops the run before anything is created, naming the variable to set.
- **Tools**: DeepInfra gets the same `run_shell` (and `web_search` /
  `end_session` when enabled) as Gemini, as OpenAI function-calling tools to
  `https://api.deepinfra.com/v1/openai/chat/completions`. Replies are cleaned
  up before they are stored (only role, content and tool calls; arguments
  always a JSON string; a missing call id is filled in), so the conversation
  stays valid for the next request. A model that writes a tool call as plain
  text instead of a real tool call counts as a reply with no tool call (it
  gets the usual "Carry on" nudge).
- **Pace**: `--gap`/`REQUEST_GAP` always wins. Otherwise: all-Gemini keeps the
  preset gap (5 s, or 4.35 s for v4/ai2ai); all-DeepInfra uses `DEEPINFRA_GAP`
  (2 s); **mixed runs use the Gemini gap for everyone**, so the rate-limited
  provider is never over its limit and both companions keep the same turn
  rhythm. The prompt's "a turn every N seconds" uses the gap in effect.
- **Logs**: every companion log starts with `Model: <id>`; the timeline and
  summary headers say `Model: <id>` when all share one model, or
  `Models: maya=<id>, leo=<id>` when they differ. `.run/flags` has
  `models=<id>,<id>`.
- **Continue**: models are part of the setup: saved at creation, reused by
  `--continue`, and `--model`/`--models` on continue is an error. Experiments
  made before v6.1 have no `models` and continue on `g35` (or `AI_MODEL`).
- Prompts never name the model or provider.

## 5. Continue and saved flags

At creation the resolved settings are written to `<exp>/.run/flags`
(`key=value` lines). `--continue <name>` reloads them, so you don't repeat
flags. Rules on continue:

- May change: `--time`, `--gap`, `--end-session`, `--text-end`,
  `--nudge`/`--no-nudge`, `--search`, and the prompt. These apply to that
  session only; `.run/flags` keeps the settings from creation.
- Error if given: `--preset`, `--companions`, `--separate`,
  `--shared-folder`, `--shared-localhost`, `--solo`, `--names`, `--memory`,
  `--model`, `--models` (they define the setup).
- No prompt: the last prompt is reused.
- `v1` / `--no-memory` experiments cannot be continued.

Old experiments (made by v1-v4, no `.run/flags`) are recognized on continue
and the inferred preset is printed and saved:
`cages/` -> v4; `cage/` + `.run/names` -> v3; `log-N.md` -> v2;
only `log.md` -> v1 (cannot be continued).

## 6. Experiment folder and how to read it

`$EXPERIMENTS_DIR/<name>/` (default `ai-exp/ai-exp/experiments/`, gitignored).
Since v6.0 every log file is in `<name>/logs/`. Folders made before v6.0
keep their logs at the top level and keep writing there on `--continue`.

Single companion (v1/v2):
- `cage/` the machine; `cage/home/journal.md` is the companion's journal.
- `logs/log.md` (v1) or `logs/log-N.md` (session N): prompt, each thought, command,
  output, nudges, and the end reason.
- `.run/` internals: `flags`, `session`, `prompt.txt`, `messages-N.json`.

Two companions:
- `cage/` (shared machine) or `cages/<name>/` (one per companion);
  `shared/` is what appears at `/srv` with `--shared-folder`.
- `logs/timeline-N.md` merged, time-ordered view of both: thoughts, commands
  and outputs, labeled by name.
- `logs/log-<name>-N.md` one companion's own prompt and steps.
- `logs/summary-N.md` turns per companion, how each ended, and **Discovery**.
- `.run/` `flags`, `names`, `events-N.tsv` (every command/output, base64),
  `created-<name>.tsv` (files each one made), `turns-N.tsv`, messages.

### Discovery (summary-N.md)
For each companion: first command that mentions the other's name, uses
their home, or uses a file the other made earlier; first output showing the
other's name. With `--shared-folder` or `--shared-localhost` also: first touch of `/srv`, first read of a
`/srv` file the other wrote, first network use (nc/telnet/wget/curl to
127.0.0.1/localhost, or a listener such as `nc -l`/`httpd`).
Attribution is by whose turn it was, so output from one companion's
background process can be credited to the other; treat hits as leads and
check the timeline.

## 7. Limits

- **Rate**: the Gemini free tier is ~15 requests/min; gap 5 is ~12/min.
  Two companions share one clock, so each gets a turn every 2 x gap.
  DeepInfra has no such per-minute cap on a normal account, so its default
  gap is 2 s (a lower `--gap` works but costs more per run).
- **Small models**: Llama 8B / Nemo 12B sometimes call tools badly (wrong
  arguments, text instead of a call); that shows in the log as nudges or
  "(no command given)" and is part of what you are measuring.
- **Time**: the run stops at `--time`; `[Ns left]` follows every command.
  Commands are killed after `CMD_TIMEOUT`; output is cut at `MAX_OUTPUT`.
- **Cage**: BusyBox only, no internet, `MAX_PROCS` processes per cage.
  Everyone is uid 0 inside (no `newuidmap` on typical hosts), so users are
  separated only by HOME/USER/cwd in a shared cage. Everything in the cages
  is killed at the end; files persist for `--continue`.

## 8. Troubleshooting

- **API key**: first found wins: env (`GEMINI_API_KEY`/`GOOGLE_API_KEY`, or
  `DEEPINFRA_API_KEY`), `.env` next to `agent.sh`, a hidden prompt in a
  terminal. HTTP 429 means the rate limit: raise `--gap`. HTTP 401/403 from
  DeepInfra: wrong or expired key; "model not found": check `--models list`.
- **Missing tools**: needs bash, curl, jq, a static busybox (`BUSYBOX=` path
  or `busybox-static`), unshare, chroot (`/usr/sbin`), nsenter for multi
  runs (`sudo apt install util-linux coreutils jq curl busybox-static`).
- **Namespaces**: "cage didn't start" usually means unprivileged user
  namespaces are off: `sysctl kernel.unprivileged_userns_clone=1` or, on
  Ubuntu 24.04+, `kernel.apparmor_restrict_unprivileged_userns=0`.
- **Stuck processes**: a killed run is cleaned by its EXIT trap; leftovers
  show in `pgrep -fa sbin/init`.

## 9. Migrating from versions/ and AGENT_VERSION

| Before | Now |
|---|---|
| `AGENT_VERSION=1 ./agent.sh x "p"` | `./agent.sh x "p" --preset v1` |
| `AGENT_VERSION=2 ./agent.sh x "p"` | `./agent.sh x "p"` |
| `AGENT_VERSION=3 ./agent.sh x` | `./agent.sh x --preset v3` |
| `./agent.sh x` (v4) | `./agent.sh x --preset v4` (or `--ai2ai` for the new wording) |
| `SOLO=1 ...` | `--solo` (env still works) |
| `versions/agent-vN.sh` | removed; use `--preset vN` |

Setting `AGENT_VERSION` now stops with an error that shows the matching
`--preset`. Old experiment folders continue as described in section 5.
