# CLI Usage Guide — @putervision/world-model-mcp

The `world-model-mcp` CLI provides command-line inspection, database management, 3D visualization, and health diagnostics.

---

## Commands

### `world-model-mcp run`
Starts the stdio JSON-RPC MCP server for IDEs and agent runners.

### `world-model-mcp init [-y|--yes]`
Scaffolds `.world-model-mcp/` directory, `.gitignore`, `.env`, and IDE rules for Cursor, VS Code, Gemini Antigravity, and Claude.

### `world-model-mcp view [-p <project>]`
Launches the standalone Three.js 3D WebGL Scene Visualizer on `http://127.0.0.1:8090`.

### `world-model-mcp doctor`
Runs environment checks (Node version, SQLite WAL mode, graph invariants, orphan relations, cryptographic event audit chain).

### `world-model-mcp doctor-global`
Audits health across all registered projects in `~/.world-model-mcp/projects.json`.

### `world-model-mcp inspect [-p <project>]`
Prints an ASCII table of active entities, coordinates, bounding boxes, and permanence scores.

### `world-model-mcp metrics [-p <project>]`
Displays permanence decay stats, spatial extents, confidence averages, and observation counts.

### `world-model-mcp map [--geojson] [-p <project>]`
Outputs the environment spatial map to stdout.

### `world-model-mcp export [-o <file.json>] [json|geojson|gltf|obj]`
Exports world model to standard 3D formats (glTF 2.0, Wavefront OBJ, GeoJSON, or JSON).

### `world-model-mcp import <file.json> [-p <project>]`
Imports entities and spatial relations from a JSON file into the local world model.

### `world-model-mcp backup [-o <backup.db>]`
Creates a physical SQLite backup file.

### `world-model-mcp restore <backup.db>`
Restores project database from a SQLite backup file.

### `world-model-mcp snapshot save [name] | list | restore <name> | diff <nameA> <nameB>`
Manages named checkpoints and computes pairwise spatial differences (added, removed, displaced entities).

### `world-model-mcp spec list | verify <spec-name>`
Manages Spatial SDD specification contracts and displays live verification results.

### `world-model-mcp blackboard list | post <topic> <payload> | read <topic>`
Interacts with the multi-agent spatial blackboard.

### `world-model-mcp undo [entity_id]`
Reverts the latest entity mutation from the event sourcing log.

### `world-model-mcp audit`
Audits cross-memory references, orphan links, and verifies SHA-256 event chaining.
