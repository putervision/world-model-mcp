import crypto from 'crypto';
import Database from 'better-sqlite3';
import {
  SpatialEvidencePack,
  LinkedStateMemoryNodes,
  EvidencePackRow,
  Entity,
  Observation,
} from '../schema/types.js';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';
import { safeJsonParse } from '../utils/json-validator.js';
import { EntityStore } from './entity-store.js';
import { SpatialGraph } from './spatial-graph.js';

export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJsonStringify).join(',') + ']';
  }
  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const pairs = keys.map((k) => JSON.stringify(k) + ':' + canonicalJsonStringify(record[k]));
  return '{' + pairs.join(',') + '}';
}

export class EvidenceEngine {
  static createEvidencePack(
    db: Database.Database,
    params: {
      project: string;
      task_id?: string;
      entity_ids?: string[];
      observation_ids?: string[];
      before_snapshot_id?: string;
      after_snapshot_id?: string;
      linked_state_memory_nodes?: LinkedStateMemoryNodes;
    }
  ): SpatialEvidencePack {
    const id = generateId();
    const now = getCurrentIsoString();

    // 1. Collect entities
    let entitiesSnapshot: Entity[] = [];
    if (params.entity_ids && params.entity_ids.length > 0) {
      for (const entId of params.entity_ids) {
        const ent = EntityStore.getEntity(db, { project: params.project, id: entId });
        if (ent) entitiesSnapshot.push(ent);
      }
    } else {
      entitiesSnapshot = EntityStore.listEntities(db, { project: params.project });
    }

    // 2. Collect observations
    const observationIds = params.observation_ids || [];
    const observationsSnapshot: Observation[] = [];
    if (observationIds.length > 0) {
      const placeholders = observationIds.map(() => '?').join(',');
      const rows = db
        .prepare(`SELECT * FROM observations WHERE project = ? AND id IN (${placeholders})`)
        .all(params.project, ...observationIds) as any[];

      for (const r of rows) {
        observationsSnapshot.push({
          id: r.id,
          project: r.project,
          visual_state_id: r.visual_state_id || undefined,
          observer_pose:
            r.observer_x !== null
              ? {
                  position: { x: r.observer_x, y: r.observer_y, z: r.observer_z },
                  orientation: {
                    pitch: r.observer_pitch,
                    yaw: r.observer_yaw,
                    roll: r.observer_roll,
                  },
                }
              : undefined,
          field_of_view:
            r.fov_horizontal !== null
              ? { fov_horizontal: r.fov_horizontal, fov_vertical: r.fov_vertical }
              : undefined,
          detections: safeJsonParse(r.raw_detections_json || '[]', []),
          reconcile_report: r.reconcile_report_json
            ? safeJsonParse(r.reconcile_report_json, undefined)
            : undefined,
          timestamp: r.timestamp,
        });
      }
    }

    // 3. Collect relations between entities
    const entIdSet = new Set(entitiesSnapshot.map((e) => e.id));
    const allRelations = SpatialGraph.getRelations(db, { project: params.project });
    const relationsSnapshot = allRelations.filter(
      (rel) => entIdSet.has(rel.source_id) || entIdSet.has(rel.target_id)
    );

    // 4. Build canonical payload
    const payload = {
      evidence_pack_id: id,
      project: params.project,
      task_id: params.task_id || null,
      created_at: now,
      entity_ids: entitiesSnapshot.map((e) => e.id),
      observation_ids: observationsSnapshot.map((o) => o.id),
      before_snapshot_id: params.before_snapshot_id || null,
      after_snapshot_id: params.after_snapshot_id || null,
      entities: entitiesSnapshot,
      observations: observationsSnapshot,
      relations: relationsSnapshot,
      linked_state_memory_nodes: params.linked_state_memory_nodes || {},
    };

    const canonicalJson = canonicalJsonStringify(payload);
    const sha256Hash = crypto.createHash('sha256').update(canonicalJson).digest('hex');

    // 5. Store into evidence_packs
    db.prepare(
      `
      INSERT INTO evidence_packs (
        id, project, task_id, entity_ids_json, observation_ids_json, before_snapshot_id, after_snapshot_id, payload_json, sha256_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      params.project,
      params.task_id || null,
      JSON.stringify(entitiesSnapshot.map((e) => e.id)),
      JSON.stringify(observationsSnapshot.map((o) => o.id)),
      params.before_snapshot_id || null,
      params.after_snapshot_id || null,
      canonicalJson,
      sha256Hash,
      now
    );

    // 6. Generate State Memory tool call instructions
    const primaryTargetId =
      params.task_id ||
      params.linked_state_memory_nodes?.task_ids?.[0] ||
      params.linked_state_memory_nodes?.decision_ids?.[0];

    const stateMemoryToolCalls = {
      instruction:
        'Please execute state-memory-mcp:manage_nodes (action: "create", type: "artifact") to register this cryptographic spatial evidence pack in your state graph ledger.',
      mcp_tool_call: {
        server: 'state-memory-mcp',
        tool: 'manage_nodes',
        arguments: {
          action: 'create',
          type: 'artifact',
          title: `Spatial Evidence Pack: ${id}`,
          status: 'current',
          metadata: {
            evidence_pack_id: id,
            sha256_hash: sha256Hash,
            entity_count: entitiesSnapshot.length,
            observation_count: observationsSnapshot.length,
            created_at: now,
          },
        },
      },
      link_tool_call: primaryTargetId
        ? {
            server: 'state-memory-mcp',
            tool: 'manage_edges',
            arguments: {
              action: 'create',
              type: 'produces',
              source_id: primaryTargetId,
              target_id: id,
            },
          }
        : undefined,
    };

    return {
      id,
      project: params.project,
      created_at: now,
      task_id: params.task_id,
      entity_ids: entitiesSnapshot.map((e) => e.id),
      observation_ids: observationsSnapshot.map((o) => o.id),
      before_snapshot_id: params.before_snapshot_id,
      after_snapshot_id: params.after_snapshot_id,
      entities_snapshot: entitiesSnapshot,
      observations_snapshot: observationsSnapshot,
      relations_snapshot: relationsSnapshot,
      linked_state_memory_nodes: params.linked_state_memory_nodes,
      payload_hash: sha256Hash,
      state_memory_tool_calls: stateMemoryToolCalls,
    };
  }

  static verifyEvidencePack(
    db: Database.Database,
    params: { project: string; id: string }
  ): { valid: boolean; calculated_hash: string; stored_hash: string; message: string } {
    const row = db
      .prepare('SELECT * FROM evidence_packs WHERE project = ? AND id = ?')
      .get(params.project, params.id) as EvidencePackRow | undefined;

    if (!row) {
      throw new Error(`Evidence pack "${params.id}" not found.`);
    }

    const calculatedHash = crypto.createHash('sha256').update(row.payload_json).digest('hex');
    const valid = calculatedHash === row.sha256_hash;

    return {
      valid,
      calculated_hash: calculatedHash,
      stored_hash: row.sha256_hash,
      message: valid
        ? `Evidence pack "${params.id}" verified successfully with valid SHA-256 hash.`
        : `Evidence pack "${params.id}" FAILED verification: hash mismatch.`,
    };
  }

  static listEvidencePacks(
    db: Database.Database,
    params: { project: string }
  ): Array<{
    id: string;
    project: string;
    task_id?: string;
    sha256_hash: string;
    created_at: string;
  }> {
    const rows = db
      .prepare(
        'SELECT id, project, task_id, sha256_hash, created_at FROM evidence_packs WHERE project = ? ORDER BY created_at DESC'
      )
      .all(params.project) as any[];

    return rows.map((r) => ({
      id: r.id,
      project: r.project,
      task_id: r.task_id || undefined,
      sha256_hash: r.sha256_hash,
      created_at: r.created_at,
    }));
  }
}
