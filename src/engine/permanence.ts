import Database from 'better-sqlite3';
import { Entity } from '../schema/types.js';
import { parseEntityRow } from './row-mappers.js';
import { getCurrentIsoString } from '../utils/time.js';
import { logEntityEvent } from './events.js';
import {
  Vector3D,
  vec3Add,
  vec3Scale,
  vec3Length,
  vec3Normalize,
  aabbFromCenterSize,
  aabbContainsPoint,
  rayAabbIntersect,
} from '../utils/math.js';

export interface ExtrapolatePositionOptions {
  damping?: number; // gamma in e^(-gamma * t), default 0.1
  clampObstacles?: boolean; // default true
  maxElapsedSeconds?: number; // default 10.0s (zero velocity if elapsed > 10s)
}

export interface ExtrapolatedEntityPosition {
  entity_id: string;
  original_position: Vector3D;
  extrapolated_position: Vector3D;
  velocity: Vector3D;
  elapsed_seconds: number;
  clamped: boolean;
}

export class PermanenceEngine {
  /**
   * Applies confidence decay to all active entities not observed since threshold.
   */
  static applyPermanenceDecay(
    db: Database.Database,
    params: {
      project: string;
      decay_rate?: number; // e.g. 0.05 per interval
      unseen_for_ms?: number; // threshold to begin decay, default 60000ms
      min_confidence_threshold?: number; // default 0.2
    }
  ): { decayed_count: number; lost_count: number; updated_entities: Entity[] } {
    const decayRate = params.decay_rate !== undefined ? params.decay_rate : 0.05;
    const unseenMs = params.unseen_for_ms !== undefined ? params.unseen_for_ms : 60000;
    const minThreshold =
      params.min_confidence_threshold !== undefined ? params.min_confidence_threshold : 0.2;

    const cutoffIso = new Date(Date.now() - unseenMs).toISOString();

    // Query active entities not seen recently
    const rows = db
      .prepare(
        `
        SELECT * FROM entities
        WHERE project = ? AND status = 'active' AND last_seen_at < ?
      `
      )
      .all(params.project, cutoffIso) as any[];

    let decayedCount = 0;
    let lostCount = 0;
    const updated: Entity[] = [];
    const now = getCurrentIsoString();

    db.transaction(() => {
      for (const row of rows) {
        const oldConf = row.confidence ?? 1.0;
        const newConf = Math.max(0, oldConf - decayRate);
        let newStatus = row.status;

        if (newConf <= 0.05) {
          newStatus = 'lost';
          lostCount++;
        } else if (newConf < minThreshold) {
          newStatus = 'hidden';
        }

        db.prepare(
          `
          UPDATE entities SET
            confidence = ?,
            status = ?,
            updated_at = ?,
            version = version + 1
          WHERE project = ? AND id = ?
        `
        ).run(newConf, newStatus, now, params.project, row.id);

        decayedCount++;

        logEntityEvent(db, {
          project: params.project,
          entity_id: row.id,
          action: 'confidence_decayed',
          confidence: newConf,
          source: 'permanence_decay',
          details: { old_confidence: oldConf, new_confidence: newConf, status: newStatus },
        });

        updated.push(
          parseEntityRow({ ...row, confidence: newConf, status: newStatus, updated_at: now })
        );
      }
    })();

    return { decayed_count: decayedCount, lost_count: lostCount, updated_entities: updated };
  }

  /**
   * Boosts entity confidence back to 1.0 upon observation.
   */
  static reObserveEntity(
    db: Database.Database,
    params: { project: string; entity_id: string; visual_state_id?: string }
  ): void {
    const now = getCurrentIsoString();
    db.prepare(
      `
      UPDATE entities SET
        confidence = 1.0,
        status = 'active',
        last_seen_at = ?,
        updated_at = ?,
        version = version + 1
      WHERE project = ? AND id = ?
    `
    ).run(now, now, params.project, params.entity_id);

    logEntityEvent(db, {
      project: params.project,
      entity_id: params.entity_id,
      action: 're_identified',
      confidence: 1.0,
      source: 'vision_observation',
      visual_state_id: params.visual_state_id,
    });
  }

  static getDecayStats(
    db: Database.Database,
    params: { project: string }
  ): {
    total_tracked: number;
    active_count: number;
    hidden_count: number;
    lost_count: number;
    destroyed_count: number;
    avg_confidence: number;
  } {
    const rows = db
      .prepare('SELECT status, confidence FROM entities WHERE project = ?')
      .all(params.project) as any[];
    let active = 0;
    let hidden = 0;
    let lost = 0;
    let destroyed = 0;
    let totalConf = 0;

    for (const r of rows) {
      if (r.status === 'active') active++;
      else if (r.status === 'hidden') hidden++;
      else if (r.status === 'lost') lost++;
      else if (r.status === 'destroyed') destroyed++;
      totalConf += r.confidence ?? 1.0;
    }

    return {
      total_tracked: rows.length,
      active_count: active,
      hidden_count: hidden,
      lost_count: lost,
      destroyed_count: destroyed,
      avg_confidence: rows.length > 0 ? totalConf / rows.length : 1.0,
    };
  }

  /**
   * Extrapolates an entity's 3D position using velocity and exponential damping p(t) = p0 + v * dt * e^(-gamma * dt).
   * Clamps against static obstacle AABBs.
   * If elapsed time exceeds maxElapsedSeconds (default 10s), velocity is zeroed.
   */
  static extrapolateEntityPosition(
    entity: Entity,
    targetTimeIso?: string,
    obstacles: Entity[] = [],
    options: ExtrapolatePositionOptions = {}
  ): ExtrapolatedEntityPosition {
    const p0 = entity.position ?? { x: 0, y: 0, z: 0 };
    const v = entity.velocity ?? { x: 0, y: 0, z: 0 };
    const maxElapsed = options.maxElapsedSeconds ?? 10.0;
    const damping = options.damping ?? 0.1;
    const clampObstacles = options.clampObstacles ?? true;

    if (!entity.position || (v.x === 0 && v.y === 0 && v.z === 0)) {
      return {
        entity_id: entity.id,
        original_position: p0,
        extrapolated_position: p0,
        velocity: v,
        elapsed_seconds: 0,
        clamped: false,
      };
    }

    const lastTime = new Date(entity.updated_at || entity.last_seen_at).getTime();
    const targetTime = targetTimeIso ? new Date(targetTimeIso).getTime() : Date.now();
    const elapsedSeconds = Math.max(0, (targetTime - lastTime) / 1000);

    // If entity was updated more than maxElapsed (10s) ago, zero out velocity
    if (elapsedSeconds <= 0 || elapsedSeconds > maxElapsed) {
      return {
        entity_id: entity.id,
        original_position: p0,
        extrapolated_position: p0,
        velocity: elapsedSeconds > maxElapsed ? { x: 0, y: 0, z: 0 } : v,
        elapsed_seconds: elapsedSeconds,
        clamped: false,
      };
    }

    // p(t) = p0 + v * dt * e^(-gamma * dt)
    const decayFactor = Math.exp(-damping * elapsedSeconds);
    const displacement: Vector3D = {
      x: v.x * elapsedSeconds * decayFactor,
      y: v.y * elapsedSeconds * decayFactor,
      z: v.z * elapsedSeconds * decayFactor,
    };

    let pTarget: Vector3D = vec3Add(p0, displacement);
    let clamped = false;

    if (clampObstacles && obstacles.length > 0) {
      const dispLen = vec3Length(displacement);
      if (dispLen > 0.0001) {
        const dir = vec3Normalize(displacement);
        let nearestHitDist = Infinity;

        for (const obs of obstacles) {
          if (obs.id === entity.id || !obs.position || !obs.bounding_box) continue;
          const isObstacle = Boolean(
            obs.type === 'obstacle' ||
            obs.properties?.collidable ||
            obs.properties?.is_solid ||
            (obs.affordance_mask && (obs.affordance_mask & 16 || obs.affordance_mask & 2))
          );
          if (!isObstacle && obs.type !== 'obstacle') continue;

          const box = aabbFromCenterSize(obs.position, obs.bounding_box);
          if (aabbContainsPoint(box, pTarget)) {
            clamped = true;
          }

          const hit = rayAabbIntersect(p0, dir, box, dispLen);
          if (hit.hit && hit.t < nearestHitDist && hit.t <= dispLen) {
            nearestHitDist = hit.t;
            clamped = true;
          }
        }

        if (clamped && nearestHitDist < Infinity) {
          const safeDist = Math.max(0, nearestHitDist - 0.05);
          pTarget = vec3Add(p0, vec3Scale(dir, safeDist));
        }
      }
    }

    return {
      entity_id: entity.id,
      original_position: p0,
      extrapolated_position: pTarget,
      velocity: v,
      elapsed_seconds: elapsedSeconds,
      clamped,
    };
  }

  /**
   * Extrapolates all active entities in a project with velocity vectors.
   */
  static extrapolateAllActive(
    db: Database.Database,
    params: { project: string; target_time_iso?: string; options?: ExtrapolatePositionOptions }
  ): ExtrapolatedEntityPosition[] {
    const rows = db
      .prepare("SELECT * FROM entities WHERE project = ? AND status = 'active'")
      .all(params.project) as any[];

    const allEntities = rows.map((r) => parseEntityRow(r));
    const obstacles = allEntities.filter(
      (e) =>
        e.type === 'obstacle' ||
        e.properties?.collidable ||
        e.properties?.is_solid ||
        (e.affordance_mask && (e.affordance_mask & 16 || e.affordance_mask & 2))
    );

    return allEntities.map((e) =>
      PermanenceEngine.extrapolateEntityPosition(
        e,
        params.target_time_iso,
        obstacles,
        params.options
      )
    );
  }
}
