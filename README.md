# @putervision/world-model-mcp

[![npm version](https://img.shields.io/npm/v/@putervision/world-model-mcp.svg)](https://www.npmjs.com/package/@putervision/world-model-mcp)
[![npm downloads](https://img.shields.io/npm/dm/@putervision/world-model-mcp.svg)](https://www.npmjs.com/package/@putervision/world-model-mcp)
[![CI](https://github.com/putervision/world-model-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/putervision/world-model-mcp/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D18.18.0-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Website](https://img.shields.io/badge/Website-putervision.com-6366f1.svg)](https://putervision.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/putervision/world-model-mcp/blob/main/LICENSE)

`@putervision/world-model-mcp` is a zero-infrastructure, deterministic Model Context Protocol (MCP) server that maintains a persistent 3D/2D spatial world model for AI agents. It bridges perception ([`@putervision/vision-memory-mcp`](https://github.com/putervision/vision-memory-mcp)) and reasoning/action ([`@putervision/state-memory-mcp`](https://github.com/putervision/state-memory-mcp)) with durable entity tracking, object permanence with confidence decay, movement simulation with AABB collision avoidance, expected view frustum projection, and Playwright 3D game automation.

🌐 **Official Documentation & Website**: [putervision.com](https://putervision.com)

---

## ⚡ Quick Start & Installation

> **Prerequisites**: Node.js **>= 18.18.0**

```bash
# 1. Install globally
npm install -g @putervision/world-model-mcp

# 2. Navigate to your project directory
cd your-project

# 3. Initialize world-model-mcp
# Creates .world-model-mcp/, updates .gitignore, registers project,
# and scaffolds IDE instructions and MCP configs for Cursor, Claude, VS Code, Windsurf, etc.
world-model-mcp init

# Done! Restart your IDE or Agent Manager to activate.
```

### Alternative Options
```bash
# Run directly via binary (after global install)
world-model-mcp run

# Launch interactive 3D WebGL Scene Visualizer
world-model-mcp view

# Display database metrics and permanence confidence stats
world-model-mcp stats
```

---

## 🌟 Key Highlights

- **🌐 Deterministic 3D/2D Spatial Memory**: Zero LLM in the loop for spatial indexing; deterministic SQLite WAL queries with FTS5 search and 3D Euclidean proximity radius lookups.
- **⚡ 15 Production-Grade Consolidated MCP Tools**: Full CRUD, topological spatial graphs (`on`, `inside`, `contains`, `near`), ray-AABB occlusion frustum culling, waypoint navigation, and time-travel rollback.
- **⏳ Object Permanence & Decay**: Entities remain in persistent memory even when out of view, with configurable exponential confidence decay ($C = C_0 \cdot e^{-\lambda t}$) and status lifecycles (`active` → `hidden` → `lost`).
- **🚀 Collision & Movement Simulation**: Predicts entity displacement trajectories, detects AABB obstacle collisions, and computes obstacle-avoiding navigation waypoints before actions execute.
- **🎮 Playwright Game Automation**: Generates timed WASD / Arrow keyboard hold sequences (`KeyW for 450ms`, `ArrowLeft for 290ms`) and 3D↔2D coordinate screen projections.
- **🤝 Multi-Agent Spatial Blackboard**: Topic-based coordination with TTL, mutex locks, and collision intent alerts across parallel subagents.
- **🛡️ Spatial Spec-Driven Development (Spatial SDD)**: Physical design contract baseline registration, live verification (clearance, bounds, containment), and cryptographic SHA-256 evidence bundles.
- **🎨 Interactive 3D WebGL Visualizer**: Browser-based Three.js 3D viewport rendering active entities, orientation axes, frustum cones, and topological links (`world-model-mcp view`).
- **🔒 100% Local & Private**: All spatial entities, relations, and history stay inside `.world-model-mcp/` in your workspace.

---

## 🛠️ MCP Tool Suite

`@putervision/world-model-mcp` provides **15 production-grade consolidated MCP tools** organized across 5 core workflow domains:

- **Spatial Memory & Search**: `update_entity` (entity CRUD, 3D bounds, properties, confidence), `query_entities` (FTS5 search, proximity radius, status/tags filter, history lookup), `set_relation` (topological graph links: `on`, `inside`, `near`, `contains`), `get_spatial_map` (JSON, GeoJSON, glTF 2.0, OBJ, summary).
- **Simulation & Vision Integration**: `simulate_movement` (displacement prediction, AABB collision checks, waypoint routing), `ingest_observation` (vision detection ingestion, Euclidean re-identification, frustum reconciliation), `get_expected_view` (observer pose, horizontal FOV cone, ray-AABB occlusion).
- **Goal & State Integration**: `link_to_goal` (associate entities/regions with State Memory tasks, extract spatial context slices), `record_outcome` (record execution results, position shifts, property changes, destruction).
- **Spatial SDD & Proofs**: `manage_spatial_spec` (register physical clearance/containment contracts, live verification scoring), `create_evidence_pack` (cryptographic SHA-256 evidence bundles linking spatial proofs to task nodes).
- **Multi-Agent, Replay & Automation**: `use_spatial_blackboard` (topic board, mutex claim/release, intent conflicts), `manage_snapshot` (checkpoints, snapshot diffing, time-travel undo), `wait_for_spatial_state` (async polling for target spatial condition), `generate_game_inputs` (Playwright WASD hold timings, 3D↔2D screen ray projection).

👉 For complete parameter specifications, return schemas, and example payloads, see the **[API Reference Guide](docs/api-reference.md)** and **[Database Schema](docs/database-schema.md)**.

---

## 🚀 Architecture & Spatial Memory Lifecycle

```
                     Perception / Vision Detection
                                  │
                                  ▼
                 ┌─────────────────────────────────┐
                 │  Perception Ingestion & Re-ID   │ ──▶ ingest_observation(reconcile: true)
                 └────────────────┬────────────────┘
                                  │
                                  ▼
                 ┌─────────────────────────────────┐
                 │  Durable Entity & Permanence    │ ──▶ update_entity(...)
                 │  (3D Bounding Boxes, Decay)     │ ──▶ set_relation(relation: "on"|"inside")
                 └────────────────┬────────────────┘
                                  │
                                  ▼
                 ┌─────────────────────────────────┐
                 │  Simulation & Waypoint Routing  │ ──▶ simulate_movement(mode: "navigate")
                 │  (AABB Collision Avoidance)     │ ──▶ get_expected_view(fov: 90)
                 └────────────────┬────────────────┘
                                  │
                                  ▼
                 ┌─────────────────────────────────┐
                 │  Playwright & Action Execution  │ ──▶ generate_game_inputs(...)
                 │  (WASD Sequences, Screen Rays)  │ ──▶ record_outcome(action_type: "move")
                 └────────────────┬────────────────┘
                                  │
                                  ▼
                 ┌─────────────────────────────────┐
                 │  Spatial SDD & Cryptographic    │ ──▶ manage_spatial_spec(action: "verify")
                 │  Evidence Bundling to Tasks     │ ──▶ create_evidence_pack(...)
                 └────────────────┬────────────────┘
                                  │
                                  ▼
                 ┌─────────────────────────────────┐
                 │  Persistent SQLite Engine       │ ──▶ .world-model-mcp/world.db (WAL mode)
                 │  Append-Only History Ledger     │ ──▶ SHA-256 Cryptographic Audit Chain
                 └─────────────────────────────────┘
```

---

## 📚 Documentation Directory

Explore dedicated guides and deep dives in the [`docs/`](docs/) directory:

| Guide | Description |
| :--- | :--- |
| 🏗️ **[Architecture & Codebase Distillation](docs/codebase-distillation.md)** | High-signal architectural overview, module inventory, data flows, and design decisions. |
| 💡 **[Features & Triad Overview](docs/features.md)** | PuterVision Autonomous Triad interaction, 3D WebGL scene visualizer, and evidence packs. |
| 📋 **[Spatial World Model Concepts](docs/concepts.md)** | Object Permanence ($C = C_0 \cdot e^{-\lambda t}$), Confidence Decay, Frustum Projection, and Spatial SDD. |
| ⚙️ **[Configuration & IDE Setup](docs/configuration.md)** | Auto-Initialization details, Environment Variables, and Editor Configs (Cursor, VS Code, Claude, Windsurf). |
| 🛠️ **[CLI Command Reference](docs/cli-usage.md)** | CLI flags (`init`, `run`, `view`, `stats`, `inspect`, `map`, `export`, `import`, `doctor`, `snapshot`, `spec`, `blackboard`). |
| 🧰 **[Tools & API Reference](docs/api-reference.md)** | Complete reference for all 15 Consolidated MCP Tools, legacy tool mapping, and parameter examples. |
| 🗄️ **[Database Schema](docs/database-schema.md)** | SQLite tables (`entities`, `spatial_relations`, `entity_history`, `spatial_specs`, `blackboard_items`, `evidence_packs`). |
| 🎮 **[Interactive 3D Game Arena Demo](docs/game-demo.html)** | Autonomous 3D browser arena with Three.js bridge diagnostics (`window.__WORLD_MODEL_BRIDGE`). |
| 🧭 **[Examples & Tutorials](docs/examples/)** | Deep-dive examples: [Spatial Navigation](docs/examples/spatial-navigation.md), [Perception Reconciliation](docs/examples/perception-reconciliation.md), and [Multi-Agent Blackboard](docs/examples/multi-agent-blackboard.md). |

---

## 📖 Agent Playbook: 5-Step Canonical Workflow

When an autonomous AI agent enters a repository with `world-model-mcp`:

```
1. Orient & Explore   ──▶ get_spatial_map(format: "summary") + get_expected_view(fov: 90)
2. Query & Locate     ──▶ query_entities(query: "chest", radius: 15) + query_entities(entity_id: "...")
3. Plan & Simulate    ──▶ simulate_movement(mode: "navigate") + manage_spatial_spec(action: "verify")
4. Execute & Ingest   ──▶ generate_game_inputs(...) + ingest_observation(reconcile: true)
5. Record & Evidence  ──▶ record_outcome(...) + create_evidence_pack(task_id: "...")
```

---

## 🧪 Testing

```bash
# Run full unit, integration, and geometry stress test suite across 46 test files (202 tests)
npm test

# Run multi-Node matrix test suite across Node.js 18, 20, and 22
npm run test:matrix

# Run 3D geometry, projection, and Playwright game loop tests
npm run test:3d
```

---

## ⚖️ License & Disclaimers

Developed and maintained by [PuterVision](https://putervision.com). Released under the [MIT License](LICENSE).

- **Local Storage Guarantee**: All spatial coordinates, bounding volumes, and entity history remain 100% local in your workspace. No telemetry or project data is ever transmitted.
- **Trademarks & Non-Affiliation**: Product names (Cursor, Claude Code, Gemini, Windsurf, VS Code, GitHub, SQLite, Three.js, Playwright) are property of their respective owners and used solely for compatibility identification.
