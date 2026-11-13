# v4 Phase 1 — Modular Tool Layer

**Status:** Implemented
**Date:** 2026-11-13
**Base release:** v3.3 (version unchanged)

## Goal

Begin the modular refactor without changing MCP behavior or public imports.
The first extraction targets `mcp/tools.py`, which previously mixed path
validation, workspace checks, command execution, file operations and registry
construction in one 450-line module.

## Changes

The implementation is now organised as:

```text
mcp/
├── tools.py                 # Stable public facade and tool registry
└── tool_modules/
    ├── __init__.py
    ├── common.py            # Path helpers, argument summaries, disk-space guard
    ├── command.py           # run_command implementation
    └── files.py             # read/write/edit/list/delete/move implementations
```

### Compatibility preserved

- Existing imports from `mcp.tools` still work.
- `tool_handlers` retains the same seven MCP tool names.
- `tool_defs` remains generated from the same configuration.
- Tool argument schemas and result shapes are unchanged.
- Protocol and HTTP layers were not modified.
- File operations continue using descriptor-relative `safepath` helpers.
- Command execution continues to use the existing sandbox implementation.

A compatibility test now checks the public re-exports and registry. The
production style test now scans nested production packages (including future
modular packages) while excluding tests and Python cache directories. Config
constants remain allowed throughout `mcp/config/`.

## Validation

- Python compilation: passed.
- Full unit suite: 165 tests, OK; 45 skipped because this isolated environment
  blocks local TCP loopback. The skipped network/jail integration tests still
  require validation on the Debian host.
- `mcp.sh` and `install.sh`: POSIX shell and Bash syntax checks passed.
- `git diff --check`: passed.

## Not included

This phase does not split the security-sensitive jail/sandbox implementation,
HTTP transport, self-test runner or configuration package. Those need their
own dependency maps and focused tests before extraction. No RAG, memory,
database or API server was added.

## Release handling

No version bump, release tag or commit was created. v3.3 remains the baseline.
