import crypto from 'crypto';
import Database from 'better-sqlite3';
import { EntityHistoryEvent, HistoryAction } from '../schema/types.js';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';
import { safeJsonParse } from '../utils/json-validator.js';
import { Vector3D } from '../utils/math.js';

export function computeEventHash(params: {
  prev_hash: string;
  id: string;
  project: string;
  entity_id: string;
  action: string;
  timestamp: string;
  details?: Record<string, any>;
}): string {
  const data = [
    params.prev_hash,
    params.id,
    params.project,
    params.entity_id,
    params.action,
    params.timestamp,
    JSON.stringify(params.details || {}),
  ].join('|');
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function logEntityEvent(
  db: Database.Database,
  params: {
    project: string;
    entity_id: string;
    action: HistoryAction;
    position?: Vector3D;
    confidence?: number;
    source?: string;
    visual_state_id?: string;
    task_id?: string;
    details?: Record<string, any>;
  }
): EntityHistoryEvent {
  // Get previous event hash
  const lastRow = db
    .prepare('SELECT hash FROM entity_history WHERE project = ? ORDER BY rowid DESC LIMIT 1')
    .get(params.project) as { hash?: string } | undefined;
  const prevHash = lastRow?.hash || '0'.repeat(64);

  const eventId = generateId();
  const timestamp = getCurrentIsoString();
  const hash = computeEventHash({
    prev_hash: prevHash,
    id: eventId,
    project: params.project,
    entity_id: params.entity_id,
    action: params.action,
    timestamp,
    details: params.details,
  });

  const event: EntityHistoryEvent = {
    id: eventId,
    project: params.project,
    entity_id: params.entity_id,
    action: params.action,
    position: params.position,
    confidence: params.confidence,
    source: params.source || 'manual',
    visual_state_id: params.visual_state_id,
    task_id: params.task_id,
    details: params.details,
    timestamp,
    prev_hash: prevHash,
    hash,
  };

  db.prepare(
    `
    INSERT INTO entity_history (
      id, project, entity_id, action, x, y, z, confidence, source, visual_state_id, task_id, details_json, timestamp, prev_hash, hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    event.id,
    event.project,
    event.entity_id,
    event.action,
    event.position?.x ?? null,
    event.position?.y ?? null,
    event.position?.z ?? null,
    event.confidence ?? null,
    event.source,
    event.visual_state_id ?? null,
    event.task_id ?? null,
    JSON.stringify(event.details || {}),
    event.timestamp,
    event.prev_hash,
    event.hash
  );

  return event;
}

export function getEntityHistory(
  db: Database.Database,
  params: {
    project: string;
    entity_id: string;
    limit?: number;
  }
): EntityHistoryEvent[] {
  const rows = db
    .prepare(
      `
      SELECT id, project, entity_id, action, x, y, z, confidence, source, visual_state_id, task_id, details_json, timestamp, prev_hash, hash
      FROM entity_history
      WHERE project = ? AND entity_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `
    )
    .all(params.project, params.entity_id, params.limit || 50) as any[];

  return rows.map((r) => ({
    id: r.id,
    project: r.project,
    entity_id: r.entity_id,
    action: r.action,
    position: r.x !== null && r.y !== null && r.z !== null ? { x: r.x, y: r.y, z: r.z } : undefined,
    confidence: r.confidence ?? undefined,
    source: r.source,
    visual_state_id: r.visual_state_id ?? undefined,
    task_id: r.task_id ?? undefined,
    details: safeJsonParse(r.details_json || '{}', {}),
    timestamp: r.timestamp,
    prev_hash: r.prev_hash ?? undefined,
    hash: r.hash ?? undefined,
  }));
}

export function verifyEventAuditChain(
  db: Database.Database,
  params: { project: string }
): { valid: boolean; total_events: number; corrupted_event_id?: string; error?: string } {
  const rows = db
    .prepare(
      `
      SELECT id, project, entity_id, action, details_json, timestamp, prev_hash, hash
      FROM entity_history
      WHERE project = ?
      ORDER BY rowid ASC
    `
    )
    .all(params.project) as any[];

  if (rows.length === 0) {
    return { valid: true, total_events: 0 };
  }

  let expectedPrevHash = '0'.repeat(64);
  for (const r of rows) {
    if (r.prev_hash && r.prev_hash !== expectedPrevHash) {
      return {
        valid: false,
        total_events: rows.length,
        corrupted_event_id: r.id,
        error: `Broken hash link at event ${r.id}: expected prev_hash ${expectedPrevHash}, got ${r.prev_hash}`,
      };
    }

    const calculatedHash = computeEventHash({
      prev_hash: r.prev_hash || expectedPrevHash,
      id: r.id,
      project: r.project,
      entity_id: r.entity_id,
      action: r.action,
      timestamp: r.timestamp,
      details: safeJsonParse(r.details_json || '{}', {}),
    });

    if (r.hash && r.hash !== calculatedHash) {
      return {
        valid: false,
        total_events: rows.length,
        corrupted_event_id: r.id,
        error: `Invalid hash signature at event ${r.id}: expected ${calculatedHash}, got ${r.hash}`,
      };
    }

    expectedPrevHash = r.hash || calculatedHash;
  }

  return { valid: true, total_events: rows.length };
}

export function repairEventAuditChain(
  db: Database.Database,
  params: { project: string }
): { repaired: boolean; total_events: number } {
  const rows = db
    .prepare(
      `
      SELECT rowid, id, project, entity_id, action, details_json, timestamp, prev_hash, hash
      FROM entity_history
      WHERE project = ?
      ORDER BY rowid ASC
    `
    )
    .all(params.project) as any[];

  if (rows.length === 0) {
    return { repaired: true, total_events: 0 };
  }

  const updateStmt = db.prepare('UPDATE entity_history SET prev_hash = ?, hash = ? WHERE id = ?');

  const tx = db.transaction(() => {
    let currentPrevHash = '0'.repeat(64);
    for (const r of rows) {
      const details = safeJsonParse(r.details_json || '{}', {});
      const newHash = computeEventHash({
        prev_hash: currentPrevHash,
        id: r.id,
        project: r.project,
        entity_id: r.entity_id,
        action: r.action,
        timestamp: r.timestamp,
        details,
      });

      updateStmt.run(currentPrevHash, newHash, r.id);
      currentPrevHash = newHash;
    }
  });

  tx();

  return { repaired: true, total_events: rows.length };
}
