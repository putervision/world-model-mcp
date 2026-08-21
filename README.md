# @putervision/world-model-mcp

> **Deterministic, persistent 3D/2D spatial world model for AI agents.**  
> Maintains structured representations of entities, spatial relationships, object permanence, movement simulations, and expected view frustum projection.

[![npm version](https://img.shields.io/npm/v/@putervision/world-model-mcp.svg)](https://www.npmjs.com/package/@putervision/world-model-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## The PuterVision Triad

`@putervision/world-model-mcp` sits between perception and decision-making:

1. **Perception Layer** (`@putervision/vision-memory-mcp`): Visual perceptual cache, diffs, grounding, and AX trees.
2. **Spatial World Model** (`@putervision/world-model-mcp`): Durable representation of "what is out there" — 3D/2D coordinates, bounding volumes, topological relationships, object permanence, and simulated movement.
3. **Action & Reasoning Layer** (`@putervision/state-memory-mcp`): Goal tracking, task DAGs, decisions, blockers, and execution trajectories.

---

## 15 Consolidated MCP Tools

| Category | Tool | Description |
| :--- | :--- | :--- |
| **Spatial Memory & Search** | `update_entity` | Create or update an entity (position, orientation, bounding box, properties, confidence) |
| | `query_entities` | Search entities by keyword (FTS5), proximity radius, tags, status, or fetch specific entity location & trajectory history |
| | `set_relation` | Record or remove spatial relationships (on, inside, next_to, above, below, near, contains) |
| | `get_spatial_map` | Export structured spatial layout (JSON, GeoJSON, glTF 2.0, OBJ) or high-level summary (`format: "summary"`) |
| **Simulation & Vision** | `simulate_movement` | Predict trajectory, test for AABB obstacle collisions, or compute navigation waypoints (`mode: "navigate"`) |
| | `ingest_observation` | Ingest structured perception detections; re-identify entities and optionally reconcile frustum view (`reconcile: true`) |
| | `get_expected_view` | Calculate visible entities from observer pose with 3D ray-AABB occlusion culling |
| **Goal & State Integration** | `link_to_goal` | Associate entities/regions with task IDs, or extract goal-relevant spatial context slices (`action: "get_context"`) |
| | `record_outcome` | Update world model after action execution completes (position, property changes, destruction) |
| **Spatial SDD & Proofs** | `manage_spatial_spec` | Register and verify physical design contracts (clearance, bounds, containment) |
| | `create_evidence_pack` | Generate cryptographic SHA-256 evidence bundles linking spatial proofs to task nodes |
| **Multi-Agent & Replay** | `use_spatial_blackboard` | Topic-based multi-agent coordination with TTL, mutex locks, and collision intent detection |
| | `manage_snapshot` | Unified spatial snapshot and time-travel management: save checkpoints, diffs, undo mutations, and historical replay |
| | `wait_for_spatial_state` | Poll until target spatial condition is satisfied (exists, active, confidence threshold, region) |
| **Playwright & Game Automation** | `generate_game_inputs` | Convert 3D waypoints into timed WASD/Arrow key sequences, click-to-move, or project/unproject screen coordinates |

---

## Installation & Setup

### Quick Start (npx)

```bash
npx @putervision/world-model-mcp init
```

### Global Installation

```bash
npm install -g @putervision/world-model-mcp
```

---

## CLI Commands

- `world-model-mcp run` — Start the MCP server over stdio
- `world-model-mcp init` — Auto-configure MCP settings and rules for Cursor, VS Code, and Claude
- `world-model-mcp tools` — List all registered MCP tools with parameter schemas
- `world-model-mcp export --format gltf` — Export spatial model to glTF 2.0
- `world-model-mcp stats` — Display entity breakdown, relations, and object permanence health

---

## License

MIT License. Copyright (c) 2026 PuterVision Team.
