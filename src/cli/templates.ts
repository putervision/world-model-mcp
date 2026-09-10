export function getInstructionsTemplate(projectSlug: string): string {
  return `
<!-- world-model-mcp:start -->
## Spatial World Model (world-model-mcp)

This project uses \`world-model-mcp\` with project slug "${projectSlug}" to maintain a persistent 3D/2D spatial internal world model, entity tracking, object permanence, and movement simulation.

### 1. Mandatory Workflow & Priority
1. **Orient & Explore**: Call \`get_spatial_map(format: 'summary')\` and \`get_expected_view\` at the start of spatial or simulated tasks.
2. **Entity Queries**: Use \`query_entities\` (FTS5 search, proximity radius, or entity_id lookup) before creating duplicate objects.
3. **Perception Bridging**:
   - Ingest detected objects from vision models using \`ingest_observation\`.
   - Reconcile expected vs observed visual state using \`ingest_observation(reconcile: true)\`.
4. **Spatial Relations**: Record topological containment, support, or proximity using \`set_relation\` (e.g. \`on\`, \`inside\`, \`next_to\`, \`contains\`).
5. **Action Simulation & Validation**: Before executing movement, call \`simulate_movement\` to verify path validity and avoid AABB obstacle collisions, or \`simulate_movement(mode: 'navigate')\` for waypoint planning.
6. **Goal Alignment**: Link target entities and destination regions to active \`state-memory-mcp\` tasks using \`link_to_goal\`.
7. **Action Outcomes**: Record movement success and entity mutations using \`record_outcome\`.

### 2. Tool Reference Summary (15 Core MCP Tools)
* \`update_entity\`: Create or update an entity (position, orientation, bounding box, properties, confidence).
* \`query_entities\`: Search entities by keyword, type, region, spatial proximity, tags, status, or lookup specific entity location/history.
* \`set_relation\`: Record/update spatial relationships (on, inside, next_to, above, below, near, contains).
* \`get_spatial_map\`: Export structured spatial layout, topological graph, 3D asset, or high-level summary.
* \`simulate_movement\`: Predict entity trajectory, test for AABB obstacle collisions, or compute navigation waypoints.
* \`ingest_observation\`: Merge perception detections into world model; re-identify entities and reconcile frustum view.
* \`get_expected_view\`: Calculate what entities should be visible from an observer pose and FOV cone.
* \`link_to_goal\`: Associate entities/regions with state-memory task IDs, or extract goal-relevant context slices.
* \`record_outcome\`: Update world model after action execution completes.
* \`manage_spatial_spec\`: Spatial SDD physical contract baseline registration, verification, and listing.
* \`create_evidence_pack\`: Generate cryptographic SHA-256 evidence packages linking spatial state to tasks.
* \`use_spatial_blackboard\`: Multi-agent shared spatial blackboard for publishing intentions and claiming mutex locks.
* \`manage_snapshot\`: Unified spatial snapshot and time-travel management (save, restore, diff, list, undo, history).
* \`generate_game_inputs\`: Generate Playwright MCP automation inputs or project/unproject 3D coordinates and screen pixels.
* \`wait_for_spatial_state\`: Poll and wait until an entity reaches a specific spatial condition.
<!-- world-model-mcp:end -->
`;
}

export function getGlobalRulesTemplate(projectSlug: string): string {
  return `
<!-- world-model-mcp:start -->
# Spatial World Model (world-model-mcp)

This project uses world-model-mcp with project slug "${projectSlug}" to maintain a persistent 3D/2D spatial world model for AI agents.
ALWAYS query the world model for spatial layout, entity positions, and object permanence.

## Mandatory Workflow
1. **Orient**: Call \`get_spatial_map(format: 'summary')\` and \`query_entities\` before planning spatial actions.
2. **Perception**: Call \`ingest_observation\` with vision detections to persist entities.
3. **Simulation**: Call \`simulate_movement\` to test for collisions before moving.
4. **State Links**: Link spatial entities to goals using \`link_to_goal\`.
<!-- world-model-mcp:end -->
`;
}

export function getMcpConfigCursor(projectSlug: string): Record<string, unknown> {
  return {
    mcpServers: {
      'world-model-mcp': {
        command: 'world-model-mcp',
        args: ['run'],
        env: {
          WORLD_MODEL_MCP_PROJECT: projectSlug,
        },
      },
    },
  };
}

export function getMcpConfigVscode(projectSlug: string): Record<string, unknown> {
  return {
    servers: {
      'world-model-mcp': {
        type: 'stdio',
        command: 'world-model-mcp',
        args: ['run'],
        env: {
          WORLD_MODEL_MCP_PROJECT: projectSlug,
        },
      },
    },
  };
}

export function getMcpConfigAntigravity(): Record<string, unknown> {
  return {
    mcpServers: {
      'world-model-mcp': {
        command: 'world-model-mcp',
        args: ['run'],
      },
    },
  };
}

export function getSkillTemplate(projectSlug: string): string {
  return `---
name: world-model-mcp
description: Teaches the agent to use the Spatial World Model MCP server to track entities, 3D/2D positions, spatial relationships, object permanence, and movement simulation.
---

# Spatial World Model (world-model-mcp)

This skill provides step-by-step guidance and operational patterns for interacting with \`@putervision/world-model-mcp\`.

---

## 1. Role in the PuterVision Triad
- **Perception Layer** (\`vision-memory-mcp\`): Ingests images, detects bounding boxes, extracts OCR.
- **World Model Layer** (\`world-model-mcp\`): Maintains persistent 3D/2D coordinates, bounding volumes, topological relations, and object permanence.
- **Action/State Layer** (\`state-memory-mcp\`): Manages task execution DAGs, decisions, blockers, and milestones.

---

## 2. Core Operational Sequence
1. **Inspect World**: Call \`get_spatial_map\` with \`format: 'summary'\` to check total entities and spatial bounding box.
2. **Proximity Lookup**: Call \`query_entities\` with \`near_position\` and \`max_distance\`, or \`entity_id\` for direct lookup.
3. **Ingest Perception**: When new visual elements are detected, call \`ingest_observation\`.
4. **Collision Pre-Check**: Call \`simulate_movement\` before issuing action commands.
5. **Update State**: Call \`record_outcome\` after actions complete.

---

## 3. Tool Reference (15 Tools)

| Tool Name | Key Inputs | Description |
|-----------|------------|-------------|
| \`update_entity\` | name, type, position, bounding_box, properties | Upsert entity into spatial memory |
| \`query_entities\` | query, type, near_position, entity_id, include_history | Find entities by text search, proximity, or entity ID |
| \`set_relation\` | source_id, relation, target_id, offset | Record spatial relationship (on, inside, near, etc.) |
| \`get_spatial_map\` | region_id, format (json, gltf, obj, summary) | Export structured spatial layout or summary |
| \`simulate_movement\` | entity_id, delta_position, mode, check_collisions | Predict movement path or compute navigation waypoints |
| \`ingest_observation\` | observer_pose, detections, visual_state_id, reconcile | Ingest perception detections and reconcile frustum view |
| \`get_expected_view\` | observer_position, observer_orientation, fov | Calculate visible entities from observer pose |
| \`link_to_goal\` | task_id, entity_id, relationship, action | Associate entity with task or extract spatial slice |
| \`record_outcome\` | action_name, success, resulting_position | Update world state after action completion |
| \`manage_spatial_spec\` | action, name, bounds, constraints | Spatial SDD contract registration and verification |
| \`create_evidence_pack\` | task_id, entity_ids, snapshot_ids | Immutable cryptographic evidence package |
| \`use_spatial_blackboard\` | action, topic, sender, payload | Multi-agent coordination and mutex locks |
| \`manage_snapshot\` | action, name, snapshot_a, snapshot_b, entity_id | Snapshots, diffs, undo mutations, and time-travel |
| \`generate_game_inputs\` | entity_id, target_position, control_profile, action | Playwright game inputs and screen coordinate projection |
| \`wait_for_spatial_state\` | entity_id, condition, threshold, timeout_ms | Polling and waiting for spatial state condition |
`;
}

export function getAgentsMdTemplate(projectSlug: string): string {
  return `
<!-- world-model-mcp:start -->
# Spatial World Model (world-model-mcp)

This project uses \`world-model-mcp\` with project slug "${projectSlug}" to track entities, 3D/2D coordinates, spatial topology, and object permanence.
ALWAYS update and query the world model when interacting with spatial or environmental state.

## Mandatory Workflow
1. **Start of session**: Call \`get_spatial_map(format: 'summary')\` and \`query_entities\` to align spatial context.
2. **Perception integration**: Call \`ingest_observation\` to persist detections from visual memory.
3. **Simulation**: Call \`simulate_movement\` before issuing movement commands.
4. **Goal linking**: Call \`link_to_goal\` to connect entities with task IDs in \`state-memory-mcp\`.
5. **Outcome recording**: Call \`record_outcome\` after actions complete.
<!-- world-model-mcp:end -->
`;
}
