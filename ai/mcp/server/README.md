# ai-mcp

Sandboxed MCP server that lets an AI agent read, write, edit files and run commands inside a workspace. Python 3.8+, standard library only.

**Current version:** see `VERSION` (5.6).

## Quick start

```bash
# From the install directory
./mcp.sh status
./mcp.sh restart
./mcp.sh selftest
```

- Config: `mcp.conf` (non-sensitive) + `.env` (sensitive, gitignored).
- Default PIN: `0000` (change it in `.env` before public use).
- Default listen: `127.0.0.1:10001`.
- Funnel path: `/sandbox` (see `docs/FUNNEL.md`).
- Sandbox root: set by `ROOT` in `mcp.conf` (example: `/home/www/ai/sandbox`).

## Configuration

**mcp.conf** — all non-sensitive settings (required block at the top):

```ini
HOST=127.0.0.1
PORT=10001
ROOT=/home/www/ai/sandbox
WORKSPACE=/home/www/ai/sandbox/workspace
SANDBOX=ns
SANDBOX_NET=0
LOG=/home/www/ai/logs/mcp.log
STATE_DIR=/home/www/ai/run
FUNNEL_PATH=/sandbox
PUBLIC_URL=https://your-host.example/sandbox
```

**.env** — sensitive only:

```ini
PIN=0000
```

Shell environment variables override both files.

## Tools

### Text tools (unchanged)
- `read_file`, `write_file`, `edit_file`
- `list_dir`, `delete_path`, `move_path`
- `run_command`

### One-time approval (v5.5)

When the AI needs internet or sudo and they are off:

1. AI calls `request_approval` with `kind` `internet` or `sudo`.
2. AI shows the user: `ALLOW INTERNET <code>` or `ALLOW SUDO <code>`.
3. User replies with that code.
4. AI calls `confirm_approval` with the same kind and code.
5. The **next** command gets that privilege, then it is gone.

### Binary file transfer (v4.8+)
Exact byte preservation for images, PDFs, archives, etc.

| Tool | Purpose | Notes |
|------|---------|-------|
| `upload_file` | Upload a file | Base64 content, `overwrite` (default false), 50 MiB limit |
| `upload_file_from_url` | Download HTTPS URL into sandbox | Rejects private/localhost; no redirects; 50 MiB |
| `download_file` | Download a file | Returns Base64 + SHA-256 |
| `get_file_info` | Metadata only | size, MIME, SHA-256, mtime |
| `upload_chunk` | Chunked upload | `upload_id`, `chunk_index`, `total_chunks`, path on first chunk |
| `download_chunk` | Chunked download | `chunk_index`, optional `chunk_size` (max 4 MiB) |
| `upload_status` | Progress | received/total chunks for an `upload_id` |

**Example — single-shot upload:**
```json
{
  "path": "photo.png",
  "content": "iVBORw0KGgo...",
  "overwrite": false
}
```

**Example — upload from URL:**
```json
{
  "url": "https://example.com/image.png",
  "path": "images/image.png",
  "create_parents": true
}
```

**Example — chunked upload:**
```json
{
  "upload_id": "img-001",
  "chunk_index": 0,
  "total_chunks": 3,
  "content": "base64...",
  "path": "big.pdf"
}
```

All paths are validated and confined to the sandbox root. Uploads use temporary files + atomic rename. SHA-256 is returned for verification.

## Layout

```
/home/www/ai/
├── VERSION
├── README.md
├── mcp.conf
├── .env                  # gitignored
├── mcp.sh
├── mcp/
│   ├── server.py
│   ├── tools.py
│   ├── tool_modules/
│   │   └── binary.py         # binary transfer tools
│   └── config/
└── sandbox/               # ROOT
    └── workspace/          # AI working directory
```

## Security
- PIN required (`.env`).
- Sandbox (`SANDBOX=ns`) with no network by default.
- Path traversal blocked.
- File size and chunk size limits enforced.
- Audit log of commands (view with `mcp.sh --logs audit`).

## Testing

```bash
python3 -m unittest mcp.tests.test_binary -v
```

## Upgrade

```bash
mcp.sh stop
# copy new files
mcp.sh restart
mcp.sh selftest
```
