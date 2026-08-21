---
name: world-model-mcp-exercises
description: Comprehensive exercise script to verify all 15 world-model-mcp MCP tools in a live chat session. Builds a coherent test world, exercises every tool, and validates outputs.
---

# World Model MCP — Live Tool Exercise Suite

This skill provides a **complete, ordered exercise script** that tests all 15 `world-model-mcp` MCP tools in a live chat session. It builds a coherent "Medieval Courtyard" test world from scratch and exercises every tool action, then cleans up.

> **Purpose**: Smoke-test and verify that the world-model-mcp server is functioning correctly after deployment, upgrade, or code changes.

---

## Prerequisites

- `world-model-mcp` MCP server must be running and connected (check with `get_spatial_map`)
- Use `project: "exercise-test"` for all calls to avoid contaminating real project data
- Each step builds on the previous — execute in order

---

## Exercise Sequence (15 Tools, 25+ Calls)

### Step 1: `update_entity` — Create Entities

Create a set of test entities forming a Medieval Courtyard scene.

**Call 1a — Create the Player Agent:**
```json
{
  "tool": "update_entity",
  "arguments": {
    "name": "Knight",
    "type": "agent",
    "status": "active",
    "position": { "x": 0, "y": 0, "z": 0 },
    "orientation": { "pitch": 0, "yaw": 90, "roll": 0 },
    "bounding_box": { "width": 1.0, "height": 2.0, "depth": 1.0 },
    "confidence": 1.0,
    "properties": { "health": 100, "armor": "plate", "weapon": "sword" },
    "tags": ["player", "warrior", "friendly"],
    "project": "exercise-test"
  }
}
```

**Expected**: Returns `entity_id` (ULID string), `version: 1`.

**Call 1b — Create a Treasure Chest:**
```json
{
  "tool": "update_entity",
  "arguments": {
    "name": "Treasure Chest",
    "type": "container",
    "position": { "x": 10, "y": 0, "z": 5 },
    "bounding_box": { "width": 1.2, "height": 0.8, "depth": 0.8 },
    "properties": { "is_locked": true, "contents": "gold_coins" },
    "tags": ["loot", "interactive"],
    "project": "exercise-test"
  }
}
```

**Call 1c — Create a Stone Wall (obstacle):**
```json
{
  "tool": "update_entity",
  "arguments": {
    "name": "Stone Wall",
    "type": "obstacle",
    "position": { "x": 5, "y": 0, "z": 3 },
    "bounding_box": { "width": 8.0, "height": 3.0, "depth": 1.0 },
    "confidence": 1.0,
    "tags": ["structure", "blocking"],
    "project": "exercise-test"
  }
}
```

**Call 1d — Create a Watchtower (landmark):**
```json
{
  "tool": "update_entity",
  "arguments": {
    "name": "Watchtower",
    "type": "landmark",
    "position": { "x": 15, "y": 0, "z": -10 },
    "bounding_box": { "width": 4.0, "height": 12.0, "depth": 4.0 },
    "properties": { "floors": 3, "has_ladder": true },
    "tags": ["structure", "climbable", "vantage_point"],
    "project": "exercise-test"
  }
}
```

**Call 1e — Create a Goblin (NPC):**
```json
{
  "tool": "update_entity",
  "arguments": {
    "name": "Goblin Scout",
    "type": "npc",
    "position": { "x": 12, "y": 0, "z": 8 },
    "bounding_box": { "width": 0.8, "height": 1.2, "depth": 0.8 },
    "confidence": 0.7,
    "properties": { "hostile": true, "patrol_route": "east_wall" },
    "tags": ["enemy", "patrol"],
    "project": "exercise-test"
  }
}
```

**✅ Verify**: Save all returned `entity_id` values — they are needed in subsequent steps.

---

### Step 2: `query_entities` — Search & Locate

**Call 2a — Full-text search:**
```json
{
  "tool": "query_entities",
  "arguments": {
    "query": "chest treasure",
    "project": "exercise-test"
  }
}
```
**Expected**: Returns Treasure Chest entity.

**Call 2b — Proximity search (find entities near the Knight):**
```json
{
  "tool": "query_entities",
  "arguments": {
    "near_position": { "x": 0, "y": 0, "z": 0 },
    "max_distance": 15,
    "project": "exercise-test"
  }
}
```
**Expected**: Returns Knight, Stone Wall, Treasure Chest (all within 15 units).

**Call 2c — Entity location lookup with history:**
```json
{
  "tool": "query_entities",
  "arguments": {
    "entity_id": "<KNIGHT_ID>",
    "include_history": true,
    "history_limit": 10,
    "project": "exercise-test"
  }
}
```
**Expected**: Returns entity details with `history` array.

**Call 2d — Filter by type:**
```json
{
  "tool": "query_entities",
  "arguments": {
    "type": "npc",
    "project": "exercise-test"
  }
}
```
**Expected**: Returns Goblin Scout only.

---

### Step 3: `set_relation` — Record Spatial Relationships

**Call 3a — Chest is next to Wall:**
```json
{
  "tool": "set_relation",
  "arguments": {
    "source_id": "<CHEST_ID>",
    "relation": "next_to",
    "target_id": "<WALL_ID>",
    "distance": 3.6,
    "project": "exercise-test"
  }
}
```

**Call 3b — Goblin is near the Watchtower:**
```json
{
  "tool": "set_relation",
  "arguments": {
    "source_id": "<GOBLIN_ID>",
    "relation": "near",
    "target_id": "<WATCHTOWER_ID>",
    "distance": 18.4,
    "project": "exercise-test"
  }
}
```

**Expected**: Returns `relation_id` for each.

---

### Step 4: `get_spatial_map` — Export World State

**Call 4a — JSON export:**
```json
{
  "tool": "get_spatial_map",
  "arguments": {
    "format": "json",
    "project": "exercise-test"
  }
}
```

**Call 4b — Summary overview:**
```json
{
  "tool": "get_spatial_map",
  "arguments": {
    "format": "summary",
    "project": "exercise-test"
  }
}
```
**Expected**: `total_entities: 5`, `total_relations: 2`, bounding box extents.

**Call 4c — glTF 3D export:**
```json
{
  "tool": "get_spatial_map",
  "arguments": {
    "format": "gltf",
    "project": "exercise-test"
  }
}
```
**Expected**: Valid glTF 2.0 JSON with `asset.version: "2.0"`, `nodes`, `meshes`.

---

### Step 5: `simulate_movement` — Physics & Navigation

**Call 5a — Simulate Knight movement (collision check):**
```json
{
  "tool": "simulate_movement",
  "arguments": {
    "entity_id": "<KNIGHT_ID>",
    "delta_position": { "x": 5, "y": 0, "z": 3 },
    "check_collisions": true,
    "project": "exercise-test"
  }
}
```
**Expected**: Collision detected with Stone Wall.

**Call 5b — Navigate around obstacle:**
```json
{
  "tool": "simulate_movement",
  "arguments": {
    "mode": "navigate",
    "start_entity_id": "<KNIGHT_ID>",
    "target_entity_id": "<CHEST_ID>",
    "project": "exercise-test"
  }
}
```
**Expected**: Returns navigation waypoints.

---

### Step 6: `ingest_observation` — Perception Bridging

**Call 6a — Ingest vision detections:**
```json
{
  "tool": "ingest_observation",
  "arguments": {
    "observer_pose": {
      "position": { "x": 0, "y": 2, "z": 0 },
      "orientation": { "pitch": 0, "yaw": 45, "roll": 0 }
    },
    "field_of_view": { "fov_horizontal": 90, "fov_vertical": 60 },
    "detections": [
      {
        "label": "Treasure Chest",
        "class_name": "container",
        "estimated_position": { "x": 10.2, "y": 0.1, "z": 5.1 },
        "confidence": 0.92
      },
      {
        "label": "Unknown Barrel",
        "class_name": "object",
        "estimated_position": { "x": 3, "y": 0, "z": -2 },
        "confidence": 0.65
      }
    ],
    "project": "exercise-test"
  }
}
```
**Expected**: Treasure Chest re-identified (matched), Unknown Barrel created as new entity.

**Call 6b — Reconciliation mode:**
```json
{
  "tool": "ingest_observation",
  "arguments": {
    "reconcile": true,
    "observer_pose": {
      "position": { "x": 0, "y": 2, "z": 0 },
      "orientation": { "pitch": 0, "yaw": 45, "roll": 0 }
    },
    "field_of_view": { "fov_horizontal": 90, "fov_vertical": 60 },
    "detections": [
      {
        "label": "Treasure Chest",
        "class_name": "container",
        "estimated_position": { "x": 10, "y": 0, "z": 5 },
        "confidence": 0.95
      }
    ],
    "project": "exercise-test"
  }
}
```
**Expected**: Returns reconciliation report with `confirmed`, `new`, `missing`, `displaced` arrays.

---

### Step 7: `get_expected_view` — Frustum Visibility

```json
{
  "tool": "get_expected_view",
  "arguments": {
    "observer_position": { "x": 0, "y": 2, "z": 0 },
    "observer_orientation": { "pitch": 0, "yaw": 45, "roll": 0 },
    "fov_degrees": 90,
    "max_distance": 50,
    "project": "exercise-test"
  }
}
```
**Expected**: Returns list of `visible_entities` with distances and angular offsets.

---

### Step 8: `link_to_goal` — State Memory Integration

**Call 8a — Link entity to a task:**
```json
{
  "tool": "link_to_goal",
  "arguments": {
    "action": "link",
    "task_id": "test-task-001",
    "entity_id": "<CHEST_ID>",
    "relationship": "target",
    "notes": "Retrieve treasure from locked chest",
    "project": "exercise-test"
  }
}
```

**Call 8b — Get goal-relevant context:**
```json
{
  "tool": "link_to_goal",
  "arguments": {
    "action": "get_context",
    "task_id": "test-task-001",
    "current_agent_position": { "x": 0, "y": 0, "z": 0 },
    "radius": 30,
    "project": "exercise-test"
  }
}
```
**Expected**: Returns linked entities, nearby entities, and spatial context slice.

---

### Step 9: `record_outcome` — Log Action Results

**Call 9a — Record successful movement:**
```json
{
  "tool": "record_outcome",
  "arguments": {
    "action_name": "move_to",
    "entity_id": "<KNIGHT_ID>",
    "success": true,
    "resulting_position": { "x": 8, "y": 0, "z": 4 },
    "task_id": "test-task-001",
    "project": "exercise-test"
  }
}
```

**Call 9b — Record property mutation:**
```json
{
  "tool": "record_outcome",
  "arguments": {
    "action_name": "unlock",
    "entity_id": "<CHEST_ID>",
    "success": true,
    "property_changes": { "is_locked": false },
    "project": "exercise-test"
  }
}
```

**Expected**: Both return updated entity state.

---

### Step 10: `manage_spatial_spec` — SDD Contracts

**Call 10a — Register a spec:**
```json
{
  "tool": "manage_spatial_spec",
  "arguments": {
    "action": "set",
    "name": "courtyard-bounds",
    "description": "All entities must remain within the courtyard perimeter",
    "bounds": {
      "min": { "x": -20, "y": -1, "z": -20 },
      "max": { "x": 30, "y": 15, "z": 20 }
    },
    "constraints": [
      { "type": "no_overlap", "description": "No two solid entities may intersect" }
    ],
    "project": "exercise-test"
  }
}
```

**Call 10b — Verify the spec:**
```json
{
  "tool": "manage_spatial_spec",
  "arguments": {
    "action": "verify",
    "name": "courtyard-bounds",
    "project": "exercise-test"
  }
}
```
**Expected**: Returns `passed: true` with verification details.

**Call 10c — List all specs:**
```json
{
  "tool": "manage_spatial_spec",
  "arguments": {
    "action": "list",
    "project": "exercise-test"
  }
}
```

---

### Step 11: `create_evidence_pack` — Cryptographic Proof

```json
{
  "tool": "create_evidence_pack",
  "arguments": {
    "task_id": "test-task-001",
    "entity_ids": ["<KNIGHT_ID>", "<CHEST_ID>"],
    "project": "exercise-test"
  }
}
```
**Expected**: Returns evidence pack with `sha256_hash`, `entity_snapshots`, `created_at`.

---

### Step 12: `use_spatial_blackboard` — Multi-Agent Coordination

**Call 12a — Post a navigation intent:**
```json
{
  "tool": "use_spatial_blackboard",
  "arguments": {
    "action": "post",
    "topic": "navigation-intent",
    "sender": "agent-knight",
    "payload": {
      "destination": { "x": 10, "y": 0, "z": 5 },
      "eta_seconds": 15
    },
    "ttl_seconds": 120,
    "project": "exercise-test"
  }
}
```

**Call 12b — Read the blackboard:**
```json
{
  "tool": "use_spatial_blackboard",
  "arguments": {
    "action": "read",
    "topic": "navigation-intent",
    "project": "exercise-test"
  }
}
```
**Expected**: Returns posted message with sender, payload, expiry.

**Call 12c — Claim a mutex lock:**
```json
{
  "tool": "use_spatial_blackboard",
  "arguments": {
    "action": "claim",
    "topic": "chest-access",
    "sender": "agent-knight",
    "resource_id": "<CHEST_ID>",
    "duration_seconds": 30,
    "project": "exercise-test"
  }
}
```
**Expected**: Returns `claimed: true`.

**Call 12d — Release the lock:**
```json
{
  "tool": "use_spatial_blackboard",
  "arguments": {
    "action": "release",
    "topic": "chest-access",
    "sender": "agent-knight",
    "resource_id": "<CHEST_ID>",
    "project": "exercise-test"
  }
}
```

---

### Step 13: `manage_snapshot` — Snapshots & Time Travel

**Call 13a — Save a snapshot:**
```json
{
  "tool": "manage_snapshot",
  "arguments": {
    "action": "save",
    "name": "before-battle",
    "description": "World state before engaging the goblin",
    "project": "exercise-test"
  }
}
```

**Call 13b — Modify world, then save another snapshot:**

First call `record_outcome` to destroy the Goblin:
```json
{
  "tool": "record_outcome",
  "arguments": {
    "action_name": "attack",
    "entity_id": "<GOBLIN_ID>",
    "success": true,
    "destroyed": true,
    "project": "exercise-test"
  }
}
```

Then save:
```json
{
  "tool": "manage_snapshot",
  "arguments": {
    "action": "save",
    "name": "after-battle",
    "description": "World state after defeating the goblin",
    "project": "exercise-test"
  }
}
```

**Call 13c — Diff the two snapshots:**
```json
{
  "tool": "manage_snapshot",
  "arguments": {
    "action": "diff",
    "snapshot_a": "before-battle",
    "snapshot_b": "after-battle",
    "project": "exercise-test"
  }
}
```
**Expected**: Shows Goblin Scout as `removed` or `status_changed` to `destroyed`.

**Call 13d — List all snapshots:**
```json
{
  "tool": "manage_snapshot",
  "arguments": {
    "action": "list",
    "project": "exercise-test"
  }
}
```

**Call 13e — Undo last mutation:**
```json
{
  "tool": "manage_snapshot",
  "arguments": {
    "action": "undo",
    "entity_id": "<GOBLIN_ID>",
    "project": "exercise-test"
  }
}
```
**Expected**: Goblin Scout restored to `active` status.

---

### Step 14: `generate_game_inputs` — Playwright Automation

**Call 14a — Generate WASD movement inputs:**
```json
{
  "tool": "generate_game_inputs",
  "arguments": {
    "action": "generate_inputs",
    "entity_id": "<KNIGHT_ID>",
    "target_entity_id": "<CHEST_ID>",
    "control_profile": {
      "scheme": "wasd",
      "move_speed": 5.0,
      "turn_speed": 90.0
    },
    "project": "exercise-test"
  }
}
```
**Expected**: Returns timed `keydown`/`keyup` action sequence.

**Call 14b — Project 3D → 2D screen coordinates:**
```json
{
  "tool": "generate_game_inputs",
  "arguments": {
    "action": "project_screen",
    "world_position": { "x": 10, "y": 0, "z": 5 },
    "camera": {
      "position": { "x": 0, "y": 2, "z": 0 },
      "orientation": { "pitch": 0, "yaw": 45, "roll": 0 },
      "fov_degrees": 60
    },
    "viewport": { "width": 1920, "height": 1080 },
    "project": "exercise-test"
  }
}
```
**Expected**: Returns `screen_x`, `screen_y` pixel coordinates.

**Call 14c — Unproject 2D → 3D ray:**
```json
{
  "tool": "generate_game_inputs",
  "arguments": {
    "action": "unproject_ray",
    "screen_x": 960,
    "screen_y": 540,
    "camera": {
      "position": { "x": 0, "y": 2, "z": 0 },
      "orientation": { "pitch": 0, "yaw": 45, "roll": 0 },
      "fov_degrees": 60
    },
    "viewport": { "width": 1920, "height": 1080 },
    "ground_elevation": 0,
    "project": "exercise-test"
  }
}
```
**Expected**: Returns `ray_origin`, `ray_direction`, `ground_intercept`.

---

### Step 15: `wait_for_spatial_state` — Async Polling

```json
{
  "tool": "wait_for_spatial_state",
  "arguments": {
    "entity_id": "<KNIGHT_ID>",
    "condition": "active",
    "timeout_ms": 3000,
    "poll_interval_ms": 250,
    "project": "exercise-test"
  }
}
```
**Expected**: Returns immediately with `met: true` since Knight is already active.

---

## Verification Checklist

After completing all 15 steps, validate:

| # | Tool | Exercised Actions | Pass Criteria |
|---|------|-------------------|---------------|
| 1 | `update_entity` | create, update | 5 entities created with valid ULIDs |
| 2 | `query_entities` | FTS, proximity, entity_id lookup, type filter | All return correct results |
| 3 | `set_relation` | add relation | 2 relations created |
| 4 | `get_spatial_map` | json, summary, gltf | 5 entities, valid glTF 2.0 |
| 5 | `simulate_movement` | simulate (collision), navigate | Collision detected, waypoints returned |
| 6 | `ingest_observation` | basic ingest, reconcile | Re-identification + new entity, reconciliation report |
| 7 | `get_expected_view` | frustum query | Visible entities returned |
| 8 | `link_to_goal` | link, get_context | Goal linked, context slice returned |
| 9 | `record_outcome` | move, unlock | Entity position and properties updated |
| 10 | `manage_spatial_spec` | set, verify, list | Spec passes verification |
| 11 | `create_evidence_pack` | create | SHA-256 hash in response |
| 12 | `use_spatial_blackboard` | post, read, claim, release | Messages visible, mutex works |
| 13 | `manage_snapshot` | save, diff, list, undo | Diff shows goblin change, undo restores |
| 14 | `generate_game_inputs` | generate, project, unproject | WASD actions, screen coords, ray |
| 15 | `wait_for_spatial_state` | wait (active) | `met: true` returned |

---

## Cleanup

After all exercises pass, the test data lives in a separate `"exercise-test"` project database and does **not** affect other projects. The database file is located at:

```
.world-model-mcp/exercise-test.db
```

To clean up, simply delete this file or run:
```bash
rm -f .world-model-mcp/exercise-test.db
```

---

## Troubleshooting

| Issue | Resolution |
|-------|------------|
| Tool not found | Verify MCP server is running: `node dist/index.js` or `world-model-mcp run` |
| Project auto-detection fails | Pass `"project": "exercise-test"` explicitly in every call |
| Entity ID not found | Ensure you captured the `entity_id` from Step 1 and substituted `<KNIGHT_ID>` etc. |
| Collision not detected | Verify Stone Wall bounding box overlaps with the movement path |
| Snapshot diff empty | Ensure the Goblin was destroyed between the two snapshots |
