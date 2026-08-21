import Database from 'better-sqlite3';
import { Entity } from '../schema/types.js';
import { parseEntityRow } from './row-mappers.js';
import { getCurrentIsoString } from '../utils/time.js';
import { logEntityEvent } from './events.js';

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
}
