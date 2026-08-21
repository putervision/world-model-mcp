import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toolDefinitions, READ_ONLY_TOOLS, DESTRUCTIVE_ACTIONS } from './definitions.js';
import { getDb, getReadOnlyDb, getProjectSlug } from '../engine/db.js';
import { EntityStore } from '../engine/entity-store.js';
import { SpatialGraph } from '../engine/spatial-graph.js';
import { SimulationEngine } from '../engine/simulation.js';
import { NavigationEngine } from '../engine/navigation.js';
import { VisionBridge } from '../engine/vision-bridge.js';
import { FrustumEngine } from '../engine/frustum.js';
import { GoalBridge } from '../engine/goal-bridge.js';
import { getWorldSummary } from '../engine/summary.js';
import { exportWorldModel } from '../engine/export.js';
import { getEntityHistory } from '../engine/events.js';
import { SpatialSpecEngine } from '../engine/spatial-spec.js';
import { SnapshotEngine } from '../engine/snapshots.js';
import { EvidenceEngine } from '../engine/evidence.js';
import { SpatialBlackboard } from '../engine/blackboard.js';
import { TimeTravelEngine } from '../engine/time-travel.js';
import { waitForSpatialState } from '../engine/polling.js';
import { SchemaAdvisor } from '../engine/advisor.js';
import { worldToScreen, screenToWorldRay } from '../utils/projection.js';
import { GameControlsEngine } from '../engine/game-controls.js';

export function jsonSchemaToZod(schema: any): z.ZodTypeAny {
  if (!schema || typeof schema !== 'object') {
    return z.any();
  }

  if (schema.type === 'string') {
    if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
      return z.enum(schema.enum as [string, ...string[]]);
    }
    return z.string();
  }

  if (schema.type === 'number') {
    return z.number();
  }

  if (schema.type === 'boolean') {
    return z.boolean();
  }

  if (schema.type === 'array') {
    const itemSchema = schema.items ? jsonSchemaToZod(schema.items) : z.any();
    return z.array(itemSchema);
  }

  if (schema.type === 'object') {
    if (!schema.properties) {
      return z.record(z.any());
    }
    const shape: Record<string, z.ZodTypeAny> = {};
    const properties = schema.properties || {};
    const required = new Set(schema.required || []);

    for (const [key, propSchema] of Object.entries(properties)) {
      let zodProp = jsonSchemaToZod(propSchema);
      if ((propSchema as any).description) {
        zodProp = zodProp.describe((propSchema as any).description);
      }
      if (!required.has(key)) {
        zodProp = zodProp.optional();
      }
      shape[key] = zodProp;
    }

    return z.object(shape).passthrough();
  }

  return z.any();
}

export function jsonSchemaToZodObject(schema: any): z.ZodObject<any> {
  const zod = jsonSchemaToZod(schema);
  if (zod instanceof z.ZodObject) return zod;
  return z.object({}).passthrough();
}

export function registerAllTools(server: McpServer): void {
  for (const toolDef of toolDefinitions) {
    const isReadOnly = READ_ONLY_TOOLS.has(toolDef.name);
    const isDestructive = DESTRUCTIVE_ACTIONS.has(toolDef.name);

    const rawZodSchema = jsonSchemaToZod(toolDef.inputSchema);
    const zodShape = (rawZodSchema as any).shape || {};

    server.registerTool(
      toolDef.name,
      {
        description: toolDef.description,
        annotations: {
          readOnlyHint: isReadOnly,
          destructiveHint: isDestructive,
          idempotentHint: isReadOnly,
        },
        inputSchema: zodShape,
      },
      async (args: any) => {
        const name = toolDef.name;
        try {
          const project = getProjectSlug(args.project);
          const isWrite = !isReadOnly;
          const db = isWrite ? getDb(project) : getReadOnlyDb(project);

          let result: any;

          switch (name) {
            case 'update_entity': {
              if (args.id && EntityStore.getEntity(db, { project, id: args.id })) {
                result = EntityStore.updateEntity(db, {
                  project,
                  id: args.id,
                  name: args.name,
                  type: args.type,
                  status: args.status,
                  position: args.position,
                  orientation: args.orientation,
                  bounding_box: args.bounding_box,
                  confidence: args.confidence,
                  parent_id: args.parent_id,
                  region_id: args.region_id,
                  properties: args.properties,
                  tags: args.tags,
                });
              } else {
                result = EntityStore.addEntity(db, {
                  project,
                  id: args.id,
                  name: args.name,
                  type: args.type || 'object',
                  status: args.status || 'active',
                  position: args.position,
                  orientation: args.orientation,
                  bounding_box: args.bounding_box,
                  confidence: args.confidence ?? 1.0,
                  parent_id: args.parent_id,
                  region_id: args.region_id,
                  properties: args.properties,
                  tags: args.tags,
                });
              }
              break;
            }

            case 'query_entities': {
              if (args.entity_id) {
                const entity = EntityStore.getEntity(db, { project, id: args.entity_id });
                if (!entity) {
                  throw new Error(`Entity "${args.entity_id}" not found.`);
                }
                const history = args.include_history
                  ? getEntityHistory(db, {
                      project,
                      entity_id: args.entity_id,
                      limit: args.history_limit,
                    })
                  : undefined;
                result = {
                  entity_id: entity.id,
                  name: entity.name,
                  status: entity.status,
                  position: entity.position,
                  orientation: entity.orientation,
                  confidence: entity.confidence,
                  last_seen_at: entity.last_seen_at,
                  history,
                };
              } else {
                result = EntityStore.queryEntities(db, {
                  project,
                  query: args.query,
                  type: args.type,
                  status: args.status,
                  near_position: args.near_position,
                  max_distance: args.max_distance,
                  region_id: args.region_id,
                  tags: args.tags,
                  min_confidence: args.min_confidence,
                  limit: args.limit,
                });
              }
              break;
            }

            case 'set_relation': {
              if (args.action === 'remove') {
                const removed = SpatialGraph.removeRelation(db, {
                  project,
                  source_id: args.source_id,
                  relation: args.relation,
                  target_id: args.target_id,
                });
                result = { success: removed, action: 'remove' };
              } else {
                result = SpatialGraph.setRelation(db, {
                  project,
                  source_id: args.source_id,
                  relation: args.relation,
                  target_id: args.target_id,
                  offset: args.offset,
                  distance: args.distance,
                  metadata: args.metadata,
                  bidirectional: args.bidirectional,
                });
              }
              break;
            }

            case 'get_spatial_map': {
              if (args.format === 'summary') {
                result = getWorldSummary(db, { project });
              } else {
                result = exportWorldModel(db, {
                  project,
                  format: args.format || 'json',
                });
              }
              break;
            }

            case 'simulate_movement': {
              const isNavigation =
                args.mode === 'navigate' ||
                args.mode === 'waypoints' ||
                (!args.delta_position &&
                  !args.velocity &&
                  (args.start_entity_id || args.start_position) &&
                  (args.target_entity_id || args.target_position));

              if (isNavigation) {
                result = NavigationEngine.getNavigationHints(db, {
                  project,
                  start_entity_id: args.start_entity_id,
                  start_position: args.start_position,
                  target_entity_id: args.target_entity_id,
                  target_position: args.target_position,
                });
              } else {
                result = SimulationEngine.simulateMovement(db, {
                  project,
                  entity_id: args.entity_id,
                  delta_position: args.delta_position,
                  velocity: args.velocity,
                  duration_seconds: args.duration_seconds,
                  target_position: args.target_position,
                  check_collisions: args.check_collisions,
                });
              }
              break;
            }

            case 'ingest_observation': {
              if (args.reconcile && !args.visual_state_id && !args.observer_pose?.position) {
                result = VisionBridge.reconcileObservation(db, {
                  project,
                  observer_pose: args.observer_pose,
                  field_of_view: args.field_of_view,
                  detections: args.detections,
                });
              } else if (args.reconcile && args.observer_pose) {
                const ingestResult = VisionBridge.ingestObservation(db, {
                  project,
                  visual_state_id: args.visual_state_id,
                  observer_pose: args.observer_pose,
                  field_of_view: args.field_of_view,
                  detections: args.detections,
                });
                const reconResult = VisionBridge.reconcileObservation(db, {
                  project,
                  observer_pose: args.observer_pose,
                  field_of_view: args.field_of_view,
                  detections: args.detections,
                });
                result = { ...ingestResult, reconciliation: reconResult };
              } else {
                result = VisionBridge.ingestObservation(db, {
                  project,
                  visual_state_id: args.visual_state_id,
                  observer_pose: args.observer_pose,
                  field_of_view: args.field_of_view,
                  detections: args.detections,
                });
              }
              break;
            }

            case 'get_expected_view': {
              result = FrustumEngine.getExpectedView(db, {
                project,
                observer_position: args.observer_position,
                observer_orientation: args.observer_orientation,
                fov_degrees: args.fov_degrees,
                max_distance: args.max_distance,
              });
              break;
            }

            case 'link_to_goal': {
              if (args.action === 'get_context') {
                result = GoalBridge.getRelevantContext(db, {
                  project,
                  task_id: args.task_id,
                  current_agent_position: args.current_agent_position,
                  max_entities: args.max_entities,
                  radius: args.radius,
                });
              } else if (args.action === 'unlink') {
                result = {
                  success: GoalBridge.unlinkFromGoal(db, {
                    project,
                    task_id: args.task_id,
                    entity_id: args.entity_id,
                  }),
                };
              } else {
                result = GoalBridge.linkToGoal(db, {
                  project,
                  task_id: args.task_id,
                  entity_id: args.entity_id,
                  region_id: args.region_id,
                  relationship: args.relationship || 'target',
                  notes: args.notes,
                });
              }
              break;
            }

            case 'record_outcome': {
              if (args.destroyed && args.entity_id) {
                EntityStore.removeEntity(db, {
                  project,
                  id: args.entity_id,
                  source: 'record_outcome',
                });
              } else if (args.entity_id) {
                EntityStore.updateEntity(db, {
                  project,
                  id: args.entity_id,
                  position: args.resulting_position,
                  properties: args.property_changes,
                  task_id: args.task_id,
                  source: 'record_outcome',
                });
              }
              result = {
                action: args.action_name,
                success: args.success,
                entity_id: args.entity_id,
                recorded_at: new Date().toISOString(),
              };
              break;
            }

            case 'manage_spatial_spec': {
              const action = args.action || 'list';
              if (action === 'set') {
                result = SpatialSpecEngine.setSpatialSpec(db, {
                  project,
                  name: args.name,
                  description: args.description,
                  bounds: args.bounds,
                  constraints: args.constraints || [],
                  sdd_requirement_id: args.sdd_requirement_id,
                });
              } else if (action === 'verify') {
                result = SpatialSpecEngine.verifySpatialSpec(db, {
                  project,
                  name: args.name,
                  tolerance: args.tolerance,
                });
              } else {
                result = SpatialSpecEngine.listSpatialSpecs(db, { project });
              }
              break;
            }

            case 'create_evidence_pack': {
              result = EvidenceEngine.createEvidencePack(db, {
                project,
                task_id: args.task_id,
                entity_ids: args.entity_ids,
                observation_ids: args.observation_ids,
                before_snapshot_id: args.before_snapshot_id,
                after_snapshot_id: args.after_snapshot_id,
                linked_state_memory_nodes: args.linked_state_memory_nodes,
              });
              break;
            }

            case 'use_spatial_blackboard': {
              const action = args.action || 'read';
              if (action === 'post') {
                result = SpatialBlackboard.post(db, {
                  project,
                  topic: args.topic,
                  sender: args.sender || 'agent',
                  payload: args.payload || {},
                  ttl_seconds: args.ttl_seconds,
                });
              } else if (action === 'claim') {
                result = SpatialBlackboard.claim(db, {
                  project,
                  resource_id: args.resource_id,
                  agent_id: args.sender || 'agent',
                  duration_seconds: args.duration_seconds,
                });
              } else if (action === 'release') {
                result = SpatialBlackboard.release(db, {
                  project,
                  resource_id: args.resource_id,
                  agent_id: args.sender || 'agent',
                });
              } else {
                result = SpatialBlackboard.read(db, {
                  project,
                  topic: args.topic,
                  include_expired: false,
                });
              }
              break;
            }

            case 'manage_snapshot': {
              const action = args.action || 'list';
              if (action === 'save') {
                result = SnapshotEngine.saveSnapshot(db, {
                  project,
                  name: args.name,
                  description: args.description,
                });
              } else if (action === 'restore') {
                result = SnapshotEngine.restoreSnapshot(db, {
                  project,
                  name: args.name,
                });
              } else if (action === 'diff') {
                result = SnapshotEngine.diffSnapshots(db, {
                  project,
                  snapshot_a: args.snapshot_a,
                  snapshot_b: args.snapshot_b,
                });
              } else if (action === 'undo') {
                result = TimeTravelEngine.undoMutation(db, {
                  project,
                  entity_id: args.entity_id,
                  type: args.type,
                });
              } else if (action === 'time_travel' || action === 'history') {
                if (args.timestamp) {
                  result = TimeTravelEngine.getStateAtTimestamp(db, {
                    project,
                    timestamp: args.timestamp,
                  });
                } else if (args.entity_id) {
                  result = getEntityHistory(db, {
                    project,
                    entity_id: args.entity_id,
                  });
                } else {
                  result = SnapshotEngine.listSnapshots(db, { project });
                }
              } else {
                result = SnapshotEngine.listSnapshots(db, { project });
              }
              break;
            }

            case 'generate_game_inputs': {
              const action = args.action || 'generate_inputs';
              const isProjection =
                action === 'project_screen' ||
                action === 'unproject_ray' ||
                args.direction === 'world_to_screen' ||
                args.direction === 'screen_to_world';

              if (isProjection) {
                const direction =
                  args.direction ||
                  (action === 'unproject_ray' ? 'screen_to_world' : 'world_to_screen');
                const viewport = args.viewport || { width: 1920, height: 1080 };
                const camera = args.camera;

                if (!camera) {
                  throw new Error('Camera state is required for projection operations.');
                }

                if (direction === 'screen_to_world') {
                  const screenX = args.screen_x ?? viewport.width / 2;
                  const screenY = args.screen_y ?? viewport.height / 2;
                  const groundElevation = args.ground_elevation ?? 0;
                  result = screenToWorldRay(screenX, screenY, camera, viewport, groundElevation);
                } else {
                  let worldPos = args.world_position;
                  let boundingBox = undefined;
                  if (!worldPos && args.entity_id) {
                    const ent = EntityStore.getEntity(db, { project, id: args.entity_id });
                    if (ent && ent.position) {
                      worldPos = ent.position;
                      boundingBox = ent.bounding_box;
                    } else {
                      throw new Error(`Entity "${args.entity_id}" not found or has no position.`);
                    }
                  }
                  if (!worldPos) {
                    throw new Error(
                      'Either entity_id or world_position must be specified for world_to_screen projection.'
                    );
                  }
                  result = worldToScreen(worldPos, camera, viewport, boundingBox);
                }
              } else {
                let startPos = args.current_position;
                let startOrientation = args.current_orientation;
                if (!startPos && args.entity_id) {
                  const ent = EntityStore.getEntity(db, { project, id: args.entity_id });
                  if (ent && ent.position) {
                    startPos = ent.position;
                    if (!startOrientation) startOrientation = ent.orientation;
                  } else {
                    throw new Error(`Entity "${args.entity_id}" not found or has no position.`);
                  }
                }
                if (!startPos) {
                  throw new Error('Either entity_id or current_position must be specified.');
                }

                let targetPos = args.target_position;
                if (!targetPos && args.target_entity_id) {
                  const tgtEnt = EntityStore.getEntity(db, { project, id: args.target_entity_id });
                  if (tgtEnt && tgtEnt.position) {
                    targetPos = tgtEnt.position;
                  } else {
                    throw new Error(
                      `Target entity "${args.target_entity_id}" not found or has no position.`
                    );
                  }
                }

                result = GameControlsEngine.generateInputs({
                  current_position: startPos,
                  current_orientation: startOrientation,
                  target_position: targetPos,
                  waypoints: args.waypoints,
                  control_profile: args.control_profile,
                  camera: args.camera,
                  viewport: args.viewport,
                  output_format: args.output_format,
                });
              }
              break;
            }

            case 'wait_for_spatial_state': {
              result = await waitForSpatialState(db, {
                project,
                entity_id: args.entity_id,
                condition: args.condition,
                threshold: args.threshold,
                region_id: args.region_id,
                timeout_ms: args.timeout_ms,
                poll_interval_ms: args.poll_interval_ms,
              });
              break;
            }

            default:
              throw new Error(`Unknown tool: ${name}`);
          }

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (err: any) {
          const advice = SchemaAdvisor.getAdvice(toolDef.name, err.message, args);
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Error executing ${toolDef.name}: ${err.message}\n${advice}`,
              },
            ],
          };
        }
      }
    );
  }
}
