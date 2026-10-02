import Database from 'better-sqlite3';
import { Entity, ExpectedReentryEntity } from '../schema/types.js';
import { EntityStore } from './entity-store.js';
import { PermanenceEngine } from './permanence.js';
import {
  Vector3D,
  Orientation3D,
  pointInFrustumCone,
  vec3Sub,
  vec3Normalize,
  aabbFromCenterSize,
  rayAabbIntersect,
} from '../utils/math.js';

export interface ExpectedViewResult {
  observer_position: Vector3D;
  visible_entities: Array<{
    entity: Entity;
    distance: number;
    angle_offset: number;
    is_occluded: boolean;
    occluded_by_id?: string;
  }>;
  occluded_entities: Array<{
    entity: Entity;
    distance: number;
    occluded_by_id: string;
  }>;
  expected_reentry_entities?: ExpectedReentryEntity[];
}

export class FrustumEngine {
  static getExpectedView(
    db: Database.Database,
    params: {
      project: string;
      observer_position: Vector3D;
      observer_orientation?: Orientation3D;
      fov_degrees?: number;
      max_distance?: number;
      enable_occlusion?: boolean;
    }
  ): ExpectedViewResult {
    const yaw = params.observer_orientation?.yaw || 0;
    const fov = params.fov_degrees || 90;
    const maxDist = params.max_distance || 100;
    const enableOcclusion = params.enable_occlusion ?? true;

    const allEntities = EntityStore.listEntities(db, {
      project: params.project,
      status: 'active',
      limit: 500,
    });

    const candidates: Array<{
      entity: Entity;
      distance: number;
      angle_offset: number;
    }> = [];

    for (const entity of allEntities) {
      if (!entity.position) continue;
      const test = pointInFrustumCone(params.observer_position, yaw, entity.position, fov, maxDist);

      if (test.visible) {
        candidates.push({
          entity,
          distance: test.distance,
          angle_offset: test.angleOffset,
        });
      }
    }

    // Sort by distance (nearest first)
    candidates.sort((a, b) => a.distance - b.distance);

    const visible: ExpectedViewResult['visible_entities'] = [];
    const occluded: ExpectedViewResult['occluded_entities'] = [];

    // Potential occluders: entities with bounding boxes (obstacles, surfaces, containers, landmarks)
    const occluderCandidates = candidates.filter(
      (c) =>
        c.entity.bounding_box &&
        ['obstacle', 'surface', 'container', 'landmark', 'object'].includes(c.entity.type)
    );

    for (const cand of candidates) {
      let isOccluded = false;
      let occludedById: string | undefined;

      if (enableOcclusion && cand.distance > 0.5) {
        const rayDir = vec3Normalize(vec3Sub(cand.entity.position!, params.observer_position));
        const maxRayDist = cand.distance * 0.95; // don't collide with self

        for (const occ of occluderCandidates) {
          if (occ.entity.id === cand.entity.id) continue;
          if (occ.distance >= cand.distance) continue; // occluder must be closer than target

          const occBox = aabbFromCenterSize(occ.entity.position!, occ.entity.bounding_box!);
          const hitTest = rayAabbIntersect(params.observer_position, rayDir, occBox, maxRayDist);

          if (hitTest.hit && hitTest.t < maxRayDist) {
            isOccluded = true;
            occludedById = occ.entity.id;
            break;
          }
        }
      }

      if (isOccluded && occludedById) {
        occluded.push({
          entity: cand.entity,
          distance: cand.distance,
          occluded_by_id: occludedById,
        });
        visible.push({
          entity: cand.entity,
          distance: cand.distance,
          angle_offset: cand.angle_offset,
          is_occluded: true,
          occluded_by_id: occludedById,
        });
      } else {
        visible.push({
          entity: cand.entity,
          distance: cand.distance,
          angle_offset: cand.angle_offset,
          is_occluded: false,
        });
      }
    }

    // Predictive permanence: compute entities outside frustum or occluded that will re-enter within 0.5-5.0s
    const visibleIds = new Set(visible.filter((v) => !v.is_occluded).map((v) => v.entity.id));
    const nonVisibleMovingEntities = allEntities.filter((e) => {
      if (visibleIds.has(e.id)) return false;
      if (!e.position || !e.velocity) return false;
      return Math.abs(e.velocity.x) > 0.01 || Math.abs(e.velocity.y) > 0.01 || Math.abs(e.velocity.z) > 0.01;
    });

    const expectedReentry: ExpectedReentryEntity[] = [];
    const timeStepsSeconds = [0.5, 1.0, 2.0, 3.0, 5.0];
    const staticObstacleEntities = occluderCandidates.map((c) => c.entity);

    for (const movingEnt of nonVisibleMovingEntities) {
      for (const tau of timeStepsSeconds) {
        const targetIso = new Date(Date.now() + tau * 1000).toISOString();
        const extrap = PermanenceEngine.extrapolateEntityPosition(
          movingEnt,
          targetIso,
          staticObstacleEntities
        );

        const coneTest = pointInFrustumCone(
          params.observer_position,
          yaw,
          extrap.extrapolated_position,
          fov,
          maxDist
        );

        if (coneTest.visible) {
          let blocked = false;
          if (enableOcclusion && coneTest.distance > 0.5) {
            const rayDir = vec3Normalize(
              vec3Sub(extrap.extrapolated_position, params.observer_position)
            );
            const maxRayDist = coneTest.distance * 0.95;

            for (const occ of occluderCandidates) {
              if (occ.entity.id === movingEnt.id) continue;
              const occBox = aabbFromCenterSize(occ.entity.position!, occ.entity.bounding_box!);
              const hitTest = rayAabbIntersect(params.observer_position, rayDir, occBox, maxRayDist);
              if (hitTest.hit && hitTest.t < maxRayDist) {
                blocked = true;
                break;
              }
            }
          }

          if (!blocked) {
            expectedReentry.push({
              id: movingEnt.id,
              name: movingEnt.name,
              predicted_position: extrap.extrapolated_position,
              estimated_reentry_ms: tau * 1000,
              distance: Math.round(coneTest.distance * 1000) / 1000,
            });
            break; // Record earliest re-entry step
          }
        }
      }
    }

    return {
      observer_position: params.observer_position,
      visible_entities: visible,
      occluded_entities: occluded,
      expected_reentry_entities: expectedReentry,
    };
  }
}
