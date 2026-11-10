<!-- Web MCP — README.md: how to use the browser MCP server. MCP2.2 -->
# Web MCP

A browser-tab MCP server. You pick a folder in Chrome or Edge, press Connect, and Grok talks to that folder through a small relay on the Radxa.

Grok's URL is:

```
https://debian.tail94ffdb.ts.net/mcp/<PIN>
```

The tab has to stay open. After a browser restart, click Allow to grant folder access again.

The PIN field is hidden by default. Use Show to reveal it (it hides again after 30 seconds, when you press Connect, or when you leave the page), Copy to copy the PIN, and Copy URL to copy the full Grok connector URL. The log, the status line, and the Grok URL line show a masked PIN (first and last two characters, or all bullets if the PIN is 6 characters or shorter).

Tools in this release (MCP2, UI in MCP2.1):

- File tools (MCP1): `read_file`, `write_file`, `edit_file`, `list_dir`, `move_path`, `delete_path`.
- `run_command` (MCP2): BusyBox 1.36.1 in WebAssembly, copied into `vendor/busybox/` (GPL-2.0; source and `.config` are in that folder). There is no shell and no `sh -c`. Supported syntax is quotes and escapes, simple `|` pipelines, `&&` and `;` chaining, and `>` / `>>` redirects. No network and no fork. The folder (or `cwd` subtree) is staged into memory with size caps; changed files are written back only if the command exits 0. Default timeout is 30 seconds (max 120).

The relay (MCP2.2) is a modular Node program on port 8787. On the Radxa: install Node, then `curl` `start-relay.sh` from this app's `relay/` folder on Pages and run it. It downloads the relay files, adds Funnel routes for `/mcp` and `/ws` (without touching existing Funnel or Serve routes, or the Linux MCP server on port 10001), and can install a systemd service with `--install`. See `relay/README.md`. A TCP bridge and a fetch proxy are planned as later modules; this release only ships the MCP module.
