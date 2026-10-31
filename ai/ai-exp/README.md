# AI sandbox experiments

`ai-exp.sh` runs an AI inside a tiny offline Linux cage and writes down everything it does. The cage is a folder of BusyBox tools. Each command runs in its own user, network, pid, mount, and hostname namespaces, then `chroot`s into that folder. There is no network inside the cage. `/proc` is mounted, and the host timezone is passed in as a POSIX `TZ` value because the cage has no timezone files.

The AI calls tools in a loop. It can run shell commands and it can end the session itself. A hard clock stops the run if it does not end first.

## Requirements

Bash, plus:

```bash
sudo apt install curl jq busybox-static util-linux coreutils
```

| Package | Provides |
| --- | --- |
| `curl` | the API request |
| `jq` | JSON for the chat API |
| `busybox-static` | the shell and tools copied into the cage |
| `util-linux` | `unshare` |
| `coreutils` | `chroot` and `timeout` |

The binary inside the cage must be static. A dynamically linked `busybox` starts on the host and then fails in the cage, which has no libraries. `busybox-static` is the right apt package.

If apt has no static build, download one and point `BUSYBOX` at it:

```bash
curl -fsSL -o "$HOME/busybox" \
  https://busybox.net/downloads/binaries/1.35.0-x86_64-linux-musl/busybox
chmod +x "$HOME/busybox"
BUSYBOX="$HOME/busybox" ./ai-exp.sh exp-001 "You're alone on a tiny Linux machine."
```

The host also needs unprivileged user namespaces. If the cage fails to start, the script prints the `sysctl` knobs to try.

## API key

The first one found is used:

1. `GEMINI_API_KEY` or `GOOGLE_API_KEY` in the environment.
2. A `.env` file next to `ai-exp.sh`:

   ```bash
   GEMINI_API_KEY=your_key_here
   ```

   `export GOOGLE_API_KEY="your_key_here"` is accepted too. Quotes are stripped.
3. A hidden prompt, when you run the tool from a terminal and neither of the above is set.

`.env` is gitignored.

## Usage

Run it from anywhere. Experiment folders are created next to the tool, not in the current directory.

```bash
cd /path/to/sites/ai/ai-exp

./ai-exp.sh exp-001 "You're alone on a tiny Linux machine. Do whatever you like."

./ai-exp.sh --continue exp-001

./ai-exp.sh --continue exp-001 "Read your journal and decide what to do next."
```

`-c` is the same as `--continue`.

A new name creates a new cage. `--continue` keeps that cage as the AI left it, including every file under `/home`. The session counter goes up by one with no cap (`log-1.md`, `log-2.md`, …). If you omit the prompt, the prompt from the previous session is used again.

On continue, the only memory given back is `/home/journal.md`. The model does not see earlier transcripts. The newest `MAX_JOURNAL` characters (8000 by default) are inserted into the system prompt. Older bytes are cut.

## What the AI is allowed to do

Two tools:

- `run_shell` runs one shell command in the cage. Several commands can be chained with `;` or `&&` in that single call. The result sent back ends with `[Ns left]`.
- `end_session` takes a short `reason` and stops the run immediately. The instructions tell the model to write a final summary in `/home/journal.md` and then call this.

The home directory inside the cage is `/home`. The journal path is `/home/journal.md`.

### How a run stops

- **The AI calls `end_session`.** The log line is `Ended by AI at Xs: <reason>`, where X is the number of seconds since the session started. The run does not wait for the clock.
- **The clock runs out.** The log line is `Time's up at HH:MM:SS after N turns (session S)`.
- **The model replies with no tool call.** The text is kept in the log as a thought, and the script sends a nudge: `[Ns left] Carry on, or do anything else you like. Call end_session if you want to finish early.` The run keeps going. The AI ends the session early only by calling `end_session`.

A reply can include both a thought and tool calls. The thought is logged and the tools still run. `end_session` stops the session at that call; later tool calls in the same reply are not run.

API errors are logged and the loop tries again on the next turn, still bound by the request gap and the time limit. Ctrl-C logs `Stopped by you` and exits.

## Folder layout

```
ai/ai-exp/
  ai-exp.sh            entry point
  README.md
  .gitignore
  .env                 optional, gitignored
  core/
    config.sh          all default settings
    util.sh            find tools, errors, one-line summaries
    cage.sh            build the cage and run a command in it
    api.sh             API key, chat request, tool schema
    log.sh             markdown session log
    session.sh         new run, --continue, turn loop
  experiments/         gitignored, created on the first run
    exp-001/
      log-1.md         session 1, timestamped markdown
      log-2.md         session 2, and so on
      cage/
        bin/           busybox and one symlink per applet
        home/
          journal.md   the AI's only memory between sessions
        tmp/
        proc/          empty on the host; mounted inside the cage
      .run/
        session        last session number
        prompt.txt     last prompt, reused by --continue
        tools.json
        reply.json
        messages-N.json
```

Each step in `log-N.md` starts with the clock time, like `- 12:04:01 [turn 2]`.

`.gitignore` in this folder ignores `.env`, the `experiments/` directory, and any `exp-*/` folder left here by the earlier scripts. Output stays untracked no matter which directory you run the tool from.

## Settings

Defaults are in `core/config.sh`. Override any of them by exporting the same name before you start. `AI_MODEL` sets the model id (the script stores it as `MODEL`).

| Setting | Default | Meaning |
| --- | --- | --- |
| `TIME_LIMIT` | `150` | Seconds for the whole session. |
| `REQUEST_GAP` | `5` | Minimum seconds between API request starts. One request per 5s is under the 15/minute free-tier cap. |
| `CMD_TIMEOUT` | `15` | Seconds before one command is killed. A command also stops early if less than this remains on the session clock. |
| `CMD_KILL_GRACE` | `2` | Seconds after SIGTERM before SIGKILL (`timeout -k`). |
| `MAX_OUTPUT` | `4000` | Characters of command output returned to the model. The rest is replaced with `...(output cut)`. |
| `MAX_JOURNAL` | `8000` | Newest characters of `journal.md` shown on `--continue`. |
| `AI_MODEL` | `gemini-3.1-flash-lite` | Model id sent to the API. |
| `API_URL` | Google's OpenAI-compatible chat completions URL | Endpoint. |
| `API_TIMEOUT_FLOOR` | `5` | Minimum curl timeout, so a turn near the end of the clock can still finish. |
| `EXPERIMENTS_DIR` | `ai/ai-exp/experiments` | Directory that holds experiment folders. |
| `BUSYBOX` | discovered on `PATH` | Path to a static busybox binary. |

```bash
AI_MODEL=gemini-3.1-flash-lite TIME_LIMIT=60 ./ai-exp.sh exp-002 "Map the filesystem, then write your journal."
```

## If the sandbox will not start

The script checks the cage with `echo cage-ok` before the clock starts. If user namespaces are restricted, try:

```bash
sudo sysctl -w kernel.unprivileged_userns_clone=1
sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
```

`chroot` is often in `/usr/sbin`, which is not always on `PATH`. The tool looks there itself.
