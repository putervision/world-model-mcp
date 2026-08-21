# Database Schema — @putervision/world-model-mcp

`@putervision/world-model-mcp` uses SQLite with WAL (Write-Ahead Logging) mode and FTS5 full-text indexing.

---

## Tables

### 1. `entities`
- `id TEXT PRIMARY KEY` (ULID)
- `project TEXT NOT NULL`
- `name TEXT NOT NULL`
- `type TEXT NOT NULL` (`object`, `agent`, `landmark`, `region`, `waypoint`, `container`, `surface`, `npc`, `item`, `obstacle`, `custom`)
- `status TEXT NOT NULL DEFAULT 'active'` (`active`, `hidden`, `lost`, `destroyed`)
- `x REAL`, `y REAL`, `z REAL` (3D position)
- `pitch REAL`, `yaw REAL`, `roll REAL` (Euler orientation)
- `bbox_width REAL`, `bbox_height REAL`, `bbox_depth REAL` (AABB dimensions)
- `confidence REAL NOT NULL DEFAULT 1.0` (Object permanence confidence)
- `parent_id TEXT`, `region_id TEXT`
- `properties_json TEXT`, `tags_json TEXT`
- `last_seen_at TEXT NOT NULL`, `created_at TEXT NOT NULL`, `updated_at TEXT NOT NULL`
- `version INTEGER NOT NULL DEFAULT 1`

### 2. `spatial_relations`
- `id TEXT PRIMARY KEY`
- `project TEXT NOT NULL`
- `source_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE`
- `relation TEXT NOT NULL` (`on`, `inside`, `next_to`, `above`, `below`, `near`, `contains`, `occluded_by`, `connected_to`, `facing`, `holding`, `part_of`, `custom`)
- `target_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE`
- `offset_x REAL`, `offset_y REAL`, `offset_z REAL`, `distance REAL`
- `metadata_json TEXT`
- `created_at TEXT NOT NULL`, `updated_at TEXT NOT NULL`

### 3. `entity_history` (Cryptographic Event Ledger)
- `id TEXT PRIMARY KEY`, `project TEXT NOT NULL`, `entity_id TEXT NOT NULL`
- `action TEXT NOT NULL`
- `x REAL`, `y REAL`, `z REAL`, `confidence REAL`, `source TEXT`
- `visual_state_id TEXT`, `task_id TEXT`, `details_json TEXT`, `timestamp TEXT NOT NULL`
- `prev_hash TEXT`, `hash TEXT` (SHA-256 event chaining)

### 4. `spatial_specs` (Spatial SDD)
- `id TEXT PRIMARY KEY`, `project TEXT NOT NULL`, `name TEXT NOT NULL`
- `description TEXT`, `bounds_json TEXT`, `constraints_json TEXT`, `sdd_requirement_id TEXT`
- `created_at TEXT NOT NULL`, `updated_at TEXT NOT NULL`

### 5. `blackboard_items` (Multi-Agent Coordination)
- `id TEXT PRIMARY KEY`, `project TEXT NOT NULL`, `topic TEXT NOT NULL`, `sender TEXT NOT NULL`
- `payload_json TEXT NOT NULL`, `claimed_by TEXT`, `claimed_until TEXT`, `expires_at TEXT`, `created_at TEXT NOT NULL`

### 6. `evidence_packs` (Cryptographic Verification)
- `id TEXT PRIMARY KEY`, `project TEXT NOT NULL`, `task_id TEXT`
- `entity_ids_json TEXT`, `observation_ids_json TEXT`, `before_snapshot_id TEXT`, `after_snapshot_id TEXT`
- `payload_json TEXT NOT NULL`, `sha256_hash TEXT NOT NULL`, `created_at TEXT NOT NULL`

### 7. `observations`, `regions`, `goal_links`, `snapshots`
