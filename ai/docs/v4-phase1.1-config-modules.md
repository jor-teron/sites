# v4 Phase 1.1 — Configuration modularisation

**Status:** Implemented
**Date:** 2026-11-13
**Base release:** v3.3 (version unchanged)

## Goal

Reduce the size and mixed responsibilities of `mcp/config/client_text.py` while
preserving the established `mcp.config` public import surface.

## Changes

Operational constants were extracted from `client_text.py` into a domain-based
package:

```text
mcp/config/
├── __init__.py          # stable public config exports
├── constants.py         # core server, HTTP, protocol and path defaults
├── load.py              # mcp.conf + environment parsing and Config
├── helpers.py           # path, size, PIN and audit helpers
├── client.py            # runtime client settings and tool schemas
├── client_text.py       # client-facing instructions and descriptions
└── limits/
    ├── __init__.py      # compatibility exports
    ├── files.py         # file-tool limits
    ├── command.py       # command, output and resource limits
    ├── jail.py          # jail layout and mount constants
    ├── workspace.py     # git workspace and disk-limit constants
    ├── runtime.py       # jail environment and sandbox mode
    ├── audit.py         # audit logging and PIN-strength constants
    ├── selftest.py      # self-test constants
    └── misc.py          # logging, bind modes and user-namespace guidance
```

`mcp.config` remains the public compatibility namespace. Existing imports such
as `from mcp.config import DEFAULT_TIMEOUT` continue to work. Direct legacy
imports from `mcp.config.client_text` also continue to work because that module
re-exports the operational constants from `mcp.config.limits`.

The original operational constant expressions were compared against the v3.3
source: all 130 expressions are unchanged. No runtime behavior, config key,
default, environment-variable name, tool schema or server protocol was changed.

## Tests and validation

- Added `mcp/tests/test_config_modules.py` for domain imports, compatibility
  exports and Config/ConfigError availability.
- Python compilation: passed.
- Unit suite: 168 tests, OK; 45 environment-dependent tests skipped because the
  isolated Laptop MCP command environment blocks local TCP loopback. Those
  tests still require execution on the Debian host.
- `mcp.sh` and `install.sh`: POSIX shell and Bash syntax checks passed.
- `git diff --check`: passed.

## Not included

No changes to server startup, HTTP, MCP protocol, jail, sandbox execution,
filesystem safety, API, RAG, memory or storage. No version bump, release tag or
commit was created. The v3.3 baseline remains in place.
