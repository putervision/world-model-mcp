import Database from 'better-sqlite3';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';
import { Entity, SpatialRelation, SpatialDiffResult } from '../schema/types.js';
import { vec3Distance } from '../utils/math.js';
import { EntityStore } from './entity-store.js';
import { SpatialGraph } from './spatial-graph.js';
import { ValidationError } from '../utils/errors.js';

export class SnapshotEngine {
  static saveSnapshot(
    db: Database.Database,
    params: { project: string; name: string; description?: string }
  ): { snapshot_id: string; name: string; timestamp: string } {
    if (!params.name || typeof params.name !== 'string') {
      throw new ValidationError('Snapshot name is required.');
    }

    const entities = EntityStore.listEntities(db, { project: params.project, limit: 10000 });
    const relations = SpatialGraph.getRelations(db, { project: params.project });
    const regions = db.prepare('SELECT * FROM regions WHERE project = ?').all(params.project);

    const data = { entities, relations, regions };
    const id = generateId();
    const now = getCurrentIsoString();

    db.prepare(
      `
      INSERT INTO snapshots (id, project, name, description, data_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(project, name) DO UPDATE SET
        description = excluded.description,
        data_json = excluded.data_json,
        created_at = excluded.created_at
    `
    ).run(id, params.project, params.name, params.description ?? null, JSON.stringify(data), now);

    return { snapshot_id: id, name: params.name, timestamp: now };
  }

  static restoreSnapshot(
    db: Database.Database,
    params: { project: string; name: string }
  ): { restored_entities: number; restored_relations: number } {
    const row = db
      .prepare('SELECT * FROM snapshots WHERE project = ? AND name = ?')
      .get(params.project, params.name) as any;

    if (!row) {
      throw new ValidationError(
        `Snapshot "${params.name}" not found for project "${params.project}".`
      );
    }

    const data = JSON.parse(row.data_json);

    db.transaction(() => {
      db.prepare('DELETE FROM spatial_relations WHERE project = ?').run(params.project);
      db.prepare('DELETE FROM entities WHERE project = ?').run(params.project);
      try {
        db.prepare(
          'DELETE FROM entities_fts WHERE rowid IN (SELECT rowid FROM entities WHERE project = ?)'
        ).run(params.project);
      } catch {}

      for (const ent of data.entities || []) {
        EntityStore.addEntity(db, { ...ent, project: params.project });
      }

      for (const rel of data.relations || []) {
        SpatialGraph.setRelation(db, { ...rel, project: params.project });
      }
    })();

    return {
      restored_entities: (data.entities || []).length,
      restored_relations: (data.relations || []).length,
    };
  }

  static listSnapshots(db: Database.Database, params: { project: string }): any[] {
    return db
      .prepare(
        'SELECT id, project, name, description, created_at FROM snapshots WHERE project = ? ORDER BY created_at DESC'
      )
      .all(params.project);
  }

  static diffSnapshots(
    db: Database.Database,
    params: { project: string; snapshot_a: string; snapshot_b: string }
  ): SpatialDiffResult {
    const rowA = db
      .prepare('SELECT * FROM snapshots WHERE project = ? AND name = ?')
      .get(params.project, params.snapshot_a) as any;
    const rowB = db
      .prepare('SELECT * FROM snapshots WHERE project = ? AND name = ?')
      .get(params.project, params.snapshot_b) as any;

    if (!rowA || !rowB) {
      throw new ValidationError(
        `One or both snapshots ("${params.snapshot_a}", "${params.snapshot_b}") not found.`
      );
    }

    const dataA = JSON.parse(rowA.data_json);
    const dataB = JSON.parse(rowB.data_json);

    const entitiesA: Entity[] = dataA.entities || [];
    const entitiesB: Entity[] = dataB.entities || [];
    const mapA = new Map(entitiesA.map((e) => [e.id, e]));
    const mapB = new Map(entitiesB.map((e) => [e.id, e]));

    const addedEntities: Entity[] = [];
    const removedEntities: Entity[] = [];
    const displacedEntities: SpatialDiffResult['displaced_entities'] = [];

    for (const [id, eb] of mapB) {
      const ea = mapA.get(id);
      if (!ea) {
        addedEntities.push(eb);
      } else if (ea.position && eb.position) {
        const dist = vec3Distance(ea.position, eb.position);
        if (dist > 0.01) {
          displacedEntities.push({
            id,
            name: eb.name,
            position_a: ea.position,
            position_b: eb.position,
            distance: dist,
          });
        }
      }
    }

    for (const [id, ea] of mapA) {
      if (!mapB.has(id)) {
        removedEntities.push(ea);
      }
    }

    const relationsA: SpatialRelation[] = dataA.relations || [];
    const relationsB: SpatialRelation[] = dataB.relations || [];
    const relKey = (r: SpatialRelation) => `${r.source_id}:${r.relation}:${r.target_id}`;
    const relMapA = new Set(relationsA.map(relKey));
    const relMapB = new Set(relationsB.map(relKey));

    const addedRelations = relationsB.filter((r) => !relMapA.has(relKey(r)));
    const removedRelations = relationsA.filter((r) => !relMapB.has(relKey(r)));

    return {
      snapshot_a: params.snapshot_a,
      snapshot_b: params.snapshot_b,
      added_entities: addedEntities,
      removed_entities: removedEntities,
      displaced_entities: displacedEntities,
      added_relations: addedRelations,
      removed_relations: removedRelations,
    };
  }
}
