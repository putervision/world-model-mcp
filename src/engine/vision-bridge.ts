import Database from 'better-sqlite3';
import { Observation, ObservationDetection, ReconcileReport } from '../schema/types.js';
import { EntityStore } from './entity-store.js';
import { PermanenceEngine } from './permanence.js';
import { FrustumEngine } from './frustum.js';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';
import { Vector3D, Orientation3D, vec3Distance } from '../utils/math.js';

export class VisionBridge {
  static ingestObservation(
    db: Database.Database,
    params: {
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
    }
  ): { observation: Observation; created_entities: string[]; updated_entities: string[] } {
    const obsId = generateId();
    const now = getCurrentIsoString();
    const created: string[] = [];
    const updated: string[] = [];

    const existingEntities = EntityStore.listEntities(db, {
      project: params.project,
      status: 'active',
      limit: 500,
    });

    db.transaction(() => {
      for (const det of params.detections) {
        // Attempt re-identification: match by label + proximity
        const match = existingEntities.find((e) => {
          if (
            (det.label && e.name.toLowerCase() === det.label.toLowerCase()) ||
            e.type === det.class_name
          ) {
            if (det.estimated_position && e.position) {
              return vec3Distance(e.position, det.estimated_position) < 3.0; // 3-unit proximity threshold
            }
            return true;
          }
          return false;
        });

        if (match) {
          EntityStore.updateEntity(db, {
            project: params.project,
            id: match.id,
            position: det.estimated_position || match.position,
            confidence: Math.max(match.confidence, det.confidence),
            source: 'vision_ingest',
            visual_state_id: params.visual_state_id,
          });
          PermanenceEngine.reObserveEntity(db, {
            project: params.project,
            entity_id: match.id,
            visual_state_id: params.visual_state_id,
          });
          updated.push(match.id);
        } else {
          const newEnt = EntityStore.addEntity(db, {
            project: params.project,
            name: det.label,
            type: (det.class_name as any) || 'object',
            position: det.estimated_position,
            bounding_box: det.bounding_box_3d?.size || (det as any).bounding_box,
            confidence: det.confidence,
            source: 'vision_ingest',
            visual_state_id: params.visual_state_id,
            properties: det.attributes || {},
          });
          created.push(newEnt.id);
        }
      }

      // Record observation
      db.prepare(
        `
        INSERT INTO observations (
          id, project, visual_state_id, observer_x, observer_y, observer_z,
          observer_pitch, observer_yaw, observer_roll, fov_horizontal, fov_vertical,
          raw_detections_json, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        obsId,
        params.project,
        params.visual_state_id ?? null,
        params.observer_pose?.position.x ?? null,
        params.observer_pose?.position.y ?? null,
        params.observer_pose?.position.z ?? null,
        params.observer_pose?.orientation?.pitch ?? null,
        params.observer_pose?.orientation?.yaw ?? null,
        params.observer_pose?.orientation?.roll ?? null,
        params.field_of_view?.fov_horizontal ?? null,
        params.field_of_view?.fov_vertical ?? null,
        JSON.stringify(params.detections),
        now
      );
    })();

    const observation: Observation = {
      id: obsId,
      project: params.project,
      visual_state_id: params.visual_state_id,
      observer_pose: params.observer_pose,
      field_of_view: params.field_of_view,
      detections: params.detections,
      timestamp: now,
    };

    return { observation, created_entities: created, updated_entities: updated };
  }

  static reconcileObservation(
    db: Database.Database,
    params: {
      project: string;
      observer_pose: {
        position: Vector3D;
        orientation?: Orientation3D;
      };
      field_of_view?: {
        fov_horizontal?: number;
        fov_vertical?: number;
      };
      detections: ObservationDetection[];
    }
  ): ReconcileReport {
    const expected = FrustumEngine.getExpectedView(db, {
      project: params.project,
      observer_position: params.observer_pose.position,
      observer_orientation: params.observer_pose.orientation,
      fov_degrees: params.field_of_view?.fov_horizontal || 90,
    });

    const confirmed: ReconcileReport['confirmed'] = [];
    const appeared: ReconcileReport['appeared'] = [];
    const displaced: ReconcileReport['displaced'] = [];
    const missing: ReconcileReport['missing_or_occluded'] = [];
    const anomalies: ReconcileReport['anomalies'] = [];

    const matchedExpectedIds = new Set<string>();

    for (const det of params.detections) {
      const match = expected.visible_entities.find((v) => {
        if (matchedExpectedIds.has(v.entity.id)) return false;
        if (v.entity.name.toLowerCase() === det.label.toLowerCase()) {
          return true;
        }
        if (v.entity.type === det.class_name && det.estimated_position && v.entity.position) {
          return vec3Distance(v.entity.position, det.estimated_position) < 3.0;
        }
        return false;
      });

      if (match) {
        matchedExpectedIds.add(match.entity.id);
        if (det.estimated_position && match.entity.position) {
          const dist = vec3Distance(match.entity.position, det.estimated_position);
          if (dist > 2.0) {
            displaced.push({
              entity_id: match.entity.id,
              name: match.entity.name,
              old_position: match.entity.position,
              new_position: det.estimated_position,
            });
          } else {
            confirmed.push({
              entity_id: match.entity.id,
              name: match.entity.name,
              match_score: det.confidence,
            });
          }
        } else {
          confirmed.push({
            entity_id: match.entity.id,
            name: match.entity.name,
            match_score: det.confidence,
          });
        }
      } else {
        appeared.push({
          label: det.label,
          estimated_position: det.estimated_position,
        });
      }
    }

    // Identify expected entities that were NOT detected
    for (const v of expected.visible_entities) {
      if (!matchedExpectedIds.has(v.entity.id)) {
        missing.push({
          entity_id: v.entity.id,
          name: v.entity.name,
          last_position: v.entity.position,
          reason: 'Expected in field of view but not observed in current perception frame',
        });
      }
    }

    return {
      timestamp: getCurrentIsoString(),
      observer_position: params.observer_pose.position,
      confirmed,
      appeared,
      displaced,
      missing_or_occluded: missing,
      anomalies,
    };
  }
}
