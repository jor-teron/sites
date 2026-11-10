<!-- Web MCP — README.md: how to use the browser MCP server. MCP2 -->
# Web MCP

A browser-tab MCP server. You pick a folder in Chrome or Edge, press Connect, and Grok talks to that folder through a small relay on the Radxa.

Grok's URL is:

```
https://debian.tail94ffdb.ts.net/mcp/<PIN>
```

The tab has to stay open. After a browser restart, click Allow to grant folder access again.

Tools in this release (MCP2):

- File tools (MCP1): `read_file`, `write_file`, `edit_file`, `list_dir`, `move_path`, `delete_path`.
- `run_command` (MCP2): BusyBox 1.36.1 in WebAssembly, copied into `vendor/busybox/` (GPL-2.0; source and `.config` are in that folder). There is no shell and no `sh -c`. Supported syntax is quotes and escapes, simple `|` pipelines, `&&` and `;` chaining, and `>` / `>>` redirects. No network and no fork. The folder (or `cwd` subtree) is staged into memory with size caps; changed files are written back only if the command exits 0. Default timeout is 30 seconds (max 120).

See `relay/README.md` for how to run the relay on the Radxa next to the existing Linux MCP server.
