import Database from 'better-sqlite3';
import { Entity, TimeTravelState } from '../schema/types.js';
import { EntityStore } from './entity-store.js';
import { SpatialGraph } from './spatial-graph.js';
import { logEntityEvent } from './events.js';
import { safeJsonParse } from '../utils/json-validator.js';

export class TimeTravelEngine {
  static undoMutation(
    db: Database.Database,
    params: {
      project: string;
      entity_id?: string;
      type?: 'entity' | 'relation' | 'any';
    }
  ): { success: boolean; reverted_event_id?: string; message: string } {
    // Collect all event IDs that were already reverted by prior undo operations
    const undoRows = db
      .prepare("SELECT details_json FROM entity_history WHERE project = ? AND source = 'undo'")
      .all(params.project) as any[];

    const revertedIds = new Set<string>();
    for (const r of undoRows) {
      const details = safeJsonParse<Record<string, any>>(r.details_json || '{}', {});
      if (details.reverted_event_id) {
        revertedIds.add(details.reverted_event_id);
      }
    }

    let query =
      "SELECT rowid, * FROM entity_history WHERE project = ? AND (source IS NULL OR source != 'undo')";
    const queryParams: any[] = [params.project];

    if (params.entity_id) {
      query += ' AND entity_id = ?';
      queryParams.push(params.entity_id);
    }

    query += ' ORDER BY rowid DESC';
    const candidateEvents = db.prepare(query).all(...queryParams) as any[];
    const lastEvent = candidateEvents.find((e) => !revertedIds.has(e.id));

    if (!lastEvent) {
      return {
        success: false,
        message: 'No mutation events found to undo.',
      };
    }

    const entityId = lastEvent.entity_id;
    const action = lastEvent.action;

    if (action === 'created') {
      // Entity was created, undoing means removing entity
      EntityStore.removeEntity(db, { project: params.project, id: entityId, hard_delete: true });
      logEntityEvent(db, {
        project: params.project,
        entity_id: entityId,
        action: 'destroyed',
        source: 'undo',
        details: { reverted_event_id: lastEvent.id, undo_action: 'created' },
      });
      return {
        success: true,
        reverted_event_id: lastEvent.id,
        message: `Reverted creation of entity "${entityId}".`,
      };
    }

    // Find the state for this entity immediately before lastEvent
    const prevEvent = candidateEvents.find(
      (e) => e.rowid < lastEvent.rowid && e.entity_id === entityId && e.action !== 'destroyed'
    );

    if (prevEvent) {
      db.prepare(
        `
        UPDATE entities
        SET x = ?, y = ?, z = ?, confidence = ?, updated_at = ?
        WHERE project = ? AND id = ?
      `
      ).run(
        prevEvent.x,
        prevEvent.y,
        prevEvent.z,
        prevEvent.confidence ?? 1.0,
        prevEvent.timestamp,
        params.project,
        entityId
      );

      logEntityEvent(db, {
        project: params.project,
        entity_id: entityId,
        action: 'moved',
        position:
          prevEvent.x !== null ? { x: prevEvent.x, y: prevEvent.y, z: prevEvent.z } : undefined,
        confidence: prevEvent.confidence ?? undefined,
        source: 'undo',
        details: { reverted_event_id: lastEvent.id, restored_to_timestamp: prevEvent.timestamp },
      });

      return {
        success: true,
        reverted_event_id: lastEvent.id,
        message: `Reverted mutation on entity "${entityId}" back to state from ${prevEvent.timestamp}.`,
      };
    }

    // No earlier active state found; remove entity
    EntityStore.removeEntity(db, { project: params.project, id: entityId, hard_delete: true });
    logEntityEvent(db, {
      project: params.project,
      entity_id: entityId,
      action: 'destroyed',
      source: 'undo',
      details: { reverted_event_id: lastEvent.id },
    });
    return {
      success: true,
      reverted_event_id: lastEvent.id,
      message: `Removed entity "${entityId}" as no previous state existed.`,
    };
  }

  static getStateAtTimestamp(
    db: Database.Database,
    params: { project: string; timestamp: string }
  ): TimeTravelState {
    const events = db
      .prepare(
        'SELECT * FROM entity_history WHERE project = ? AND timestamp <= ? ORDER BY rowid ASC'
      )
      .all(params.project, params.timestamp) as any[];

    const entityMap = new Map<string, Partial<Entity>>();

    for (const ev of events) {
      if (ev.action === 'destroyed') {
        entityMap.delete(ev.entity_id);
        continue;
      }

      const existing: Partial<Entity> = entityMap.get(ev.entity_id) || {
        id: ev.entity_id,
        project: ev.project,
        name: `Entity_${ev.entity_id.slice(0, 6)}`,
        type: 'object',
        status: 'active',
        properties: {},
        tags: [],
        version: 1,
        created_at: ev.timestamp,
        updated_at: ev.timestamp,
        last_seen_at: ev.timestamp,
      };

      if (ev.x !== null) {
        existing.position = { x: ev.x, y: ev.y, z: ev.z };
      }
      if (ev.confidence !== null) {
        existing.confidence = ev.confidence;
      }
      existing.updated_at = ev.timestamp;
      existing.last_seen_at = ev.timestamp;

      entityMap.set(ev.entity_id, existing);
    }

    const entities = Array.from(entityMap.values()) as Entity[];
    const relations = SpatialGraph.getRelations(db, { project: params.project }).filter(
      (r) => r.created_at <= params.timestamp
    );

    return {
      timestamp: params.timestamp,
      entities,
      relations,
    };
  }
}
