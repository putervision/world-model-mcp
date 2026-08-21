# API Reference — @putervision/world-model-mcp

Complete reference for all 15 Model Context Protocol (MCP) tools provided by `@putervision/world-model-mcp`.

---

## Tool Summary

| Tool Name | Type | Purpose |
| :--- | :--- | :--- |
| `update_entity` | Mutation | Create or update 3D entities with position, orientation, AABB bounding volume, confidence, tags, and custom properties |
| `query_entities` | Read-only | Search entities by keyword (FTS5), type, status, spatial radius, tags, or fetch specific entity location & trajectory history (`entity_id`, `include_history`) |
| `set_relation` | Mutation | Record or remove spatial relationships (`on`, `inside`, `next_to`, `above`, `below`, `near`, `contains`, `occluded_by`, `holding`, `facing`) |
| `get_spatial_map` | Read-only | Export complete environment map (JSON, GeoJSON, glTF 2.0, OBJ, joint) or get high-level environment summary (`format: "summary"`) |
| `simulate_movement` | Read-only | Predict entity trajectory, test for AABB obstacle collisions, or compute waypoint navigation paths (`mode: "simulate" \| "navigate" \| "waypoints"`) |
| `ingest_observation` | Mutation | Ingest vision detections and re-identify entities via Euclidean proximity, with optional frustum reconciliation analysis (`reconcile: true`) |
| `get_expected_view` | Read-only | Calculate visible entities from observer pose and FOV cone with 3D ray-AABB occlusion culling |
| `link_to_goal` | Mutation / Read | Associate entities and regions with State Memory task IDs (`link`, `unlink`), or extract goal-relevant spatial context slices (`action: "get_context"`) |
| `record_outcome` | Mutation | Record action execution results, movement deltas, property changes, or entity destruction |
| `manage_spatial_spec` | Mutation / Read | Manage Spatial SDD baseline contracts and run automated verification against physical constraints |
| `create_evidence_pack` | Mutation | Package cryptographic SHA-256 evidence bundles linking spatial proofs to task nodes |
| `use_spatial_blackboard` | Mutation / Read | Multi-agent topic-based spatial blackboard with TTL and mutex lock claiming/releasing |
| `manage_snapshot` | Mutation / Read | Unified spatial snapshot and time-travel management: save checkpoints, restore states, diff two snapshots, list history, undo mutations, or inspect world state at historical timestamps |
| `generate_game_inputs` | Read-only | Translate 3D navigation paths into Playwright commands (WASD/click-to-move) or project/unproject 3D coordinates and screen pixels (`action: "generate_inputs" \| "project_screen" \| "unproject_ray"`) |
| `wait_for_spatial_state` | Read-only | Poll and wait until an entity reaches a specific spatial state (exists, active, confidence above threshold, or enters region) |

---

## Legacy Tool Mapping (Backward Compatibility)

Calls to older legacy tools are automatically translated and adapted by `compat-shim.ts` and `advisor.ts`:

| Legacy Tool Name | Consolidated Target | Automatic Adaptation |
| :--- | :--- | :--- |
| `get_location` / `get_entity_location` | `query_entities` | Routes with `entity_id` and `include_history` |
| `get_world_summary` | `get_spatial_map` | Injects `format: "summary"` |
| `get_navigation_hints` | `simulate_movement` | Injects `mode: "navigate"` |
| `reconcile_observation` | `ingest_observation` | Injects `reconcile: true` |
| `get_relevant_context` | `link_to_goal` | Injects `action: "get_context"` |
| `undo_mutation` | `manage_snapshot` | Injects `action: "undo"` |
| `project_to_screen` | `generate_game_inputs` | Injects `action: "project_screen"` or `"unproject_ray"` |

---

## Example Tool Invocations

### 1. `update_entity`
```json
{
  "name": "Treasure Chest",
  "type": "container",
  "status": "active",
  "position": { "x": 10.0, "y": 0.0, "z": 5.0 },
  "bounding_box": { "width": 1.2, "height": 0.8, "depth": 0.8 },
  "confidence": 1.0,
  "properties": { "is_locked": true }
}
```

### 2. `query_entities` (Location & Trajectory Lookup)
```json
{
  "entity_id": "chest_01",
  "include_history": true,
  "history_limit": 10
}
```

### 3. `simulate_movement` (Navigation Waypoints)
```json
{
  "mode": "navigate",
  "start_entity_id": "agent_player",
  "target_entity_id": "chest_01"
}
```

### 4. `generate_game_inputs` (Screen Projection & Playwright Inputs)
```json
{
  "action": "project_screen",
  "entity_id": "chest_01",
  "camera": {
    "position": { "x": 0.0, "y": 12.0, "z": 18.0 },
    "orientation": { "pitch": -30, "yaw": 0, "roll": 0 },
    "fov_degrees": 60
  },
  "viewport": { "width": 1920, "height": 1080 }
}
```
