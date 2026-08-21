## State Memory (state-memory-mcp)

This project tracks workflow state, tasks, design decisions, and blockers using `state-memory-mcp` with project slug `"world-model-mcp"`.

### 1. Priority Order
Before doing any coding or investigation:
1. `manage_sessions(action: "start")` — Start a tracking session for full change attribution.
2. `get_analytics(action: "summary")` — Run to understand current project state, active branches, and overall progress.
3. `manage_tasks(action: "next")` — Query prioritized runnable tasks.
4. `manage_tasks(action: "find_blockers")` — Identify any active blockers preventing progress.
5. `manage_nodes(action: "list")` — Find pending tasks, past decisions, or milestones.
6. `query_graph(action: "trace")` — Trace what depends on or blocks a task.

### 2. When to Write to the Graph
You MUST update the graph as you work:
- **Starting a session**: Always call `manage_sessions(action: "start", agent_id: "my-agent")` to track all mutations under a unique session.
- **Starting a new task**: Create a node with `manage_nodes(action: "create", type: "task", title: "...", session_id: session_id)`.
- **Making a design or implementation decision**: Document it with `manage_nodes(action: "create", type: "decision", title: "...", metadata: { "rationale": "..." }, session_id: session_id)`.
- **Encountering a blocker**: Record the blocker with `manage_nodes(action: "create", type: "blocker", title: "...", session_id: session_id)` and connect it using `manage_edges(action: "add", type: "blocks", source_id: blocker_id, target_id: task_id, session_id: session_id)`.
- **Adding observation notes**: Atomically log notes using `manage_nodes(action: "add_note", text: "...", attach_to: node_id)`.
- **Batch updates**: Bulk update tasks/nodes using `manage_nodes(action: "batch_update", ids: ["..."], status: "done")`.
- **Completing a task**: Update status to done using `manage_tasks(action: "complete", task_id: task_id)` or `manage_nodes(action: "update", id: task_id, status: "done")`.
- **Creating/generating a new file**: Create an artifact node with `manage_nodes(action: "create", type: "artifact", title: "...", session_id: session_id)` and connect it using `manage_edges(action: "add", type: "produces", source_id: task_id, target_id: artifact_id)`.

### 3. Workflow Pattern
1. **Start of session**: Call `manage_sessions(action: "start")` to align and track work, then run `get_analytics(action: "summary")`, `manage_tasks(action: "next")`, and `manage_tasks(action: "find_blockers")`.
2. **Task decomposition**: Decompose user requests into tasks and add them to the graph.
3. **Execution**: Mark tasks as "in_progress", document design decisions as they occur, and log blockers if you hit any obstacles.
4. **Validation & Resolution**: Run `run_diagnostics(action: "validate")` to ensure no cycles/orphans/contradictions, mark tasks as "done", document completed artifacts, and resolve blockers. Call `manage_sessions(action: "end")` to finalize.

### 4. Codebase Seeding on Initialization
If the project was just initialized or is missing high-level structure (Plans, Milestones, Decisions):
1. **Inspect the Codebase**: Read the README and core files to understand the roadmap and architecture.
2. **Scaffold the Roadmap**: Create a `plan` node (e.g., "Project Roadmap") and add `milestone` nodes representing key target phases, connecting them using `part_of` edges.
3. **Scaffold Architecture**: Create `decision` nodes representing core technical choices (e.g., choice of databases, frameworks) and link them to the milestones/tasks using `decided_in` edges.

<!-- vision-memory-mcp:start -->
## Visual Memory (vision-memory-mcp)

This project utilizes `vision-memory-mcp` to cache visual states, record layout transitions, provide element grounding, and avoid repetitive LLM vision calls.

### 1. Mandatory Workflow & Priority
1. **Orient**: Call `get_session_context` to align your visual state context at the start of work.
2. **Search**: Call `recall_memory` (text/image search) before recreating duplicate UI state paths.
3. **Ingest/Verify**: ALWAYS call `analyze_screenshot` before querying any front-end vision models.
   - **Cache Hit (`is_known: true`)**: Do NOT use vision models; read the returned `description` as context and use `grounded_elements` (selectors, coordinates) for action target selection.
   - **Cache Miss (`is_known: false`)**: Query your vision model, then run `analyze_screenshot` with both the image and description to seed the cache.
4. **Action Target Execution**: Use `predict_next_action` to retrieve `grounded_target` handles (`target_selector`, `target_coords`) for deterministic UI clicks and typing.
5. **Transitions**: Call `record_outcome` after every click/type/scroll action to construct navigation paths.
6. **Privacy & Cleanup**: Call `forget_state` to purge sensitive or secret states from storage.

### 2. Tool Reference Summary (15 Core MCP Tools)
* `analyze_screenshot`: Ingest screenshot(s) (single or batch via `items`), lookup cache, return layout description and grounded elements.
* `recall_memory`: Search visual memory by description query or base64 image query (read-only).
* `record_outcome`: Save UI action execution outcomes, transitions, or log visual blockers (`action_type: 'blocker'`).
* `get_navigation_paths`: Find path between states using BFS navigation graph.
* `predict_next_action`: Predict best next UI action and target coordinates based on transition success rates and AX tree grounding.
* `compare_states`: Compare visual states structurally (`has_layout_change`) or compare video recordings (`video_a_id`/`video_b_id`).
* `get_session_context`: Fetch aggregated visual context, recent/frequent states, transitions, cache hit ratios, token savings metrics, and server version info.
* `manage_snapshot`: Unified snapshot management (`save`, `diff`, `export`, `restore`) for visual checkpoints and regression detection.
* `manage_visual_spec`: Visual SDD design contract baseline registration (`set`), live verification (`verify`), and listing (`list`).
* `manage_video`: Unified video memory operations for ingestion (`ingest`), semantic search (`search`), and keyframe timelines (`timeline`).
* `create_evidence_pack`: Create cryptographic, multi-modal evidence pack linking video keyframes, state graph tasks, and visual proof.
* `export_trajectories`: Export multimodal visual transitions and joint workflow trajectories (`json`, `llava`, `qwen2_vl`, `joint`).
* `undo_visual_mutation`: Revert accidental state or transition edge ingestions.
* `forget_state`: Purge a specific state and vector embedding from storage for privacy.
* `wait_for_visual_state`: Poll for target visual state until present or timeout occurs.

#### 3. Agent Permissions & Auto-Run Configuration
To allow cache query and ingestion commands to run automatically without prompting:
* **Google Antigravity (`~/.gemini/config/config.json`)**: Add these rules to your `"globalPermissionGrants"` -> `"allow"` list:
  * `"command(vision-memory-mcp)"` (Allow running the CLI without parameters prompts)
  * `"read_file(.*\\.gemini/antigravity/brain/.*)"` (Allow reading captured screenshots)
  * `"write_file(.*\\.gemini/antigravity/brain/.*)"` (Allow saving visual states)
* **VS Code / Cursor IDE (`settings.json`)**: Ensure the agent has execution permissions for `command(vision-memory-mcp)` and read/write access to the workspace's local `.vision-memory-mcp/` cache directory.
<!-- vision-memory-mcp:end -->

<!-- world-model-mcp:start -->
## Spatial World Model (world-model-mcp)

This project uses `world-model-mcp` with project slug "${projectSlug}` to maintain a persistent 3D/2D spatial internal world model, entity tracking, object permanence, and movement simulation.

### 1. Mandatory Workflow & Priority
1. **Orient & Explore**: Call `get_spatial_map(format: 'summary')` and `get_expected_view` at the start of spatial or simulated tasks.
2. **Entity Queries**: Use `query_entities` (FTS5 search, proximity radius, or entity_id lookup) before creating duplicate objects.
3. **Perception Bridging**:
   - Ingest detected objects from vision models using `ingest_observation`.
   - Reconcile expected vs observed visual state using `ingest_observation(reconcile: true)`.
4. **Spatial Relations**: Record topological containment, support, or proximity using `set_relation` (e.g. `on`, `inside`, `next_to`, `contains`).
5. **Action Simulation & Validation**: Before executing movement, call `simulate_movement` to verify path validity and avoid AABB obstacle collisions, or `simulate_movement(mode: 'navigate')` for waypoint planning.
6. **Goal Alignment**: Link target entities and destination regions to active `state-memory-mcp` tasks using `link_to_goal`.
7. **Action Outcomes**: Record movement success and entity mutations using `record_outcome`.

### 2. Tool Reference Summary (15 Core MCP Tools)
* `update_entity`: Create or update an entity (position, orientation, bounding box, properties, confidence).
* `query_entities`: Search entities by keyword, type, region, spatial proximity, tags, status, or lookup specific entity location/history.
* `set_relation`: Record/update spatial relationships (on, inside, next_to, above, below, near, contains).
* `get_spatial_map`: Export structured spatial layout, topological graph, 3D asset, or high-level summary.
* `simulate_movement`: Predict entity trajectory, test for AABB obstacle collisions, or compute navigation waypoints.
* `ingest_observation`: Merge perception detections into world model; re-identify entities and reconcile frustum view.
* `get_expected_view`: Calculate what entities should be visible from an observer pose and FOV cone.
* `link_to_goal`: Associate entities/regions with state-memory task IDs, or extract goal-relevant context slices.
* `record_outcome`: Update world model after action execution completes.
* `manage_spatial_spec`: Spatial SDD physical contract baseline registration, verification, and listing.
* `create_evidence_pack`: Generate cryptographic SHA-256 evidence packages linking spatial state to tasks.
* `use_spatial_blackboard`: Multi-agent shared spatial blackboard for publishing intentions and claiming mutex locks.
* `manage_snapshot`: Unified spatial snapshot and time-travel management (save, restore, diff, list, undo, history).
* `generate_game_inputs`: Generate Playwright MCP automation inputs or project/unproject 3D coordinates and screen pixels.
* `wait_for_spatial_state`: Poll and wait until an entity reaches a specific spatial condition.
<!-- world-model-mcp:end -->

<!-- webcrypt-mcp:start -->
# Cryptographic Vault & Security (webcrypt-mcp)

This project provides native `webcrypt-mcp` tooling for zero-dependency AES-256-GCM symmetric encryption, RSA-4096 hybrid public-key encryption, digital signatures, cryptographic hashes, and post-quantum cryptography.

## Mandatory Workflow
1. **Confidential Artifacts**: Whenever saving sensitive credentials, tokens, or private workflow states, encrypt them using `encrypt_payload(mode: "data", password: "...")` or `encrypt_payload(mode: "symmetric", password: "...")`.
2. **Key Management**: Use `manage_keys(action: "generate", type: "rsa" | "ecdh" | "hmac")` to generate cryptographically strong JWK-formatted keys for inter-agent communication.
3. **Integrity & Signatures**: Before completing tasks that produce verifiable evidence (such as evidence packs or release binaries), compute signatures or HMAC tags using `sign_verify(action: "sign", algorithm: "ECDSA" | "HMAC")`.
4. **Triple Memory Triad**:
   - `state-memory-mcp`: Workflow state tracking.
   - `vision-memory-mcp`: Visual state caching.
   - `webcrypt-mcp`: Local database vault encryption and evidence pack cryptographic signing.
<!-- webcrypt-mcp:end -->
