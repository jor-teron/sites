# Phase 8.1 — RAG settings GUI

The existing `/rag` dashboard now exposes the persistent settings introduced in
Phase 8.0:

- Enable/disable RAG.
- Enable/disable embeddings (disabled automatically when RAG is off).
- Select the registered built-in provider (`local`) or leave it unselected.
- Select the built-in `sentence-transformers/all-MiniLM-L6-v2` model.
- Load and save settings through the authenticated settings API only.

The page does not access configuration files, SQLite, or secrets directly.
Saving validates on the server and explicitly tells the operator that both
API and MCP processes need restarting before the new configuration is active.
The PIN remains in page memory only.
