export const READ_ONLY_TOOLS = new Set([
  'query_entities',
  'get_spatial_map',
  'simulate_movement',
  'get_expected_view',
  'generate_game_inputs',
  'wait_for_spatial_state',
]);

export const DESTRUCTIVE_ACTIONS = new Set([
  'remove_entity',
  'remove_relation',
  'restore_snapshot',
  'undo',
]);

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

export const toolDefinitions: ToolDefinition[] = [
  // 1. update_entity
  {
    name: 'update_entity',
    description:
      'Create or update an entity in the spatial world model. Allows specifying position (3D coordinates), orientation (pitch/yaw/roll), bounding box volume, custom properties, tags, and confidence score.',
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
      'Find entities by keyword query (FTS5 search), type, region, spatial proximity, tags, or status. Alternatively, provide entity_id for single-entity location and historical trajectory lookup.',
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
      'Record or update a spatial relationship between two entities (e.g. on, inside, next_to, above, below, near, contains, occluded_by, connected_to, facing, holding, part_of).',
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
      'Return a structured spatial layout, topological graph, 3D asset export (gltf/obj), or high-level environment summary of the known world.',
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
          ],
          description:
            'Export or view format (default: json, use "summary" for high-level environment overview)',
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
      'Simulate physical movement and test for AABB collisions, or calculate waypoint navigation paths between entities and coordinates.',
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
      'Merge structured vision perception detections into the world model (re-identifying existing objects and boosting confidence), or reconcile observed state against the expected frustum view.',
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
      "Calculate what entities should be visible from an observer's pose and field of view frustum cone.",
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
      'Associate entities or spatial regions with state-memory task DAGs (link/unlink), or extract goal-relevant spatial context slices.',
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
        region_id: { type: 'string', description: 'Target region ID to link' },
        relationship: {
          type: 'string',
          enum: ['target', 'obstacle', 'resource', 'destination', 'waypoint', 'context'],
          description: 'Role of entity relative to goal (default: target)',
        },
        notes: { type: 'string', description: 'Context notes' },
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
      'Update the world model after an action executes (moving an entity, modifying properties, destroying or creating objects).',
    inputSchema: {
      type: 'object',
      properties: {
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
        property_changes: { type: 'object', description: 'Updated properties to merge' },
        destroyed: { type: 'boolean', description: 'If true, marks entity as destroyed' },
        task_id: { type: 'string', description: 'Linked task ID' },
        project: { type: 'string', description: 'Optional project identifier' },
      },
      required: ['action_name', 'success'],
    },
  },

  // 10. manage_spatial_spec
  {
    name: 'manage_spatial_spec',
    description:
      'Manage Spatial Spec-Driven Development (Spatial SDD) baseline contracts and live compliance verification against physical constraints (min clearance, containment, occupancy).',
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
      'Package entity positions, observation reconciliations, and snapshot states into an immutable, SHA-256 hashed cryptographic evidence pack for compliance and state-memory task verification.',
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
      'Multi-agent shared spatial blackboard for publishing ephemeral intentions, waypoints, and claiming exclusive spatial access to prevent collisions.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['post', 'read', 'claim', 'release'],
          description: 'Action to perform (default: read)',
        },
        topic: { type: 'string', description: 'Blackboard topic name' },
        sender: { type: 'string', description: 'Agent identifier posting or claiming' },
        payload: {
          type: 'object',
          description: 'Payload object (supports coordinates for collision alerts)',
        },
        resource_id: { type: 'string', description: 'Resource or entity ID to claim/release' },
        duration_seconds: {
          type: 'number',
          description: 'Claim duration in seconds (default: 60)',
        },
        ttl_seconds: { type: 'number', description: 'Post TTL expiration in seconds' },
        project: { type: 'string', description: 'Optional project identifier' },
      },
    },
  },

  // 13. manage_snapshot
  {
    name: 'manage_snapshot',
    description:
      'Unified spatial snapshot and time-travel management: save checkpoints, restore states, diff two snapshots, list history, undo mutations, or inspect world state at historical timestamps.',
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
      'Generate Playwright MCP automation inputs (WASD, mouse-look, clicks) or project/unproject 3D entity coordinates and screen pixels.',
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
      'Poll and wait until an entity reaches a specific spatial state (exists, becomes active, confidence exceeds threshold, or enters region).',
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
