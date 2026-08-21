import { Vector3D, Orientation3D, BoundingBoxSize } from '../utils/math.js';

// Branded Types
export type EntityId = string & { readonly __brand: unique symbol };
export type RelationId = string & { readonly __brand: unique symbol };
export type RegionId = string & { readonly __brand: unique symbol };
export type ObservationId = string & { readonly __brand: unique symbol };
export type SnapshotId = string & { readonly __brand: unique symbol };

export function toEntityId(id: string): EntityId {
  return id as EntityId;
}

export function toRelationId(id: string): RelationId {
  return id as RelationId;
}

export function toRegionId(id: string): RegionId {
  return id as RegionId;
}

// Entity Types
export type EntityType =
  | 'object'
  | 'agent'
  | 'landmark'
  | 'region'
  | 'waypoint'
  | 'container'
  | 'surface'
  | 'npc'
  | 'item'
  | 'obstacle'
  | 'custom';

// Entity Status
export type EntityStatus = 'active' | 'hidden' | 'lost' | 'destroyed';

// Relation Types
export type RelationType =
  | 'on'
  | 'inside'
  | 'next_to'
  | 'above'
  | 'below'
  | 'near'
  | 'contains'
  | 'occluded_by'
  | 'connected_to'
  | 'facing'
  | 'holding'
  | 'part_of'
  | 'custom';

// Goal Links Relationship
export type GoalRelationshipType =
  'target' | 'obstacle' | 'resource' | 'destination' | 'waypoint' | 'context';

// History Actions
export type HistoryAction =
  | 'created'
  | 'updated'
  | 'moved'
  | 'status_changed'
  | 'confidence_decayed'
  | 're_identified'
  | 'destroyed';

export interface Entity {
  id: string;
  project: string;
  name: string;
  type: EntityType;
  status: EntityStatus;
  position?: Vector3D;
  orientation?: Orientation3D;
  bounding_box?: BoundingBoxSize;
  confidence: number;
  parent_id?: string;
  region_id?: string;
  properties: Record<string, any>;
  tags: string[];
  last_seen_at: string;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface SpatialRelation {
  id: string;
  project: string;
  source_id: string;
  relation: RelationType;
  target_id: string;
  offset?: Vector3D;
  distance?: number;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface EntityHistoryEvent {
  id: string;
  project: string;
  entity_id: string;
  action: HistoryAction;
  position?: Vector3D;
  confidence?: number;
  source: string;
  visual_state_id?: string;
  task_id?: string;
  details?: Record<string, any>;
  timestamp: string;
  prev_hash?: string;
  hash?: string;
}

export interface SpatialConstraint {
  type:
    | 'min_clearance'
    | 'max_distance'
    | 'inside_region'
    | 'contains_entity'
    | 'no_overlap'
    | 'custom';
  entity_id?: string;
  target_id?: string;
  region_id?: string;
  value?: number;
  description?: string;
}

export interface SpatialSpec {
  id: string;
  project: string;
  name: string;
  description?: string;
  bounds?: { min: Vector3D; max: Vector3D };
  constraints: SpatialConstraint[];
  sdd_requirement_id?: string;
  created_at: string;
  updated_at: string;
}

export interface SpatialSpecViolation {
  constraint_type: string;
  message: string;
  severity: 'error' | 'warning';
  entity_ids?: string[];
  actual_value?: number;
  expected_value?: number;
}

export interface SpatialSpecResult {
  spec_name: string;
  is_compliant: boolean;
  violations: SpatialSpecViolation[];
  tolerance_threshold: number;
  sdd_requirement_id?: string;
  state_memory_tool_calls?: {
    instruction: string;
    mcp_tool_call?: Record<string, unknown>;
    link_tool_call?: Record<string, unknown>;
  };
}

export interface BlackboardItem {
  id: string;
  project: string;
  topic: string;
  sender: string;
  payload: Record<string, any>;
  claimed_by?: string;
  claimed_until?: string;
  expires_at?: string;
  created_at: string;
}

export interface LinkedStateMemoryNodes {
  task_ids?: string[];
  decision_ids?: string[];
  blocker_ids?: string[];
  observation_ids?: string[];
}

export interface SpatialEvidencePack {
  id: string;
  project: string;
  created_at: string;
  task_id?: string;
  entity_ids: string[];
  observation_ids: string[];
  before_snapshot_id?: string;
  after_snapshot_id?: string;
  entities_snapshot: Entity[];
  observations_snapshot: Observation[];
  relations_snapshot: SpatialRelation[];
  linked_state_memory_nodes?: LinkedStateMemoryNodes;
  payload_hash: string;
  state_memory_tool_calls?: {
    instruction: string;
    mcp_tool_call?: Record<string, unknown>;
    link_tool_call?: Record<string, unknown>;
  };
}

export type TrajectoryFormat = 'json' | 'joint' | 'spatial_vlm';

export interface TrajectoryStep {
  step: number;
  timestamp: string;
  action: string;
  entity_id: string;
  entity_name?: string;
  position?: Vector3D;
  confidence?: number;
  visual_state_id?: string;
  task_id?: string;
  trace_id?: string;
}

export interface SpatialDiffResult {
  snapshot_a: string;
  snapshot_b: string;
  added_entities: Entity[];
  removed_entities: Entity[];
  displaced_entities: Array<{
    id: string;
    name: string;
    position_a?: Vector3D;
    position_b?: Vector3D;
    distance: number;
  }>;
  added_relations: SpatialRelation[];
  removed_relations: SpatialRelation[];
}

export interface TimeTravelState {
  timestamp: string;
  entities: Entity[];
  relations: SpatialRelation[];
}

export interface ObservationDetection {
  label: string;
  class_name?: string;
  bounding_box_2d?: { x: number; y: number; width: number; height: number };
  bounding_box_3d?: { center: Vector3D; size: BoundingBoxSize };
  estimated_position?: Vector3D;
  confidence: number;
  attributes?: Record<string, any>;
}

export interface Observation {
  id: string;
  project: string;
  visual_state_id?: string;
  observer_pose?: {
    position: Vector3D;
    orientation?: Orientation3D;
  };
  field_of_view?: {
    fov_horizontal?: number;
    fov_vertical?: number;
  };
  detections: ObservationDetection[];
  reconcile_report?: ReconcileReport;
  timestamp: string;
}

export interface ReconcileReport {
  timestamp: string;
  observer_position?: Vector3D;
  confirmed: Array<{ entity_id: string; name: string; match_score: number }>;
  appeared: Array<{ label: string; estimated_position?: Vector3D; created_entity_id?: string }>;
  displaced: Array<{
    entity_id: string;
    name: string;
    old_position?: Vector3D;
    new_position: Vector3D;
  }>;
  missing_or_occluded: Array<{
    entity_id: string;
    name: string;
    last_position?: Vector3D;
    reason: string;
  }>;
  anomalies: Array<{ entity_id: string; message: string }>;
}

export interface GoalLink {
  id: string;
  project: string;
  task_id: string;
  entity_id?: string;
  region_id?: string;
  relationship: GoalRelationshipType;
  notes?: string;
  created_at: string;
}

export interface Region {
  id: string;
  project: string;
  name: string;
  parent_region_id?: string;
  bounds?: {
    min: Vector3D;
    max: Vector3D;
  };
  properties: Record<string, any>;
  created_at: string;
}

export interface WorldSummary {
  project: string;
  total_entities: number;
  entities_by_type: Record<string, number>;
  entities_by_status: Record<string, number>;
  total_relations: number;
  relations_by_type: Record<string, number>;
  total_regions: number;
  active_goal_links: number;
  spatial_bounds?: {
    min: Vector3D;
    max: Vector3D;
  };
  permanence_health: {
    average_confidence: number;
    decayed_entities_count: number;
    lost_entities_count: number;
  };
  recent_observations_count: number;
  updated_at: string;
}

export interface NavigationHint {
  step: number;
  from_entity_id?: string;
  to_entity_id?: string;
  from_position?: Vector3D;
  to_position?: Vector3D;
  relation?: RelationType;
  action_description: string;
  distance: number;
}

// Database Rows
export interface EntityRow {
  id: string;
  project: string;
  name: string;
  type: string;
  status: string;
  x: number | null;
  y: number | null;
  z: number | null;
  pitch: number | null;
  yaw: number | null;
  roll: number | null;
  bbox_width: number | null;
  bbox_height: number | null;
  bbox_depth: number | null;
  confidence: number;
  parent_id: string | null;
  region_id: string | null;
  properties_json: string | null;
  tags_json: string | null;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface RelationRow {
  id: string;
  project: string;
  source_id: string;
  relation: string;
  target_id: string;
  offset_x: number | null;
  offset_y: number | null;
  offset_z: number | null;
  distance: number | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface RegionRow {
  id: string;
  project: string;
  name: string;
  parent_region_id: string | null;
  min_x: number | null;
  min_y: number | null;
  min_z: number | null;
  max_x: number | null;
  max_y: number | null;
  max_z: number | null;
  properties_json: string | null;
  created_at: string;
}

export interface SpatialSpecRow {
  id: string;
  project: string;
  name: string;
  description: string | null;
  bounds_json: string | null;
  constraints_json: string | null;
  sdd_requirement_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BlackboardItemRow {
  id: string;
  project: string;
  topic: string;
  sender: string;
  payload_json: string;
  claimed_by: string | null;
  claimed_until: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface EvidencePackRow {
  id: string;
  project: string;
  task_id: string | null;
  entity_ids_json: string;
  observation_ids_json: string;
  before_snapshot_id: string | null;
  after_snapshot_id: string | null;
  payload_json: string;
  sha256_hash: string;
  created_at: string;
}

// Game & Playwright Projection Types
export interface CameraState {
  position: Vector3D;
  orientation?: Orientation3D;
  fov_degrees?: number;
  near?: number;
  far?: number;
  projection_type?: 'perspective' | 'orthographic';
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface ScreenBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProjectionResult {
  screen_x: number;
  screen_y: number;
  depth: number;
  is_visible: boolean;
  is_behind_camera: boolean;
  screen_bounding_box?: ScreenBoundingBox;
}

export interface UnprojectionResult {
  ray_origin: Vector3D;
  ray_direction: Vector3D;
  ground_intercept?: Vector3D;
  hit_entity_id?: string;
}

export interface TilemapConfig {
  tile_width: number;
  tile_height: number;
  orientation?: 'orthogonal' | 'isometric';
  origin_x?: number;
  origin_y?: number;
}

export type GameControlScheme = 'wasd' | 'arrows' | 'click_to_move' | 'custom';

export interface GameControlProfile {
  scheme: GameControlScheme;
  move_speed?: number;
  turn_speed?: number;
  forward_key?: string;
  backward_key?: string;
  strafe_left_key?: string;
  strafe_right_key?: string;
  jump_key?: string;
  turn_left_key?: string;
  turn_right_key?: string;
  use_mouse_look?: boolean;
  mouse_sensitivity?: number;
}

export interface GameInputAction {
  type: 'key_hold' | 'key_press' | 'mouse_move' | 'mouse_click' | 'wait';
  key?: string;
  duration_ms?: number;
  delta_x?: number;
  delta_y?: number;
  screen_x?: number;
  screen_y?: number;
  description: string;
}

export interface PlaywrightCommand {
  tool: 'browser_evaluate' | 'browser_press_key' | 'browser_click' | 'browser_wait_for';
  args: Record<string, any>;
  description: string;
}

export interface GameInputSequence {
  actions: GameInputAction[];
  playwright_commands: PlaywrightCommand[];
  estimated_duration_ms: number;
  requires_jump: boolean;
  playwright_script?: string;
}
