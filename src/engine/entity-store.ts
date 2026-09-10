import Database from 'better-sqlite3';
import { Entity, EntityRow, EntityType, EntityStatus } from '../schema/types.js';
import { parseEntityRow } from './row-mappers.js';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';
import { Vector3D, Orientation3D, BoundingBoxSize, vec3Distance } from '../utils/math.js';
import { logEntityEvent } from './events.js';
import { ValidationError } from '../utils/errors.js';
import { sanitizeKeys } from '../utils/sanitize.js';

export class EntityStore {
  static addEntity(
    db: Database.Database,
    params: {
      project: string;
      id?: string;
      name: string;
      type: EntityType;
      status?: EntityStatus;
      position?: Vector3D;
      orientation?: Orientation3D;
      bounding_box?: BoundingBoxSize;
      confidence?: number;
      parent_id?: string;
      region_id?: string;
      properties?: Record<string, any>;
      tags?: string[];
      source?: string;
      visual_state_id?: string;
      task_id?: string;
      timestamp?: string;
    }
  ): Entity {
    if (!params.name || typeof params.name !== 'string') {
      throw new ValidationError('Entity name is required and must be a string.');
    }
    if (!params.type || typeof params.type !== 'string') {
      throw new ValidationError('Entity type is required.');
    }

    const id = params.id || generateId();
    const now = getCurrentIsoString();
    const status = params.status || 'active';
    const confidence =
      params.confidence !== undefined ? Math.max(0, Math.min(1, params.confidence)) : 1.0;
    const properties = sanitizeKeys(params.properties || {});
    const tags = params.tags || [];

    const stmt = db.prepare(`
      INSERT INTO entities (
        id, project, name, type, status, x, y, z, pitch, yaw, roll,
        bbox_width, bbox_height, bbox_depth, confidence, parent_id, region_id,
        properties_json, tags_json, last_seen_at, created_at, updated_at, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        status = excluded.status,
        x = excluded.x,
        y = excluded.y,
        z = excluded.z,
        pitch = excluded.pitch,
        yaw = excluded.yaw,
        roll = excluded.roll,
        bbox_width = excluded.bbox_width,
        bbox_height = excluded.bbox_height,
        bbox_depth = excluded.bbox_depth,
        confidence = excluded.confidence,
        parent_id = excluded.parent_id,
        region_id = excluded.region_id,
        properties_json = excluded.properties_json,
        tags_json = excluded.tags_json,
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at,
        version = entities.version + 1
    `);

    db.transaction(() => {
      stmt.run(
        id,
        params.project,
        params.name,
        params.type,
        status,
        params.position?.x ?? null,
        params.position?.y ?? null,
        params.position?.z ?? null,
        params.orientation?.pitch ?? null,
        params.orientation?.yaw ?? null,
        params.orientation?.roll ?? null,
        params.bounding_box?.width ?? null,
        params.bounding_box?.height ?? null,
        params.bounding_box?.depth ?? null,
        confidence,
        params.parent_id ?? null,
        params.region_id ?? null,
        JSON.stringify(properties),
        JSON.stringify(tags),
        params.timestamp || now,
        now,
        now
      );

      // FTS5 update
      try {
        db.prepare(
          `
          INSERT INTO entities_fts (rowid, name, type, tags_text, properties_text)
          SELECT rowid, name, type, tags_json, properties_json FROM entities WHERE id = ?
        `
        ).run(id);
      } catch {}

      logEntityEvent(db, {
        project: params.project,
        entity_id: id,
        action: 'created',
        position: params.position,
        confidence,
        source: params.source || 'manual',
        visual_state_id: params.visual_state_id,
        task_id: params.task_id,
        details: { name: params.name, type: params.type },
      });
    })();

    return EntityStore.getEntity(db, { project: params.project, id })!;
  }

  static getEntity(db: Database.Database, params: { project: string; id: string }): Entity | null {
    const row = db
      .prepare('SELECT * FROM entities WHERE project = ? AND id = ?')
      .get(params.project, params.id) as EntityRow | undefined;
    return row ? parseEntityRow(row) : null;
  }

  static updateEntity(
    db: Database.Database,
    params: {
      project: string;
      id: string;
      name?: string;
      type?: EntityType;
      status?: EntityStatus;
      position?: Vector3D;
      orientation?: Orientation3D;
      bounding_box?: BoundingBoxSize;
      confidence?: number;
      parent_id?: string;
      region_id?: string;
      properties?: Record<string, any>;
      tags?: string[];
      source?: string;
      visual_state_id?: string;
      task_id?: string;
      expected_version?: number;
      timestamp?: string;
    }
  ): Entity {
    const current = EntityStore.getEntity(db, { project: params.project, id: params.id });
    if (!current) {
      throw new ValidationError(`Entity "${params.id}" not found in project "${params.project}".`);
    }

    if (params.expected_version !== undefined && current.version !== params.expected_version) {
      throw new ValidationError(
        `Optimistic concurrency failure: entity "${params.id}" is version ${current.version}, expected ${params.expected_version}.`
      );
    }

    const now = getCurrentIsoString();
    const updatedPos = params.position !== undefined ? params.position : current.position;
    const updatedOrient =
      params.orientation !== undefined ? params.orientation : current.orientation;
    const updatedBbox =
      params.bounding_box !== undefined ? params.bounding_box : current.bounding_box;
    const updatedConfidence =
      params.confidence !== undefined
        ? Math.max(0, Math.min(1, params.confidence))
        : current.confidence;
    const updatedProperties =
      params.properties !== undefined
        ? sanitizeKeys({ ...current.properties, ...params.properties })
        : current.properties;
    const updatedTags = params.tags !== undefined ? params.tags : current.tags;

    let action: any = 'updated';
    if (
      params.position &&
      (!current.position || vec3Distance(current.position, params.position) > 0.001)
    ) {
      action = 'moved';
    } else if (params.status && params.status !== current.status) {
      action = 'status_changed';
    }

    db.transaction(() => {
      db.prepare(
        `
        UPDATE entities SET
          name = ?,
          type = ?,
          status = ?,
          x = ?,
          y = ?,
          z = ?,
          pitch = ?,
          yaw = ?,
          roll = ?,
          bbox_width = ?,
          bbox_height = ?,
          bbox_depth = ?,
          confidence = ?,
          parent_id = ?,
          region_id = ?,
          properties_json = ?,
          tags_json = ?,
          last_seen_at = ?,
          updated_at = ?,
          version = version + 1
        WHERE project = ? AND id = ?
      `
      ).run(
        params.name || current.name,
        params.type || current.type,
        params.status || current.status,
        updatedPos?.x ?? null,
        updatedPos?.y ?? null,
        updatedPos?.z ?? null,
        updatedOrient?.pitch ?? null,
        updatedOrient?.yaw ?? null,
        updatedOrient?.roll ?? null,
        updatedBbox?.width ?? null,
        updatedBbox?.height ?? null,
        updatedBbox?.depth ?? null,
        updatedConfidence,
        params.parent_id !== undefined ? params.parent_id : (current.parent_id ?? null),
        params.region_id !== undefined ? params.region_id : (current.region_id ?? null),
        JSON.stringify(updatedProperties),
        JSON.stringify(updatedTags),
        now,
        now,
        params.project,
        params.id
      );

      // FTS5 update
      try {
        db.prepare(
          'DELETE FROM entities_fts WHERE rowid = (SELECT rowid FROM entities WHERE id = ?)'
        ).run(params.id);
        db.prepare(
          `
          INSERT INTO entities_fts (rowid, name, type, tags_text, properties_text)
          SELECT rowid, name, type, tags_json, properties_json FROM entities WHERE id = ?
        `
        ).run(params.id);
      } catch {}

      logEntityEvent(db, {
        project: params.project,
        entity_id: params.id,
        action,
        position: updatedPos,
        confidence: updatedConfidence,
        source: params.source || 'manual',
        visual_state_id: params.visual_state_id,
        task_id: params.task_id,
        details: { action },
      });
    })();

    return EntityStore.getEntity(db, { project: params.project, id: params.id })!;
  }

  static removeEntity(
    db: Database.Database,
    params: { project: string; id: string; hard_delete?: boolean; source?: string }
  ): boolean {
    const current = EntityStore.getEntity(db, { project: params.project, id: params.id });
    if (!current) return false;

    db.transaction(() => {
      if (params.hard_delete) {
        db.prepare('DELETE FROM entities WHERE project = ? AND id = ?').run(
          params.project,
          params.id
        );
        try {
          db.prepare(
            'DELETE FROM entities_fts WHERE rowid = (SELECT rowid FROM entities WHERE id = ?)'
          ).run(params.id);
        } catch {}
      } else {
        db.prepare(
          `
          UPDATE entities SET status = 'destroyed', updated_at = ? WHERE project = ? AND id = ?
        `
        ).run(getCurrentIsoString(), params.project, params.id);
      }

      logEntityEvent(db, {
        project: params.project,
        entity_id: params.id,
        action: 'destroyed',
        source: params.source || 'manual',
      });
    })();

    return true;
  }

  static listEntities(
    db: Database.Database,
    params: {
      project: string;
      type?: string;
      status?: string;
      region_id?: string;
      parent_id?: string;
      min_confidence?: number;
      limit?: number;
      offset?: number;
    }
  ): Entity[] {
    const conditions: string[] = ['project = ?'];
    const args: any[] = [params.project];

    if (params.type) {
      conditions.push('type = ?');
      args.push(params.type);
    }
    if (params.status) {
      conditions.push('status = ?');
      args.push(params.status);
    } else {
      // Default: exclude destroyed unless specified
      conditions.push("status != 'destroyed'");
    }
    if (params.region_id) {
      conditions.push('region_id = ?');
      args.push(params.region_id);
    }
    if (params.parent_id) {
      conditions.push('parent_id = ?');
      args.push(params.parent_id);
    }
    if (params.min_confidence !== undefined) {
      conditions.push('confidence >= ?');
      args.push(params.min_confidence);
    }

    const limit = params.limit || 50;
    const offset = params.offset || 0;
    args.push(limit, offset);

    const query = `
      SELECT * FROM entities
      WHERE ${conditions.join(' AND ')}
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `;

    const rows = db.prepare(query).all(...args) as EntityRow[];
    return rows.map(parseEntityRow);
  }

  static queryEntities(
    db: Database.Database,
    params: {
      project: string;
      query?: string;
      type?: string;
      status?: string;
      near_position?: Vector3D;
      max_distance?: number;
      region_id?: string;
      tags?: string[];
      min_confidence?: number;
      limit?: number;
    }
  ): Array<Entity & { distance?: number }> {
    let entities: Entity[] = [];

    // FTS query if text query is supplied
    if (params.query && params.query.trim().length > 0) {
      try {
        const ftsRows = db
          .prepare(
            `
            SELECT e.* FROM entities e
            JOIN entities_fts f ON e.rowid = f.rowid
            WHERE e.project = ? AND entities_fts MATCH ?
          `
          )
          .all(params.project, params.query) as EntityRow[];
        entities = ftsRows.map(parseEntityRow);
      } catch {
        // Fallback to LIKE search
        const likePattern = `%${params.query}%`;
        const rows = db
          .prepare(
            `
            SELECT * FROM entities
            WHERE project = ? AND (name LIKE ? OR properties_json LIKE ? OR tags_json LIKE ?)
          `
          )
          .all(params.project, likePattern, likePattern, likePattern) as EntityRow[];
        entities = rows.map(parseEntityRow);
      }
    } else {
      entities = EntityStore.listEntities(db, {
        project: params.project,
        type: params.type,
        status: params.status,
        region_id: params.region_id,
        min_confidence: params.min_confidence,
        limit: params.limit || 100,
      });
    }

    // Apply in-memory filters
    let results: Array<Entity & { distance?: number }> = entities;

    if (params.type) {
      results = results.filter((e) => e.type === params.type);
    }
    if (params.status) {
      results = results.filter((e) => e.status === params.status);
    }
    if (params.tags && params.tags.length > 0) {
      results = results.filter((e) => params.tags!.some((t) => e.tags.includes(t)));
    }
    if (params.min_confidence !== undefined) {
      results = results.filter((e) => e.confidence >= params.min_confidence!);
    }

    // Calculate proximity distance if near_position is provided
    if (params.near_position) {
      results = results
        .map((e) => {
          if (!e.position) return { ...e, distance: undefined };
          const dist = vec3Distance(params.near_position!, e.position);
          return { ...e, distance: dist };
        })
        .filter((e) => {
          if (params.max_distance !== undefined) {
            return e.distance !== undefined && e.distance <= params.max_distance;
          }
          return true;
        })
        .sort((a, b) => (a.distance ?? 999999) - (b.distance ?? 999999));
    }

    const limit = params.limit || 50;
    return results.slice(0, limit);
  }
}
