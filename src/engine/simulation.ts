import Database from 'better-sqlite3';
import { Entity } from '../schema/types.js';
import { EntityStore } from './entity-store.js';
import {
  Vector3D,
  vec3Add,
  vec3Scale,
  vec3Distance,
  aabbFromCenterSize,
  aabbIntersects,
} from '../utils/math.js';
import { ValidationError } from '../utils/errors.js';

export interface MovementSimulationResult {
  entity_id: string;
  initial_position: Vector3D;
  projected_position: Vector3D;
  distance_traversed: number;
  is_valid: boolean;
  collisions_detected: Array<{
    obstacle_id: string;
    obstacle_name: string;
    collision_point?: Vector3D;
  }>;
  waypoints_computed: Vector3D[];
}

export class SimulationEngine {
  static simulateMovement(
    db: Database.Database,
    params: {
      project: string;
      entity_id: string;
      delta_position?: Vector3D;
      velocity?: Vector3D;
      duration_seconds?: number;
      target_position?: Vector3D;
      check_collisions?: boolean;
    }
  ): MovementSimulationResult {
    const entity = EntityStore.getEntity(db, { project: params.project, id: params.entity_id });
    if (!entity) {
      throw new ValidationError(`Entity "${params.entity_id}" does not exist.`);
    }

    const startPos = entity.position || { x: 0, y: 0, z: 0 };
    let endPos = { ...startPos };

    if (params.target_position) {
      endPos = { ...params.target_position };
    } else if (params.delta_position) {
      endPos = vec3Add(startPos, params.delta_position);
    } else if (params.velocity && params.duration_seconds) {
      const delta = vec3Scale(params.velocity, params.duration_seconds);
      endPos = vec3Add(startPos, delta);
    }

    const dist = vec3Distance(startPos, endPos);
    const steps = Math.max(2, Math.ceil(dist));
    const waypoints: Vector3D[] = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      waypoints.push({
        x: startPos.x + (endPos.x - startPos.x) * t,
        y: startPos.y + (endPos.y - startPos.y) * t,
        z: startPos.z + (endPos.z - startPos.z) * t,
      });
    }

    const collisions: Array<{
      obstacle_id: string;
      obstacle_name: string;
      collision_point?: Vector3D;
    }> = [];
    const checkCollisions = params.check_collisions !== false;

    if (checkCollisions) {
      // Find active obstacle entities in the project
      const obstacles = EntityStore.listEntities(db, {
        project: params.project,
        status: 'active',
        limit: 200,
      }).filter(
        (e) =>
          e.id !== params.entity_id && (e.type === 'obstacle' || e.properties?.is_solid === true)
      );

      const entitySize = entity.bounding_box || { width: 1, height: 1, depth: 1 };

      for (const pt of waypoints) {
        const entityBox = aabbFromCenterSize(pt, entitySize);
        for (const obs of obstacles) {
          if (!obs.position) continue;
          const obsSize = obs.bounding_box || { width: 1, height: 1, depth: 1 };
          const obsBox = aabbFromCenterSize(obs.position, obsSize);

          if (aabbIntersects(entityBox, obsBox)) {
            if (!collisions.some((c) => c.obstacle_id === obs.id)) {
              collisions.push({
                obstacle_id: obs.id,
                obstacle_name: obs.name,
                collision_point: pt,
              });
            }
          }
        }
      }
    }

    return {
      entity_id: params.entity_id,
      initial_position: startPos,
      projected_position: endPos,
      distance_traversed: dist,
      is_valid: collisions.length === 0,
      collisions_detected: collisions,
      waypoints_computed: waypoints,
    };
  }
}
