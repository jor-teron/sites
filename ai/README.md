# Remote MCP server v4.5

## Multi-user (v4)

A CSV catalog at `/home/ai/users.csv` (override with `MCP_USERS`) defines users:

```csv
uid,user,password,home,enabled,perms
10000,demo,demo,home/demo,1,read|write|run|share
```

- Connect at `/ai/mcp/<user>/<password>` (example: `/ai/mcp/demo/demo`).
- `perms` is pipe-separated: `read`, `write`, `run`, `share`.
- On first login the server creates `home/<user>/` (0700).
- `home/share/` is created at startup (0777) and is the common area.
- The original single-PIN path still works.

Copy `users.csv.example` to `/home/ai/users.csv` to try the demo user.

# Remote MCP server v3.32

A small Python MCP server so an AI agent can read, edit and run commands
inside a workspace. Python 3.8+, standard library only. It does **not** go
through Apache: it listens on `127.0.0.1:8787` and accepts JSON-RPC POST on
`/mcp`, `/ai/mcp`, or any path (so Tailscale Funnel can forward `/ai/mcp`).

v3.1 isolation is two layers, both without root and without bubblewrap:

1. **Chroot** (via `pivot_root` in a fresh mount namespace). The workspace
   is the only writable tree. `bash`, coreutils, Python and their libraries
   are bound read-only; `/tmp` is private; `/dev` is a handful of bind-mounted
   device nodes (`mknod` is not allowed in an unprivileged user namespace).
2. **Namespaces** around every command: user, mount, PID, IPC, UTS, and
   network (unless `MCP_SANDBOX_NET=1`). Commands run as a mapped non-root
   uid (1000) with `no_new_privs` and rlimits on CPU, memory and process count.

Authentication is a PIN. The default is `password` (demo only — change it
before Funnel is public). Anyone who has the PIN can run commands as the
server user. After a few wrong tries the client IP is locked out for a
short, increasing delay. The in-memory failure table is capped at 4,096
client IP records so an IP-spray cannot grow it without bound.

There is no OAuth in v3.1. Grok connects with the PIN on the URL. Gemini's
OAuth sign-in is not supported.

## Layout

```
/home/www/ai/
├── VERSION           authoritative release number
├── CHANGELOG.md      release history
├── RELEASE.md        current release and release checklist
├── README.md         installation and usage
├── docs/             architecture, security, deployment and release notes
├── mcp.sh            start/stop script (POSIX sh; same flags as v1)
├── rag.sh            local RAG CLI wrapper (./rag.sh or python3 -m rag)
├── api/              independent HTTP API process (python3 -m api.server)
│   ├── server.py     API process entry point
│   ├── http.py       separate /api HTTP listener and authentication
│   └── service.py    shared MCP tool execution and audit path
├── storage/          opt-in SQLite persistence foundation (not server-wired)
│   ├── config.py     explicit AI_STORAGE_* configuration
│   ├── database.py   connections, schema migrations and namespaced records
│   ├── test_config.py
│   └── test_database.py
├── rag/              document ingestion, SQLite persistence and chunk search
│   ├── extract.py    UTF-8 text and HTML extraction
│   ├── chunk.py      bounded overlapping text chunks
│   ├── ingest.py     document IDs, metadata and pipeline
│   ├── store.py      transactional repository and FTS5/LIKE chunk search
│   ├── embeddings.py provider-neutral embedding contract and vector checks
│   ├── providers.py  explicit provider/model registry
│   ├── local_embeddings.py optional local Sentence Transformers adapter
│   ├── config.py     default-off RAG/embedding switches and runtime gate
│   ├── cli.py        local status, ingest, list, show, search and delete commands
│   └── __main__.py   python3 -m rag entry point
│   ├── test_config.py
│   ├── test_ingest.py
│   └── test_store.py
├── mcp.conf          optional config (PIN, port, public URL, limits)
├── mcp/              server code
│   ├── server.py     entry point: config + start HTTP
│   ├── http.py       stable HTTP transport facade
│   ├── http_modules/ request, CORS, routing and connection modules
│   ├── log.py          stable logging and audit interface
│   ├── log_modules/    events, formatting, storage and command audit
│   ├── protocol.py   MCP JSON-RPC
│   ├── auth.py       PIN check and lockout
│   ├── tools.py      stable public tool interface and registry
│   ├── tool_modules/ focused implementations: common, command, files
│   ├── config/       defaults, loader, helpers and client text
│   │   └── limits/   file, command, jail, workspace, audit and self-test constants
│   ├── safepath.py   descriptor-relative, no-follow filesystem access
│   ├── jail.py       layer 1: build and enter the workspace chroot
│   ├── sandbox.py    layer 2: namespaces + limits per command
│   ├── nscompat.py   unprivileged unshare/mount/pivot_root helpers
│   ├── log.py        audit log
│   └── tests/
└── workspace/        chroot root; every MCP connection lands here
```

## Install on debian (no sudo where possible)

The zip unpacks to `www/ai/...`. Keep the running v1 tree as `mcp-v1`
so you can switch back. The v1 process that lives in `/home/ai/mcp` is
separate from the source tree under `/home/www/ai`.

```bash
# 1. Stop v1 if it is running (no sudo).
/home/ai/mcp/mcp.sh --stop 2>/dev/null \
  || /home/www/ai/mcp/mcp.sh --stop 2>/dev/null \
  || true

# 2. Keep the old running tree.
#    (Skip a rename that would overwrite an existing backup.)
if [ -d /home/ai/mcp ] && [ ! -e /home/ai/mcp-v1 ]; then
  mv /home/ai/mcp /home/ai/mcp-v1
fi
if [ -d /home/www/ai/mcp ] && [ ! -e /home/www/ai/mcp-v1 ]; then
  mv /home/www/ai/mcp /home/www/ai/mcp-v1
fi
# If mcp.sh already lives in /home/www/ai from v1, move it aside too:
if [ -f /home/www/ai/mcp.sh ] && [ ! -e /home/www/ai/mcp.sh-v1 ]; then
  mv /home/www/ai/mcp.sh /home/www/ai/mcp.sh-v1
fi

# 3. Unpack v3. Prefer a writeable destination without sudo.
#    If /home/www is not writable by you, unpack to a temp dir and copy.
unzip -o ai-mcp-v3.zip -d /tmp/ai-mcp-v3-unpack
cp -a /tmp/ai-mcp-v3-unpack/www/ai/mcp.sh \
      /tmp/ai-mcp-v3-unpack/www/ai/mcp.conf \
      /tmp/ai-mcp-v3-unpack/www/ai/mcp \
      /tmp/ai-mcp-v3-unpack/www/ai/workspace \
      /tmp/ai-mcp-v3-unpack/www/ai/README.md \
      /home/www/ai/

# 4. Workspace is the only folder the AI can see. Move or copy anything
#    you want it to work on into /home/www/ai/workspace/ (or add BIND=
#    lines in mcp.conf). Existing files under /home/www/ai stay put.

# 5. Change the demo PIN before Funnel is public.
#    In mcp.conf set PIN=... or:
#      export MCP_PIN='your-real-pin'
#    or write it to a file outside the workspace:
#      echo 'your-real-pin' > /home/ai/mcp.pin
#      chmod 600 /home/ai/mcp.pin
#      # and set PIN_FILE=/home/ai/mcp.pin in mcp.conf

# 6. Start v3 (no sudo). The kernel must allow unprivileged user namespaces.
/home/www/ai/mcp.sh --restart
/home/www/ai/mcp.sh --status
```

If start fails because user namespaces are off:

```text
sudo sysctl -w kernel.unprivileged_userns_clone=1
# or, weaker, no jail (file tools still stay in the workspace):
MCP_SANDBOX=none /home/www/ai/mcp.sh --restart
```

### Funnel

```bash
/home/www/ai/mcp.sh --funnel
# which runs:
#   tailscale funnel --bg --set-path /ai/mcp http://127.0.0.1:8787/mcp
```

Public URL: `https://debian.tail94ffdb.ts.net/ai/mcp`

Grok connector URL (PIN on the path):
`https://debian.tail94ffdb.ts.net/ai/mcp/<PIN>`

### Switch back to v1

```bash
/home/www/ai/mcp.sh --stop
# If you renamed /home/ai/mcp to /home/ai/mcp-v1:
/home/ai/mcp-v1/mcp.sh --restart
```

## Quick local check

```bash
./mcp.sh --bg
curl http://127.0.0.1:8787/health
# expect: ok

curl -sS -X POST http://127.0.0.1:8787/mcp \
  -H 'Authorization: Bearer password' \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"ping"}'
```

Connect with any of:

- `Authorization: Bearer <PIN>`
- `Authorization: Basic` plus `base64(user:PIN)` (any username)
- `X-MCP-PIN: <PIN>` (the v1 header `X-MCP-Password` is also accepted)
- the PIN as the last URL path segment (`/ai/mcp/<PIN>`), which is what Grok uses

GET `/health` does not need a PIN and does not reveal one.

## How the workspace works

- The only working directory is `/home/www/ai/workspace` (`MCP_ROOT`).
- The server lives in `/home/www/ai/mcp/`, **outside** the workspace, so file
  tools and commands cannot see it.
- Other files under `/home/www/ai` (your site, `projects/`, and so on) are
  **not** visible unless you copy them into `workspace/` or add a `BIND=`
  line in `mcp.conf`. Bind mounts are visible to commands only; file tools
  still stay inside `workspace/`.
- Apache can still serve `/home/www/ai`. Only `mcp/.htaccess` denies web
  access to the server folder.
- The audit log defaults to `/home/ai/mcp.log`. Keep PIN files and the log
  outside the workspace.

## Sandbox

Default is `MCP_SANDBOX=ns`. Each command gets its own namespaces, a new
root built on tmpfs (the workspace is bound at `/work` and at its host
path), a private `/tmp`, a namespaced `/proc`, and a mapped uid 1000.
Network is off unless `MCP_SANDBOX_NET=1`. Memory, CPU and process counts
are capped (see `MEMORY_MB`, `MAX_PROCS`, `TIMEOUT` in `mcp.conf`).

This needs unprivileged user namespaces. If
`unshare --user --map-root-user true` fails, check
`sysctl kernel.unprivileged_userns_clone` (should be 1). Ubuntu 24 may also
block this with AppArmor (`kernel.apparmor_restrict_unprivileged_userns`).

`MCP_SANDBOX=none` runs commands as the server user with no jail. File tools
still stay inside `MCP_ROOT`, but a shell command can leave the folder.

## systemd (optional; needs sudo)

```bash
sudo cp /home/www/ai/mcp/mcp.service /etc/systemd/system/ai-mcp.service
# edit User= and set MCP_PIN if needed
sudo systemctl daemon-reload
sudo systemctl enable --now ai-mcp
```

The unit uses `User=user` as a placeholder. Run it as a low-privilege user
with **no sudo**, not as root.

## Tests

```bash
python3 -m unittest discover -s /home/www/ai/mcp/tests -v
# mcp.sh smoke test (sh and bash) is included; or:
#   MCP_PORT=8799 MCP_STATE_DIR=$(mktemp -d) MCP_SANDBOX=none ./mcp.sh --bg
```

## Troubleshooting

1. On the PC itself: `curl http://127.0.0.1:8787/health` should print `ok`.
   If this fails, the Python server is not running (or not on 8787). Check
   `./mcp.sh --logs`.
2. Through Funnel: `curl https://<machine>.<tailnet>.ts.net/ai/mcp/health`
   should print `ok`. A GET to the MCP URL itself should return 405, which
   also means Funnel reached this server.
3. `tailscale funnel status` — confirm the path `/ai/mcp` points at
   `http://127.0.0.1:8787/mcp`.
4. Common errors:
   - Connection refused locally: server not started, or `MCP_PORT` is not 8787.
   - Funnel health fails but local health works: Funnel path/host is wrong, or
     Funnel is not running. Try `./mcp.sh --funnel` again.
   - `401 unauthorized`: wrong PIN. Use `/ai/mcp/<PIN>` or a Bearer / Basic /
     `X-MCP-PIN` header.
   - `429`: too many wrong PIN attempts from that IP; wait and retry.
   - Start fails with a user-namespace message: see the sysctl notes above,
     or use `MCP_SANDBOX=none`.
   - Browser agent blocked: set `MCP_CORS_ORIGINS` to that page’s origin.
   - From the PC itself, curl to the public Funnel URL may hit Apache's
     self-signed certificate on 443. Test from outside instead.

## Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `MCP_HOST` | `127.0.0.1` | Bind address |
| `MCP_PORT` | `8787` | Bind port |
| `MCP_PIN` | `password` | Demo PIN. Change this for anything beyond a local test. |
| `MCP_PASSWORD` | (alias of `MCP_PIN`) | v1 name, still accepted |
| `MCP_PIN_FILE` / `MCP_PASSWORD_FILE` | unset | If set, read the PIN from this file (stripped). Overrides `MCP_PIN`. |
| `MCP_LOG` | `/home/ai/mcp.log` | JSON-lines audit log |
| `MCP_ROOT` | `<install>/workspace` | Workspace / chroot. File tools cannot leave it. |
| `MCP_SANDBOX` | `ns` | `ns` or `none` |
| `MCP_SANDBOX_NET` | off | `1` to give sandboxed commands network access |
| `MCP_MEMORY_MB` | `512` | Address-space rlimit for each command, in MiB |
| `MCP_MAX_PROCS` | `64` | Process-count rlimit for each command |
| `MCP_TIMEOUT` | `60` | Default command timeout (seconds; max 600) |
| `MCP_BIND` | unset | Extra jail mounts, `src:dest[:ro\|rw]`, comma-separated |
| `MCP_CORS_ORIGINS` | empty | Allowed browser origins, comma-separated, or `*` |
| `MCP_TRUST_PROXY` | off | `1` to consider `X-Forwarded-For`; the socket peer must also match `MCP_TRUST_PROXY_IPS`. |
| `MCP_TRUST_PROXY_IPS` | empty | Comma-separated trusted proxy IPs/CIDRs (for example `127.0.0.1,::1`). Without a match, forwarded headers are ignored. |
| `MCP_PUBLIC_URL` | `https://debian.tail94ffdb.ts.net/ai/mcp` | Public base URL (documentation / logs). No trailing slash. |
| `MCP_CONF` | `<install>/mcp.conf` | Config file path |
| `MCP_STATE_DIR` | `/home/ai` | Where `mcp.sh` writes `mcp.pid` and `mcp.out` |

`mcp.sh` flags (same as v1): no argument (foreground), `--bg`, `--stop`,
`--restart`, `--status` (includes a Funnel check), `--logs`, `--funnel`.
Startup prints progress by default; prefix a command with `--quiet` (for
example, `./mcp.sh --quiet --bg`) to hide progress steps while retaining
important results and errors.

## Tools

`run_command`, `read_file`, `write_file`, `edit_file`, `list_dir`,
`delete_path`, `move_path`.

`run_command` uses `bash -lc`, default timeout 60 seconds (max 600), and
caps combined output at about 200 KB.


## v3.0 filesystem hardening

File tools now walk the sandbox using directory file descriptors and
`O_NOFOLLOW`, then perform reads, atomic writes, edits, moves and deletes
relative to those pinned directories. This prevents a symlink swap between
path validation and the filesystem operation from redirecting file access
outside the sandbox. Recursive listing and deletion do not follow symlinks.

Symbolic links are listed as links; reading or writing through them is
refused. Deleting or moving a link operates on the link entry itself.


## v3.1 Debian validation

Validated in a Debian 13 test container (Python 3.13) with user and network
namespaces enabled for the test process. All 162 automated tests passed with
no skips. The suite includes HTTP, jail, namespace, file-tool, installer and
shell smoke tests. To run the
same suite when the host restricts network namespaces, use a test network
namespace with loopback brought up:

```sh
unshare --user --map-root-user --net sh -c \
  'ip link set lo up && python3 -m unittest discover -s mcp/tests -v'
```

The live runtime self-test in a temporary installation reported 8 passes
and 2 deployment-specific failures: Funnel was not configured and no cron
@reboot entry was installed. Server, jail, network isolation, Git, AWK and
workspace checks passed. Configure Funnel and autostart on the target host,
then rerun `./mcp.sh --selftest`.

## Release numbering

`VERSION` is the single source of truth for the release number. Update it once
for a release, then record the changes in `CHANGELOG.md`, create a note under
`docs/releases/`, and update `RELEASE.md`. The shell scripts and Python server
read the version from this file; the installer copies it into the installation.

## Auth toggle (v2.8)

- `AUTH=1` (default) — PIN required
- `AUTH=0` — allow connections without PIN (testing only)

Set in `mcp.conf` or as `MCP_AUTH`. A warning is printed when auth is off.

## Future / parked ideas

### Separate HTTP API server (Phase 2 foundation implemented)

The API runs as a separate process from MCP. It has its own HTTP listener
and does not change the existing MCP listener or Tailscale Funnel route.

| Service | Default port | Endpoint |
| --- | ---: | --- |
| MCP | configured in `mcp.conf` (10001 in this deployment) | `/mcp` |
| API | `10002` | `/api` |

Start the API separately:

```sh
API_HOST=127.0.0.1 API_PORT=10002 python3 -m api.server
```

Core endpoints are `GET /api/health`, authenticated `GET /api/tools`,
and authenticated `POST /api/tools/call` with JSON `{ "name": "list_dir",
"arguments": { "path": "." } }`. The API reuses the MCP tool registry,
argument validation, sandbox, safe file operations, PIN authentication,
and audit logging. It defaults to loopback and is not published through
Tailscale Funnel. See `docs/v4-phase2-api.md` for the contract and safeguards.

A small standard-library CLI client is available:

```sh
# Public health check
python3 -m api.client health

# Authenticated tool list / call
API_PIN='your-pin' python3 -m api.client tools
API_PIN='your-pin' python3 -m api.client call list_dir --arguments '{"path":"."}'

# Or keep the PIN in a permission-restricted file
python3 -m api.client --pin-file /path/to/api.pin tools

# RAG operations go through the separate API process
API_PIN='your-pin' python3 -m api.client rag status
API_PIN='your-pin' python3 -m api.client rag ingest ./notes.md --title "Field notes"
API_PIN='your-pin' python3 -m api.client rag list --limit 25 --offset 0
API_PIN='your-pin' python3 -m api.client rag search "Assam rivers" --limit 10 --source notes.md
API_PIN='your-pin' python3 -m api.client rag show DOCUMENT_ID
API_PIN='your-pin' python3 -m api.client rag delete DOCUMENT_ID --yes
```

Set `API_URL` to change the base URL (default `http://127.0.0.1:10002`).
The client uses Python's standard library only, prints JSON, and returns a
non-zero exit code on errors. Avoid putting PINs directly in shell history;
prefer `API_PIN` from a protected environment or `--pin-file` with
restricted file permissions.

The API remains a separate loopback service; no API-specific token system or
public exposure has been added. Phase 5.8 adds authenticated RAG endpoints:
`GET /api/rag/status`, `POST /api/rag/ingest`, `GET /api/rag/documents`,
`GET /api/rag/documents/{document_id}`, `GET /api/rag/search`, and
`DELETE /api/rag/documents/{document_id}`. Ingestion accepts text in JSON;
binary or multipart upload is not supported. See
`docs/v4-phase5.8-rag-api.md` for request/response behavior. Phase 5.9 adds
paginated document lists and search results, source filtering, optional
per-document deduplication and configurable snippet length; see
`docs/v4-phase5.9-rag-pagination.md`. The release version is v3.32. Phase 3.1
host-side end-to-end verification is documented in
`docs/v4-phase3.1-api-integration-verification.md`;
real Debian-host HTTP checks are still pending. The opt-in SQLite package
supports integrity checks, online backups and validated restores. Phase 4.2
adds explicit `AI_STORAGE_*` configuration and an access/backup-retention
policy; Phase 5.6 initializes it only when RAG is explicitly enabled. Phase 5.0 adds a
standalone ingestion pipeline for TXT, Markdown and HTML. Phase 5.1 adds
explicit SQLite persistence for documents and chunks through
`RAGStore`; Phase 5.2 adds ranked chunk search using optional SQLite FTS5 with
LIKE fallback. Phase 5.3 adds source/document filters, bounded snippets,
optional per-document deduplication and a BM25 score ceiling. Phase 5.4 adds
an opt-in embedding-provider contract, SQLite vector persistence and exact
cosine-similarity retrieval. Phase 5.5 adds explicit RAG and embedding feature switches; both default off.
Phase 5.6 connects the optional runtime to MCP/API process startup without
exposing RAG tools or requiring a model. Phase 5.7 adds a local CLI for
keyword-only local document management; it requires explicit RAG/storage
settings and does not load an embedding model or start a listener. Phase 5.8
exposes the store through the authenticated API. Phase 5.9 adds pagination
and search-result controls. Phase 5.10 adds the
`api.client rag` terminal commands, which use the authenticated API rather
than opening the RAG database locally. See
`docs/v4-phase5.10-rag-api-client-cli.md`.
See `docs/v4-phase4.2-storage-configuration.md`,
`docs/v4-phase5.0-rag-ingestion.md`, `docs/v4-phase5.1-rag-persistence.md`,
`docs/v4-phase5.2-rag-retrieval.md`,
`docs/v4-phase5.3-rag-retrieval-improvements.md`,
`docs/v4-phase5.4-semantic-retrieval-foundation.md`,
`docs/v4-phase5.5-optional-rag-modules.md`,
`docs/v4-phase5.6-rag-application-startup.md`,
`docs/v4-phase5.7-rag-cli.md`, `docs/v4-phase5.8-rag-api.md` and
`docs/v4-phase5.9-rag-pagination.md`. Phase 6.0 adds provider registration,
Phase 6.1 adds the optional local Sentence Transformers provider, Phase 6.2
adds bulk vector indexing and coverage reports, and Phase 6.3 adds weighted
hybrid keyword/semantic search through the API. See
`docs/v4-phase6.1-local-embedding-provider.md`,
`docs/v4-phase6.2-vector-indexing.md` and
`docs/v4-phase6.3-hybrid-search.md`.

### Architecture and duplication audit

The v3.28 source audit reviewed the implementation from Phase 0 through Phase 7.1. It found no second RAG engine, database, embedding pipeline or search implementation. The local RAG CLI, API client CLI, HTTP API and browser GUI are separate interfaces over the same runtime/store. Phase 7.2 now reuses the existing authenticated `GET /api/rag/search` endpoint rather than implementing search again. See `docs/ARCHITECTURE-DUPLICATION-AUDIT.md` for the ownership map, findings and rules.

### RAG browser dashboard (Phase 7.0)

Start the separate API server, then open `http://127.0.0.1:10002/rag` in a
browser. Enter the API PIN to view RAG enablement, embedding state, document
count and the first ten indexed documents. The dashboard uses the
existing authenticated `/api/rag/*` endpoints; its PIN remains in page memory
and is not saved to browser storage. The static dashboard page itself contains
no document data and can be served without API authentication. Keep the API
bound to loopback unless you have deliberately configured a secure access path.
Phase 7.1 adds browser-based TXT/Markdown/HTML ingestion (5 MB maximum), paginated document listing, document/chunk inspection and confirmed deletion. Phase 7.2 adds keyword/hybrid search, source filtering, deduplication, snippets, result pagination and links into document inspection using the existing search API. Phase 8.0 adds persistent RAG feature settings in `~/.config/ai-mcp/rag.json` (override with `AI_RAG_CONFIG_PATH`) and authenticated settings endpoints. Phase 8.1 adds dashboard controls for RAG/embedding enablement and the existing local provider/model. Phase 8.2 adds a safe in-process API apply, active-versus-saved status, and explicit MCP restart guidance; it does not remotely restart or kill processes. Saving settings requires an API restart before they affect the running runtime. See `docs/v4-phase7.1-document-management.md`, `docs/v4-phase7.2-rag-search-gui.md` and `docs/v4-phase8.0-persistent-rag-settings.md` and `docs/v4-phase8.1-rag-settings-gui.md` and `docs/v4-phase8.2-apply-restart-status.md`.

### Local RAG command line

The CLI is local-only and uses keyword search; it does not require an embedding
provider, a second model, or network access. It is disabled unless RAG and its
SQLite path are explicitly configured:

```sh
export AI_RAG_ENABLED=true
export AI_RAG_EMBEDDINGS_ENABLED=false
export AI_STORAGE_PATH="$HOME/.local/share/ai/rag.sqlite3"

./rag.sh status
./rag.sh ingest ./notes.md
./rag.sh list
./rag.sh search "Assam rivers" --limit 10
./rag.sh show DOCUMENT_ID
./rag.sh delete DOCUMENT_ID --yes

# Equivalent Python entry point
python3 -m rag search "Assam rivers"
```

`status` is read-only and works while RAG is disabled. Ingestion accepts one
regular TXT, Markdown or HTML file at a time; it does not recurse through
directories. Deletion requires the explicit `--yes` flag.

### Other parked ideas

- Allow sudo (parked)

## Host hardware monitoring (follow-up)

**Status: documented / not implemented (2026-11-13).**

Recent checks through the MCP `run_command` tool could not read physical
laptop hardware telemetry from its isolated command environment:

- `/sys/class/power_supply/` was not present, so battery percentage,
  charging state, design/full-charge capacity and cycle count were unavailable.
- `upower` could not connect to `upowerd` in the command environment.
- `acpi` reported that ACPI support was unavailable in that environment.
- `sensors` reported `sensors_init: Kernel interface error`; thermal-zone and
  hwmon entries were not exposed there either.
- On the actual laptop terminal, the user confirmed that `sensors` works;
  `sudo modprobe coretemp` returned no output (normal when the module loads
  successfully). This indicates a host-versus-sandbox visibility limitation,
  not proof that the laptop lacks sensors or a battery.

### Planned solution

Add a small, read-only **host-side hardware telemetry** component and expose
narrow MCP tools for:

- Battery percentage and charging/discharging status.
- Battery design capacity, current full-charge capacity and cycle count
  (only where the hardware/driver reports them).
- CPU temperature readings from `sensors` (and/or supported sysfs hwmon data).
- CPU load and RAM usage.

Keep telemetry collection on the host, outside the per-command sandbox. Return
only parsed, allowlisted fields; do not expose arbitrary host shell execution,
raw sensitive files, or unrestricted host filesystem access. Handle missing
sensors/fields gracefully and report unavailable values rather than guessing.

This is a follow-up design item only; no host monitoring service, API endpoint,
or MCP tool has been implemented yet.


## Embedding provider architecture (Phase 6.0)

`rag.providers.EmbeddingProviderRegistry` allows application code to register
exact provider/model factories and construct them explicitly. The default
registry is empty; no embedding model or provider is bundled yet. Optional
`AI_RAG_EMBEDDING_PROVIDER` and `AI_RAG_EMBEDDING_MODEL` settings must be set
together and require `AI_RAG_ENABLED=true` plus
`AI_RAG_EMBEDDINGS_ENABLED=true`. See
`docs/v4-phase6.0-provider-architecture.md`.


## Optional local embeddings (Phase 6.1)

The default provider registry includes `local` with model
`sentence-transformers/all-MiniLM-L6-v2`. The SDK is optional and is not
installed with the base MCP/API server. Install it only when local semantic
embeddings are needed:

```sh
python3 -m pip install -r rag/requirements-embeddings.txt
```

The model is loaded lazily on the first embedding request; the first run may
download model weights. Inference then runs locally. See
`docs/v4-phase6.1-local-embedding-provider.md`.


## Vector indexing and coverage (Phase 6.2)

The RAG store and runtime expose `embedding_status(provider)` to inspect
model-specific coverage and identify missing or stale vectors.
`index_all_embeddings(provider)` indexes only missing/stale documents and
skips current ones; pass `force=True` to rebuild all document vectors.
Changing provider/model identity produces a separate coverage view; indexing
with the new model replaces the previous vectors for each document. See
`docs/v4-phase6.2-vector-indexing.md`.


## Hybrid retrieval (Phase 6.3)

The RAG store/runtime can combine keyword and semantic retrieval with weighted
reciprocal-rank fusion. This keeps BM25 and cosine similarity on separate
scales while combining their rankings. The default weights are 0.5 keyword and
0.5 semantic; either weight can be adjusted. If embeddings are disabled or no
provider is configured, hybrid mode falls back to keyword search.

The authenticated API supports `GET /api/rag/search?q=...&mode=hybrid` with
optional `keyword_weight` and `semantic_weight` parameters. Keyword mode remains
the default. The API CLI supports `rag search QUERY --mode hybrid`. See
`docs/v4-phase6.3-hybrid-search.md`.
