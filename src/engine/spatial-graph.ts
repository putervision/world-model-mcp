import Database from 'better-sqlite3';
import { SpatialRelation, RelationRow, RelationType } from '../schema/types.js';
import { parseRelationRow } from './row-mappers.js';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';
import { Vector3D, vec3Distance } from '../utils/math.js';
import { EntityStore } from './entity-store.js';
import { ValidationError } from '../utils/errors.js';

const INVERSE_RELATIONS: Record<string, RelationType> = {
  inside: 'contains',
  contains: 'inside',
  above: 'below',
  below: 'above',
  holding: 'part_of',
  part_of: 'holding',
};

export class SpatialGraph {
  static setRelation(
    db: Database.Database,
    params: {
      project: string;
      source_id: string;
      relation: RelationType;
      target_id: string;
      offset?: Vector3D;
      distance?: number;
      metadata?: Record<string, any>;
      bidirectional?: boolean;
    }
  ): SpatialRelation {
    const source = EntityStore.getEntity(db, { project: params.project, id: params.source_id });
    if (!source) {
      throw new ValidationError(`Source entity "${params.source_id}" does not exist.`);
    }
    const target = EntityStore.getEntity(db, { project: params.project, id: params.target_id });
    if (!target) {
      throw new ValidationError(`Target entity "${params.target_id}" does not exist.`);
    }

    let calculatedDistance = params.distance;
    if (calculatedDistance === undefined && source.position && target.position) {
      calculatedDistance = vec3Distance(source.position, target.position);
    }

    const id = generateId();
    const now = getCurrentIsoString();
    const metadata = params.metadata || {};

    const stmt = db.prepare(`
      INSERT INTO spatial_relations (
        id, project, source_id, relation, target_id, offset_x, offset_y, offset_z, distance, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project, source_id, relation, target_id) DO UPDATE SET
        offset_x = excluded.offset_x,
        offset_y = excluded.offset_y,
        offset_z = excluded.offset_z,
        distance = excluded.distance,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `);

    db.transaction(() => {
      stmt.run(
        id,
        params.project,
        params.source_id,
        params.relation,
        params.target_id,
        params.offset?.x ?? null,
        params.offset?.y ?? null,
        params.offset?.z ?? null,
        calculatedDistance ?? null,
        JSON.stringify(metadata),
        now,
        now
      );

      // Handle automatic inverse relation if requested or standard inverse exists
      if (params.bidirectional || INVERSE_RELATIONS[params.relation]) {
        const inverseRel = INVERSE_RELATIONS[params.relation] || params.relation;
        const invId = generateId();
        const invOffset = params.offset
          ? { x: -params.offset.x, y: -params.offset.y, z: -params.offset.z }
          : undefined;

        stmt.run(
          invId,
          params.project,
          params.target_id,
          inverseRel,
          params.source_id,
          invOffset?.x ?? null,
          invOffset?.y ?? null,
          invOffset?.z ?? null,
          calculatedDistance ?? null,
          JSON.stringify(metadata),
          now,
          now
        );
      }
    })();

    const row = db
      .prepare(
        'SELECT * FROM spatial_relations WHERE project = ? AND source_id = ? AND relation = ? AND target_id = ?'
      )
      .get(params.project, params.source_id, params.relation, params.target_id) as RelationRow;

    return parseRelationRow(row);
  }

  static removeRelation(
    db: Database.Database,
    params: {
      project: string;
      source_id: string;
      relation?: RelationType;
      target_id: string;
      remove_inverse?: boolean;
    }
  ): boolean {
    db.transaction(() => {
      if (params.relation) {
        db.prepare(
          `
          DELETE FROM spatial_relations
          WHERE project = ? AND source_id = ? AND relation = ? AND target_id = ?
        `
        ).run(params.project, params.source_id, params.relation, params.target_id);

        if (params.remove_inverse) {
          const invRel = INVERSE_RELATIONS[params.relation] || params.relation;
          db.prepare(
            `
            DELETE FROM spatial_relations
            WHERE project = ? AND source_id = ? AND relation = ? AND target_id = ?
          `
          ).run(params.project, params.target_id, invRel, params.source_id);
        }
      } else {
        db.prepare(
          `
          DELETE FROM spatial_relations
          WHERE project = ? AND source_id = ? AND target_id = ?
        `
        ).run(params.project, params.source_id, params.target_id);

        if (params.remove_inverse) {
          db.prepare(
            `
            DELETE FROM spatial_relations
            WHERE project = ? AND source_id = ? AND target_id = ?
          `
          ).run(params.project, params.target_id, params.source_id);
        }
      }
    })();
    return true;
  }

  static getRelations(
    db: Database.Database,
    params: {
      project: string;
      entity_id?: string;
      relation?: RelationType;
      as_target?: boolean;
    }
  ): SpatialRelation[] {
    let query = 'SELECT * FROM spatial_relations WHERE project = ?';
    const args: any[] = [params.project];

    if (params.entity_id) {
      if (params.as_target) {
        query += ' AND target_id = ?';
      } else {
        query += ' AND source_id = ?';
      }
      args.push(params.entity_id);
    }

    if (params.relation) {
      query += ' AND relation = ?';
      args.push(params.relation);
    }

    query += ' ORDER BY created_at DESC';

    const rows = db.prepare(query).all(...args) as RelationRow[];
    return rows.map(parseRelationRow);
  }

  /**
   * Traverse relations to find all connected entities up to maxDepth.
   */
  static traverseTopologicalGraph(
    db: Database.Database,
    params: {
      project: string;
      start_entity_id: string;
      max_depth?: number;
      allowed_relations?: RelationType[];
    }
  ): Array<{ entity_id: string; relation: RelationType; depth: number }> {
    const maxDepth = params.max_depth || 3;
    const visited = new Set<string>([params.start_entity_id]);
    const queue: Array<{ id: string; depth: number }> = [{ id: params.start_entity_id, depth: 0 }];
    const results: Array<{ entity_id: string; relation: RelationType; depth: number }> = [];

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (depth >= maxDepth) continue;

      const relations = SpatialGraph.getRelations(db, {
        project: params.project,
        entity_id: id,
      });

      for (const rel of relations) {
        if (params.allowed_relations && !params.allowed_relations.includes(rel.relation)) {
          continue;
        }

        if (!visited.has(rel.target_id)) {
          visited.add(rel.target_id);
          results.push({
            entity_id: rel.target_id,
            relation: rel.relation,
            depth: depth + 1,
          });
          queue.push({ id: rel.target_id, depth: depth + 1 });
        }
      }
    }

    return results;
  }
}
