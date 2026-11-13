# Security model and limitations

## Protections

- PIN authentication is enabled by default; use a strong, private PIN before exposing the service.
- Authentication failures are tracked per IP with a bounded 4,096-entry LRU table. This limits memory growth but does not prevent distributed or IP-rotation attacks.
- Forwarded client IP headers are trusted only when the connecting proxy IP matches `MCP_TRUST_PROXY_IPS`.
- HTTP request framing is validated, request reads have a timeout, and concurrent handler threads are capped.
- File operations use descriptor-relative paths and avoid following symlinks during traversal and mutation.
- The sandbox attempts namespace/jail isolation and resource limits; required isolation setup fails closed when those operations fail.

## Limitations

- Per-IP rate limiting is not network-level denial-of-service protection.
- A request socket timeout applies to blocking reads, not necessarily a strict total request deadline.
- Isolation depends on kernel features and deployment configuration. Run `./mcp.sh --selftest` on the target host.
- Do not expose the demo PIN (`password`) or disable authentication in a public deployment.
- Tailscale Funnel and boot-time startup are deployment choices and must be configured and verified on the actual host.
