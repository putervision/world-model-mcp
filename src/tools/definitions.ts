export const READ_ONLY_TOOLS = new Set([
  'query_entities',
  'get_spatial_map',
  'simulate_movement',
  'get_expected_view',
  'generate_game_inputs',
  'wait_for_spatial_state',
]);

export const DESTRUCTIVE_TOOLS = new Set(['use_spatial_blackboard', 'manage_snapshot']);

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const toolDefinitions: ToolDefinition[] = [
  // 1. update_entity
  {
    name: 'update_entity',
    description:
      'Create or upsert one spatial entity (position, orientation, AABB, tags, properties, confidence). Manual authoring only. ' +
      'Omit id to create (ULID assigned). Provide id to update. Omitted fields are preserved; this is a partial merge, not a full replace. status defaults to active. confidence is 0.0–1.0 object-permanence. Does not ingest vision detections or apply action results. ' +
      'Returns {ok, entity_id, created:boolean, entity}. ' +
      'Use update_entity instead of ingest_observation when authoring entities directly rather than merging perception detections.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Optional entity ID (auto-generated ULID if omitted for creation)',
        },
        name: { type: 'string', description: 'Human-readable name or label of the entity' },
        type: {
          type: 'string',
          enum: [
            'object',
            'agent',
            'landmark',
            'region',
            'waypoint',
            'container',
            'surface',
            'npc',
            'item',
            'obstacle',
            'custom',
          ],
          description: 'Categorical entity type',
        },
        status: {
          type: 'string',
          enum: ['active', 'hidden', 'lost', 'destroyed'],
          description: 'Entity lifecycle status (default: active)',
        },
        position: {
          type: 'object',
          properties: {
            x: { type: 'number', description: 'X coordinate' },
            y: { type: 'number', description: 'Y coordinate' },
            z: { type: 'number', description: 'Z coordinate' },
          },
          description: '3D world position coordinates',
        },
        orientation: {
          type: 'object',
          properties: {
            pitch: { type: 'number' },
            yaw: { type: 'number' },
            roll: { type: 'number' },
          },
          description: '3D Euler orientation angles in degrees',
        },
        bounding_box: {
          type: 'object',
          properties: {
            width: { type: 'number', description: 'Width along X axis' },
            height: { type: 'number', description: 'Height along Y axis' },
            depth: { type: 'number', description: 'Depth along Z axis' },
          },
          description: 'AABB bounding volume size',
        },
        velocity: {
          type: 'object',
          properties: {
            x: { type: 'number', description: 'Velocity along X axis' },
            y: { type: 'number', description: 'Velocity along Y axis' },
            z: { type: 'number', description: 'Velocity along Z axis' },
          },
          description: '3D velocity vector (vx, vy, vz) for physical motion and predictive permanence',
        },
        affordance_mask: {
          type: 'number',
          description:
            'Bitmask of physical interaction affordances (1=traversable, 2=occluder, 4=container, 8=interactable, 16=threat)',
        },
        confidence: {
          type: 'number',
          description: 'Object permanence confidence score from 0.0 to 1.0 (default: 1.0)',
        },
        parent_id: {
          type: 'string',
          description: 'Optional parent entity ID for hierarchical containment or attachments',
        },
        region_id: {
          type: 'string',
          description: 'Optional named region ID where this entity resides',
        },
        properties: {
          type: 'object',
          description:
            'Arbitrary JSON key-value properties (physics, materials, interactive state)',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of searchable string tags',
        },
        project: { type: 'string', description: 'Optional project identifier' },
      },
      required: ['name', 'type'],
    },
  },

  // 2. query_entities
  {
    name: 'query_entities',
    description:
      'Find entities by keyword query (FTS5 search), type, region, spatial proximity, tags, or status. Alternatively, provide entity_id for single-entity location and historical trajectory lookup. ' +
      'Read-only. Returns {ok, count, entities[]}. ' +
      'Use query_entities instead of get_spatial_map when searching for specific subsets rather than exporting the full topology.',
    inputSchema: {
      type: 'object',
      properties: {
        entity_id: {
          type: 'string',
          description: 'Specific entity ID to look up directly (returns location and state)',
        },
        include_history: {
          type: 'boolean',
          description: 'If true and entity_id is specified, returns recent movement/event history',
        },
        history_limit: {
          type: 'number',
          description:
            'Maximum number of history events to return when include_history is true (default: 20)',
        },
        query: {
          type: 'string',
          description: 'Full-text search query across entity names, tags, and properties',
        },
        type: { type: 'string', description: 'Filter by entity type' },
        status: {
          type: 'string',
          enum: ['active', 'hidden', 'lost', 'destroyed'],
          description: 'Filter by status',
        },
        near_position: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
          description: 'Center position for proximity distance search',
        },
        max_distance: { type: 'number', description: 'Maximum distance radius from near_position' },
        region_id: { type: 'string', description: 'Filter by region ID' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Filter by matching tags' },
        min_confidence: {
          type: 'number',
          description: 'Minimum confidence score (e.g. 0.5 to filter out decayed entities)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of entities to return (default: 50)',
        },
        project: { type: 'string', description: 'Optional project identifier' },
      },
    },
  },

  // 3. set_relation
  {
    name: 'set_relation',
    description:
      'Record or remove a spatial relationship between two entities. Actions: add, remove. ' +
      'Relations: on, inside, next_to, above, below, near, contains, occluded_by, connected_to, facing, holding, part_of, custom. This mutates the relation graph only, not entity poses. ' +
      'Returns {ok, relation}. ' +
      'Use set_relation instead of update_entity when establishing topological links (on, inside, contains) rather than setting entity coordinates.',
    inputSchema: {
      type: 'object',
      properties: {
        source_id: { type: 'string', description: 'Source entity ID' },
        relation: {
          type: 'string',
          enum: [
            'on',
            'inside',
            'next_to',
            'above',
            'below',
            'near',
            'contains',
            'occluded_by',
            'connected_to',
            'facing',
            'holding',
            'part_of',
            'custom',
          ],
          description: 'Type of spatial relation',
        },
        target_id: { type: 'string', description: 'Target entity ID' },
        offset: {
          type: 'object',
          properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
          description: 'Relative offset vector from source to target',
        },
        distance: { type: 'number', description: 'Optional measured distance between entities' },
        metadata: { type: 'object', description: 'Additional relation metadata' },
        bidirectional: {
          type: 'boolean',
          description: 'If true, automatically sets inverse relationship on target',
        },
        action: {
          type: 'string',
          enum: ['add', 'remove'],
          description: 'Action to perform (default: add)',
        },
        project: { type: 'string', description: 'Optional project identifier' },
      },
      required: ['source_id', 'relation', 'target_id'],
    },
  },

  // 4. get_spatial_map
  {
    name: 'get_spatial_map',
    description:
      'Export the known world as json, geojson, topological_graph, gltf, obj, joint, spatial_vlm, summary, or compact_slice. Optional region_id and min_confidence filters. ' +
      'Read-only snapshot of current SQLite state (not a live renderer). Returns the payload in requested format. ' +
      'Use get_spatial_map instead of query_entities when exporting full environment snapshots or 3D meshes rather than filtering entities.',
    inputSchema: {
      type: 'object',
      properties: {
        region_id: { type: 'string', description: 'Optional region ID to filter' },
        format: {
          type: 'string',
          enum: [
            'json',
            'geojson',
            'topological_graph',
            'gltf',
            'obj',
            'joint',
            'spatial_vlm',
            'summary',
            'compact_slice',
          ],
          description:
            'Export or view format (default: json, use "summary" for high-level environment overview, "compact_slice" for fast System One decision slice)',
        },
        observer_position: {
          type: 'array',
          items: { type: 'number' },
          description: 'Optional [x, y, z] observer position for compact_slice',
        },
        observer_heading: {
          type: 'number',
          description: 'Optional heading angle in degrees for compact_slice bearing calculation',
        },
        k: {
          type: 'number',
          description: 'Max nearest entities to include in compact_slice (default: 16)',
        },
        min_confidence: {
          type: 'number',
          description: 'Filter out entities below confidence threshold',
        },
        project: { type: 'string', description: 'Optional project identifier' },
      },
    },
  },

  // 5. simulate_movement
  {
    name: 'simulate_movement',
    description:
      'Predict entity trajectory, test for AABB obstacle collisions, or compute navigation waypoints (modes: simulate, navigate, waypoints). ' +
      'Read-only simulation. Returns {ok, is_valid, destination, collisions[], waypoints[]}. ' +
      'Use simulate_movement instead of record_outcome when testing hypothetical motion and collisions before executing an action.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['simulate', 'navigate', 'waypoints'],
          description:
            'Operation mode: "simulate" (default) for physics/collision, "navigate" or "waypoints" for path planning',
        },
        entity_id: { type: 'string', description: 'Entity ID to simulate or move' },
        delta_position: {
          type: 'object',
          properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
          description: 'Relative movement displacement',
        },
        velocity: {
          type: 'object',
          properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
          description: 'Velocity vector in units per second',
        },
        duration_seconds: { type: 'number', description: 'Movement duration in seconds' },
        target_position: {
          type: 'object',
          properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
          description: 'Target position destination',
        },
        check_collisions: {
          type: 'boolean',
          description: 'Whether to test for AABB obstacle collisions (default: true)',
        },
        start_entity_id: { type: 'string', description: 'Starting entity ID for navigation mode' },
        start_position: {
          type: 'object',
          properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
          description: 'Starting 3D coordinates for navigation mode',
        },
        target_entity_id: {
          type: 'string',
          description: 'Target destination entity ID for navigation mode',
        },
        project: { type: 'string', description: 'Optional project identifier' },
      },
    },
  },

  // 6. ingest_observation
  {
    name: 'ingest_observation',
    description:
      'Merge vision detections into the world model: re-identify by Euclidean proximity, boost confidence, and optionally reconcile against the expected frustum. ' +
      'This is the perception writer. It may create or update entities when reconcile=true. ' +
      'Returns {ok, matched[], created[], lost[], reconcile}. ' +
      'Use ingest_observation instead of update_entity when merging camera or sensor perception detections rather than manual authoring.',
    inputSchema: {
      type: 'object',
      properties: {
        reconcile: {
          type: 'boolean',
          description:
            'If true, also performs/returns frustum reconciliation analysis (confirmed, new, displaced, missing)',
        },
        visual_state_id: {
          type: 'string',
          description: 'Associated visual state ID from vision-memory-mcp',
        },
        observer_pose: {
          type: 'object',
          properties: {
            position: {
              type: 'object',
              properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
              required: ['x', 'y', 'z'],
            },
            orientation: {
              type: 'object',
              properties: {
                pitch: { type: 'number' },
                yaw: { type: 'number' },
                roll: { type: 'number' },
              },
            },
          },
          required: ['position'],
          description: 'Position and orientation of the camera/agent when observing',
        },
        field_of_view: {
          type: 'object',
          properties: { fov_horizontal: { type: 'number' }, fov_vertical: { type: 'number' } },
        },
        detections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: 'Object label or name' },
              class_name: { type: 'string', description: 'Entity class or type' },
              estimated_position: {
                type: 'object',
                properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
              },
              confidence: {
                type: 'number',
                description: 'Perception detection confidence (0.0 - 1.0)',
              },
              attributes: { type: 'object', description: 'Detected attributes' },
            },
            required: ['label', 'confidence'],
          },
          description: 'List of detected objects in the frame',
        },
        project: { type: 'string', description: 'Optional project identifier' },
      },
      required: ['detections'],
    },
  },

  // 7. get_expected_view
  {
    name: 'get_expected_view',
    description:
      'Compute which entities should be visible from an observer pose and FOV cone, with ray-AABB occlusion. ' +
      'Read-only. Does not write entities. Returns {visible[], occluded[], observer}. ' +
      'Use get_expected_view instead of get_spatial_map when computing observer FOV visibility and occlusion cones rather than unfiltered world states.',
    inputSchema: {
      type: 'object',
      properties: {
        observer_position: {
          type: 'object',
          properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
          required: ['x', 'y', 'z'],
          description: 'Observer 3D coordinates',
        },
        observer_orientation: {
          type: 'object',
          properties: {
            pitch: { type: 'number' },
            yaw: { type: 'number' },
            roll: { type: 'number' },
          },
          description: 'Observer orientation (yaw determines heading direction)',
        },
        fov_degrees: {
          type: 'number',
          description: 'Horizontal field of view in degrees (default: 90)',
        },
        max_distance: {
          type: 'number',
          description: 'Maximum view distance in units (default: 100)',
        },
        project: { type: 'string', description: 'Optional project identifier' },
      },
      required: ['observer_position'],
    },
  },

  // 8. link_to_goal
  {
    name: 'link_to_goal',
    description:
      'Link or unlink entities and regions to state-memory task nodes, or extract a goal-relevant spatial slice. ' +
      'Actions: link, unlink, get_context. link/unlink mutate association rows only. get_context is read-only. ' +
      'Returns {ok, action, links[]|context}. ' +
      'Use link_to_goal instead of record_outcome when associating entities with state-memory task nodes rather than recording physical movement deltas.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['link', 'unlink', 'get_context'],
          description:
            'Action to perform: "link" (default), "unlink", or "get_context" to retrieve goal-relevant spatial slice',
        },
        task_id: { type: 'string', description: 'State memory task node ID' },
        entity_id: { type: 'string', description: 'Target entity ID to link/unlink' },
        target_entity_id: {
          type: 'string',
          description: 'Direct target entity ID for navigation and clearance tracking',
        },
        region_id: { type: 'string', description: 'Target region ID to link' },
        relationship: {
          type: 'string',
          enum: ['target', 'obstacle', 'resource', 'destination', 'waypoint', 'context'],
          description: 'Role of entity relative to goal (default: target)',
        },
        notes: { type: 'string', description: 'Context notes' },
        success_region: {
          type: 'object',
          properties: {
            min: {
              type: 'object',
              properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
            },
            max: {
              type: 'object',
              properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
            },
          },
          description: 'Spatial bounding volume region defining goal arrival',
        },
        min_clearance: {
          type: 'number',
          description: 'Minimum clearance distance required to satisfy the goal',
        },
        current_agent_position: {
          type: 'object',
          properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
          description: 'Current agent position for get_context action',
        },
        max_entities: {
          type: 'number',
          description: 'Maximum entities to return for get_context action (default: 20)',
        },
        radius: {
          type: 'number',
          description: 'Proximity radius around agent for get_context action (default: 30)',
        },
        project: { type: 'string', description: 'Optional project identifier' },
      },
    },
  },

  // 9. record_outcome
  {
    name: 'record_outcome',
    description:
      'Record action execution results, movement deltas, property changes, entity destruction, or spool outcome ingestion from 60Hz loop. ' +
      'Not for vision ingest or manual pose edits. Mark entity destroyed via status: "destroyed". ' +
      'Returns {ok, action, success:boolean, ...}. ' +
      'Use record_outcome instead of update_entity when applying executed action results and status deltas rather than hand-authoring entities.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['record', 'from_tick'],
          description:
            'Action type: "record" (default) for single outcome or "from_tick" for 60Hz batch spool ingestion',
        },
        action_name: {
          type: 'string',
          description: 'Name of the executed action (e.g. move_to, pickup, place, destroy)',
        },
        entity_id: { type: 'string', description: 'Primary entity affected' },
        success: { type: 'boolean', description: 'Whether the action succeeded' },
        resulting_position: {
          type: 'object',
          properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
          description: 'New position of entity after action',
        },
        resulting_velocity: {
          type: 'object',
          properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
          description: 'New velocity vector of entity after action',
        },
        affordance_mask: {
          type: 'number',
          description: 'Updated affordance bitmask after action',
        },
        property_changes: { type: 'object', description: 'Updated properties to merge' },
        destroyed: { type: 'boolean', description: 'If true, marks entity as destroyed' },
        task_id: { type: 'string', description: 'Linked task ID' },
        spooled_outcomes: {
          type: 'array',
          items: { type: 'object' },
          description: 'Batch of spooled outcomes to ingest from 60Hz loop off-tick execution',
        },
        items: {
          type: 'array',
          items: { type: 'object' },
          description: 'Alias for spooled_outcomes batch array',
        },
        project: { type: 'string', description: 'Optional project identifier' },
      },
    },
  },

  // 10. manage_spatial_spec
  {
    name: 'manage_spatial_spec',
    description:
      'Manage Spatial Spec-Driven Development (Spatial SDD) physical baseline contracts. ' +
      'Actions: set (registers a baseline spec), verify (evaluates live entities against constraints without mutating), list (returns all registered specs). ' +
      'verify is read-only. set persists constraints. Returns {ok, action, spec_id, passed:boolean, violations[]}. ' +
      'Use manage_spatial_spec instead of update_entity when validating physical contract baselines rather than mutating live entity state.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['set', 'verify', 'list'],
          description: 'Action to perform (default: list)',
        },
        name: { type: 'string', description: 'Name of the spatial specification' },
        description: { type: 'string', description: 'Specification description' },
        bounds: {
          type: 'object',
          properties: {
            min: {
              type: 'object',
              properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
            },
            max: {
              type: 'object',
              properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
            },
          },
          description: 'Spatial bounding box limits',
        },
        constraints: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: [
                  'min_clearance',
                  'max_distance',
                  'inside_region',
                  'contains_entity',
                  'no_overlap',
                  'custom',
                ],
              },
              entity_id: { type: 'string' },
              target_id: { type: 'string' },
              region_id: { type: 'string' },
              value: { type: 'number' },
              description: { type: 'string' },
            },
            required: ['type'],
          },
          description: 'List of spatial constraints',
        },
        tolerance: {
          type: 'number',
          description: 'Verification tolerance percentage (default: 0.05)',
        },
        sdd_requirement_id: {
          type: 'string',
          description: 'Linked state-memory SDD requirement node ID',
        },
        project: { type: 'string', description: 'Optional project identifier' },
      },
    },
  },

  // 11. create_evidence_pack
  {
    name: 'create_evidence_pack',
    description:
      'Package entity positions, observation reconciliations, and snapshot states into an immutable, SHA-256 hashed cryptographic evidence pack for compliance and state-memory task verification. ' +
      'Does not change entities; hashes current proof. Returns {ok, pack_id, hash, payload}. ' +
      'Use create_evidence_pack instead of manage_snapshot when creating immutable cryptographic verification packages rather than database checkpoints.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'Primary state-memory task ID linked to this proof',
        },
        entity_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Entity IDs included in evidence pack',
        },
        observation_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Observation IDs included in evidence pack',
        },
        before_snapshot_id: { type: 'string', description: 'Snapshot ID before action execution' },
        after_snapshot_id: { type: 'string', description: 'Snapshot ID after action execution' },
        linked_state_memory_nodes: {
          type: 'object',
          properties: {
            task_ids: { type: 'array', items: { type: 'string' } },
            decision_ids: { type: 'array', items: { type: 'string' } },
            blocker_ids: { type: 'array', items: { type: 'string' } },
            observation_ids: { type: 'array', items: { type: 'string' } },
          },
          description: 'Linked state-memory node IDs',
        },
        project: { type: 'string', description: 'Optional project identifier' },
      },
    },
  },

  // 12. use_spatial_blackboard
  {
    name: 'use_spatial_blackboard',
    description:
      'Publish or read multi-agent spatial coordination topics, collision alerts, and mutex region leases. ' +
      'Actions: get, set, delete, lease, list, post, read, claim, release. ' +
      'set writes payload (coordinates allowed for collision alerts) with optional ttl_seconds. lease acquire fails if the resource is held. delete is destructive. ' +
      'Returns {ok, action, items[]|entry|lease}. ' +
      'Use use_spatial_blackboard instead of set_relation when coordinating transient multi-agent collision alerts and mutex region leases.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['get', 'set', 'delete', 'lease', 'list', 'post', 'read', 'claim', 'release'],
          description: 'Action to perform (default: get)',
        },
        topic: { type: 'string', description: 'Blackboard topic name' },
        id: { type: 'string', description: 'Blackboard entry identifier for get or delete' },
        sender: { type: 'string', description: 'Agent identifier posting or claiming' },
        agent_id: { type: 'string', description: 'Agent identifier (alias for sender)' },
        payload: {
          type: 'object',
          description: 'Payload object (supports coordinates for collision alerts)',
        },
        resource_id: { type: 'string', description: 'Resource or entity ID to lease or release' },
        mode: {
          type: 'string',
          enum: ['acquire', 'release'],
          description: 'Lease action mode: acquire or release (default: acquire)',
        },
        duration_seconds: {
          type: 'number',
          description: 'Lease duration in seconds (default: 60)',
        },
        ttl_seconds: { type: 'number', description: 'Post TTL expiration in seconds' },
        intention_id: {
          type: 'string',
          description:
            'Cross-server intention identifier from agent-reasoning-mcp to bind execution directives',
        },
        limit: { type: 'number', description: 'Maximum number of items or topics to return' },
        include_expired: { type: 'boolean', description: 'Whether to include expired entries' },
        topic_prefix: { type: 'string', description: 'Prefix filter for listing topics' },
        project: { type: 'string', description: 'Optional project identifier' },
      },
    },
  },

  // 13. manage_snapshot
  {
    name: 'manage_snapshot',
    description:
      'Checkpoint, diff, undo, or time-travel the spatial world database. ' +
      'Actions: save, restore, diff, list, undo, history, time_travel. ' +
      'restore (overwrites live state) and undo (reverts last matching mutation) are destructive and not always reversible except by saving first. diff, list, history, and time_travel are read-only. ' +
      'Returns {ok, action, snapshots[]|diff|state}. ' +
      'Use manage_snapshot instead of update_entity when rolling back, diffing, or time-traveling database state rather than editing single entities.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['save', 'restore', 'diff', 'list', 'undo', 'history', 'time_travel'],
          description: 'Action to perform (default: list)',
        },
        name: { type: 'string', description: 'Snapshot name for save/restore' },
        description: { type: 'string', description: 'Optional snapshot description' },
        snapshot_a: { type: 'string', description: 'First snapshot name for diff' },
        snapshot_b: { type: 'string', description: 'Second snapshot name for diff' },
        entity_id: { type: 'string', description: 'Target entity ID for undo or history lookup' },
        type: {
          type: 'string',
          enum: ['entity', 'relation', 'any'],
          description: 'Mutation type to undo (default: any)',
        },
        timestamp: { type: 'string', description: 'ISO timestamp for time-travel reconstruction' },
        project: { type: 'string', description: 'Optional project identifier' },
      },
    },
  },

  // 14. generate_game_inputs
  {
    name: 'generate_game_inputs',
    description:
      'Translate 3D navigation paths into Playwright commands (WASD/click-to-move) or project/unproject 3D coordinates and screen pixels. ' +
      'Actions: generate_inputs, project_screen, unproject_ray. Read-only: generates Playwright inputs, does not press keys. ' +
      'Returns {ok, action, inputs[]|screen_coords|ray}. ' +
      'Use generate_game_inputs instead of simulate_movement when translating 3D trajectories into Playwright browser automation commands.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['generate_inputs', 'project_screen', 'unproject_ray'],
          description: 'Action to perform (default: generate_inputs)',
        },
        entity_id: { type: 'string', description: 'Player or target entity ID' },
        world_position: {
          type: 'object',
          properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
          description: '3D world position for projection or starting point',
        },
        current_position: {
          type: 'object',
          properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
          description: 'Starting 3D coordinates (auto-resolved from entity_id if omitted)',
        },
        current_orientation: {
          type: 'object',
          properties: {
            pitch: { type: 'number' },
            yaw: { type: 'number' },
            roll: { type: 'number' },
          },
          description: 'Starting orientation angles',
        },
        target_position: {
          type: 'object',
          properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
          description: 'Destination 3D coordinates',
        },
        target_entity_id: { type: 'string', description: 'Target destination entity ID' },
        waypoints: {
          type: 'array',
          items: {
            type: 'object',
            properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
            required: ['x', 'y', 'z'],
          },
          description: 'Optional intermediate navigation waypoints',
        },
        control_profile: {
          type: 'object',
          properties: {
            scheme: {
              type: 'string',
              enum: ['wasd', 'arrows', 'click_to_move', 'custom'],
              description: 'Control scheme (default: wasd)',
            },
            move_speed: {
              type: 'number',
              description: 'Movement speed in units/sec (default: 5.0)',
            },
            turn_speed: { type: 'number', description: 'Turn speed in deg/sec (default: 90.0)' },
            forward_key: { type: 'string', description: 'Key code for forward (default: KeyW)' },
            backward_key: { type: 'string', description: 'Key code for backward (default: KeyS)' },
            strafe_left_key: {
              type: 'string',
              description: 'Key code for strafe left (default: KeyA)',
            },
            strafe_right_key: {
              type: 'string',
              description: 'Key code for strafe right (default: KeyD)',
            },
            jump_key: { type: 'string', description: 'Key code for jump (default: Space)' },
            turn_left_key: {
              type: 'string',
              description: 'Key code for turn left (default: ArrowLeft)',
            },
            turn_right_key: {
              type: 'string',
              description: 'Key code for turn right (default: ArrowRight)',
            },
            use_mouse_look: {
              type: 'boolean',
              description: 'Whether to use pointer-lock mouse movements for camera turning',
            },
            mouse_sensitivity: {
              type: 'number',
              description: 'Mouse sensitivity multiplier (default: 1.0)',
            },
          },
          description: 'Game control key bindings and physical parameters',
        },
        camera: {
          type: 'object',
          properties: {
            position: {
              type: 'object',
              properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
              required: ['x', 'y', 'z'],
            },
            orientation: {
              type: 'object',
              properties: {
                pitch: { type: 'number' },
                yaw: { type: 'number' },
                roll: { type: 'number' },
              },
            },
            fov_degrees: { type: 'number', description: 'Vertical FOV in degrees (default: 60)' },
            near: { type: 'number', description: 'Near clipping plane (default: 0.1)' },
            far: { type: 'number', description: 'Far clipping plane (default: 1000)' },
            projection_type: { type: 'string', enum: ['perspective', 'orthographic'] },
          },
          description: 'Camera state for projection / click-to-move',
        },
        viewport: {
          type: 'object',
          properties: {
            width: { type: 'number', description: 'Viewport pixel width (default: 1920)' },
            height: { type: 'number', description: 'Viewport pixel height (default: 1080)' },
          },
          description: 'Browser viewport dimensions',
        },
        direction: {
          type: 'string',
          enum: ['world_to_screen', 'screen_to_world'],
          description: 'Projection direction for projection mode',
        },
        screen_x: {
          type: 'number',
          description: 'Screen pixel X coordinate for screen_to_world unprojection',
        },
        screen_y: {
          type: 'number',
          description: 'Screen pixel Y coordinate for screen_to_world unprojection',
        },
        ground_elevation: {
          type: 'number',
          description: 'Ground plane elevation Y for raycast intercept (default: 0)',
        },
        output_format: {
          type: 'string',
          enum: ['playwright_mcp', 'playwright_script', 'raw_actions'],
          description: 'Output format (default: playwright_mcp)',
        },
        project: { type: 'string', description: 'Optional project identifier' },
      },
    },
  },

  // 15. wait_for_spatial_state
  {
    name: 'wait_for_spatial_state',
    description:
      'Poll and wait until an entity reaches a specific spatial condition (exists, active, confidence threshold, or enters region). ' +
      'Read-only polling tool. Default timeout: 10000ms, poll_interval: 500ms. On timeout returns {ok: false, timeout: true}. ' +
      'Returns {ok, condition_met:boolean, entity}. ' +
      'Use wait_for_spatial_state instead of query_entities when polling asynchronously for an entity state transition or region entry.',
    inputSchema: {
      type: 'object',
      properties: {
        entity_id: { type: 'string', description: 'Entity ID to monitor' },
        condition: {
          type: 'string',
          enum: ['exists', 'active', 'confidence_above', 'in_region'],
          description: 'Condition to wait for',
        },
        threshold: { type: 'number', description: 'Confidence threshold (default: 0.8)' },
        region_id: { type: 'string', description: 'Target region ID for in_region condition' },
        timeout_ms: { type: 'number', description: 'Timeout in milliseconds (default: 10000)' },
        poll_interval_ms: {
          type: 'number',
          description: 'Polling interval in milliseconds (default: 250)',
        },
        project: { type: 'string', description: 'Optional project identifier' },
      },
      required: ['entity_id', 'condition'],
    },
  },
];
