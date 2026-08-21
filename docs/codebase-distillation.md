# Codebase Distillation — @putervision/world-model-mcp

Architectural overview for autonomous coding agents.

## Core Modules (`src/engine/`)
- `db.ts`: SQLite connection pooling, WAL mode setup, project path resolution.
- `entity-store.ts`: CRUD operations on 3D entities with FTS5 search and spatial proximity radius filtering.
- `spatial-graph.ts`: Directed topological relations between entities with BFS cycle detection.
- `frustum.ts`: FOV cone and ray-AABB line-of-sight occlusion culling.
- `simulation.ts`: Movement simulation, waypoints, and AABB collision prediction.
- `permanence.ts`: Exponential confidence decay engine and status lifecycle transitions.
- `vision-bridge.ts`: Ingestion of vision model detections and Euclidean re-identification.
- `goal-bridge.ts`: Association of entities and regions with State Memory task IDs.
- `spatial-spec.ts`: Spatial SDD contract verification engine.
- `evidence.ts`: Cryptographic SHA-256 evidence pack generator.
- `blackboard.ts`: Multi-agent topic blackboard with TTL and collision alerts.
- `time-travel.ts`: Mutation rollback and past scene timestamp reconstruction.
- `export.ts`: 3D export formats (JSON, GeoJSON, glTF 2.0, Wavefront OBJ, trajectories).
- `events.ts`: Cryptographic event sourcing ledger with SHA-256 hash chaining.
