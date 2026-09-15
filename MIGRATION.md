# 🚀 Migration Guide: @putervision/world-model-mcp

This guide explains how to migrate client integrations, custom agents, and tool callers to the unified **v0.4.0+ API** with native transport and consolidated spatial semantics.

---

## ⚡️ Key Architecture Updates

### 1. Zero-Dependency Native Transport (`PV_NATIVE_TRANSPORT=1`)
You can run `world-model-mcp` with zero dependency on `@modelcontextprotocol/sdk` and `zod` by setting `PV_NATIVE_TRANSPORT=1`:

```json
{
  "mcpServers": {
    "world-model": {
      "command": "node",
      "args": ["/path/to/world-model-mcp/dist/index.js"],
      "env": {
        "PV_NATIVE_TRANSPORT": "1"
      }
    }
  }
}
```

- Sub-millisecond JSON-RPC 2.0 framing directly on Node.js `readline`.
- Dynamic protocol version negotiation (supports `2024-11-05` and newer).
- Per-request AbortController cancellation via `notifications/cancelled`.

### 2. Mandatory `project` Slug Validation
All tools requiring persistent spatial state now strictly require a non-empty `project` parameter.
- Missing or empty `project` values immediately return JSON-RPC Error `-32602` (`Invalid params: "project" parameter is required`).
- Cross-project contamination is prevented by strict database file partitioning.

### 3. Unified Spatial Blackboard Dialect
The `use_spatial_blackboard` tool adheres to the canonical 5-verb specification across the PuterVision Pentad:
`get` | `set` | `delete` | `lease` | `list`

- Legacy verbs are mapped with deprecation warnings:
  - `read` → `get`
  - `post` → `set`
  - `claim` / `release` → `lease`
- Expirations are configured in seconds (`ttl_seconds`).

### 4. Canonical Tool Documentation Resources (`pv://docs/...`)
Tool documentation and schemas can now be inspected directly through MCP resources without loading the full parameter schema into every context window:
- URI template: `pv://docs/{toolName}`
- Individual resources: `pv://docs/update_entity`, `pv://docs/simulate_movement`, etc.

### 5. Waypoint Navigation & Passable Obstacle Affordances
- In `simulate_movement(mode: "navigate")`, regional waypoint path computation is performed with obstacle avoidance.
- Entities marked with `properties: { is_passable: true }` (e.g. open doors, portals, sensors) are not flagged as obstacle collisions.
