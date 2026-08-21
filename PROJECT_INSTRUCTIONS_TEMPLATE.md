<!-- world-model-mcp:start -->
## Spatial World Model (world-model-mcp)

This project uses \`world-model-mcp\` with project slug "{{PROJECT_SLUG}}" to maintain a persistent 3D/2D spatial world model.

### 1. Mandatory Workflow & Priority
1. **Orient & Explore**: Call \`get_world_summary\` and \`get_expected_view\` at the start of spatial or simulated tasks.
2. **Entity Queries**: Use \`query_entities\` (FTS5 search, proximity radius, or type filters) before creating duplicate objects.
3. **Perception Bridging**:
   - Ingest detected objects from vision models using \`ingest_observation\`.
   - Reconcile expected vs observed visual state using \`reconcile_observation\`.
4. **Spatial Relations**: Record topological containment, support, or proximity using \`set_relation\` (e.g. \`on\`, \`inside\`, \`next_to\`, \`contains\`).
5. **Action Simulation & Validation**: Before executing high-stakes movement, call \`simulate_movement\` to verify path validity and avoid AABB obstacle collisions.
6. **Goal Alignment**: Link target entities and destination regions to active \`state-memory-mcp\` tasks using \`link_to_goal\`.
7. **Action Outcomes**: Record movement success and entity mutations using \`record_outcome\`.

### 2. Tool Reference Summary (14 Core MCP Tools)
* \`update_entity\`: Create or update an entity (position, orientation, bounding box, properties, confidence).
* \`query_entities\`: Search entities by keyword, type, region, spatial proximity, tags, or status.
* \`get_location\`: Get current/last-known position and trajectory history for an entity.
* \`set_relation\`: Record/update spatial relationships (on, inside, next_to, above, below, near, contains).
* \`get_spatial_map\`: Export structured spatial layout or topological connectivity graph.
* \`simulate_movement\`: Predict entity trajectory and test for AABB obstacle collisions.
* \`get_navigation_hints\`: Compute topological or waypoint navigation path between entities/locations.
* \`ingest_observation\`: Merge perception detections into world model; re-identify entities.
* \`reconcile_observation\`: Compare incoming vision data against expected frustum view (diff & anomalies).
* \`get_expected_view\`: Calculate what entities should be visible from an observer pose and FOV cone.
* \`get_relevant_context\`: Extract spatial slice relevant to active goal/task.
* \`link_to_goal\`: Associate entities/regions with state-memory task IDs.
* \`record_outcome\`: Update world model after action execution completes.
* \`get_world_summary\`: High-level overview of known environment, entity breakdown, and bounds.
<!-- world-model-mcp:end -->
