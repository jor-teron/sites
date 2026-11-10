<!-- Web MCP — README.md: how to use the browser MCP server. MCP1 -->
# Web MCP

A browser-tab MCP server. You pick a folder in Chrome or Edge, press Connect, and Grok talks to that folder through a small relay on the Radxa.

Grok's URL is:

```
https://debian.tail94ffdb.ts.net/mcp/<PIN>
```

The tab has to stay open. After a browser restart, click Allow to grant folder access again.

File tools in this release (MCP1): `read_file`, `write_file`, `edit_file`, `list_dir`, `move_path`, `delete_path`. Command running is MCP2.

See `relay/README.md` for how to run the relay on the Radxa next to the existing Linux MCP server.
