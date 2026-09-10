# Changelog

All notable changes to `@putervision/world-model-mcp` will be documented in this file.

## [0.3.1] - 2026-08-30

### 🚀 Autonomous Gaming Suite & Script Generation
- Added native desktop input automation (`xdotool_script` for Linux X11/Steam, `powershell_script` for Windows).
- Added `VisionBridge.ingestGameTelemetry` for direct game engine telemetry ingestion into 3D world model entities.
- Enhanced shortest-turn angle calculation and click-to-move timing.

## [0.3.0] - 2026-08-21

### Changed
- **Trimmed Registry Metadata Descriptions**: Compacted `server.json`, `glama.json`, and `manifest.json` descriptions to under 100 characters for optimal MCP registry display and catalog indexers.
- **Version Bump (0.3.0)**: Synchronized version across package manifests, CLI runtime, Three.js browser bridge, test suites, and documentation.

## [0.2.0] - 2026-08-21

### Changed
- **Consolidated MCP Tool API Surface (21 -> 15 tools)**: Streamlined tool footprint down to 15 core tools matching sibling server design patterns (`vision-memory-mcp` with 15 tools, `state-memory-mcp` with 13 tools).
  - `get_location` merged into `query_entities` (via `entity_id`, `include_history`, and `history_limit` parameters).
  - `get_world_summary` merged into `get_spatial_map` (via `format: 'summary'`).
  - `get_navigation_hints` merged into `simulate_movement` (via `mode: 'navigate' | 'waypoints'`).
  - `reconcile_observation` merged into `ingest_observation` (via `reconcile: boolean`).
  - `get_relevant_context` merged into `link_to_goal` (via `action: 'get_context'`).
  - `undo_mutation` merged into `manage_snapshot` (via `action: 'undo'`).
  - `project_to_screen` merged into `generate_game_inputs` (via `action: 'project_screen' | 'unproject_ray'`).
- **Backward Compatibility Guarantee**: Seamless legacy tool translation and parameter adaptation implemented in `compat-shim.ts` and `advisor.ts` to ensure zero breaking changes for existing agent workflows.
- **Updated Prompt & CLI Templates**: Updated agent rule templates and MCP prompts to reference the 15 consolidated tools.

## [0.1.0] - 2026-08-20

### Added
- Initial release of `@putervision/world-model-mcp`.
- 14 Consolidated MCP tools across Spatial Memory, Vision Integration, Goal Integration, and Utility.
- Local-first SQLite persistent database with WAL mode and schema migrations.
- FTS5 full-text entity search and 3D Euclidean proximity spatial queries.
- Object permanence engine with configurable confidence decay.
- AABB bounding box collision simulation and topological navigation pathfinding.
- Frustum visibility projection and vision observation reconciliation.
- Multi-project isolation and global registry (`~/.world-model-mcp/projects.json`).
- CLI tool suite with `init`, `doctor`, `inspect`, `map`, `summary`, `snapshot`, and `tools`.
- MCP resource templates: `world-model:///{project}/summary`, `entities`, `entity/{id}`, `map`, `goals`.
