import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { Entity, EntityRow, EntityType, EntityStatus, SpatialSlice, SpatialPredicatePack } from '../schema/types.js';
import { parseEntityRow } from './row-mappers.js';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';
import { Vector3D, Orientation3D, BoundingBoxSize, vec3Distance } from '../utils/math.js';
import { logEntityEvent } from './events.js';
import { ValidationError } from '../utils/errors.js';
import { sanitizeKeys } from '../utils/sanitize.js';
import { canonicalJsonStringify } from '../utils/canonical-json.js';

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
      velocity?: Vector3D;
      affordance_mask?: number;
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
    const affordance_mask = params.affordance_mask ?? 0;

    const stmt = db.prepare(`
      INSERT INTO entities (
        id, project, name, type, status, x, y, z, vx, vy, vz, affordance_mask, pitch, yaw, roll,
        bbox_width, bbox_height, bbox_depth, confidence, parent_id, region_id,
        properties_json, tags_json, last_seen_at, created_at, updated_at, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        status = excluded.status,
        x = excluded.x,
        y = excluded.y,
        z = excluded.z,
        vx = excluded.vx,
        vy = excluded.vy,
        vz = excluded.vz,
        affordance_mask = excluded.affordance_mask,
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
        params.velocity?.x ?? null,
        params.velocity?.y ?? null,
        params.velocity?.z ?? null,
        affordance_mask,
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
      velocity?: Vector3D;
      affordance_mask?: number;
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
    const updatedVel = params.velocity !== undefined ? params.velocity : current.velocity;
    const updatedAffordance =
      params.affordance_mask !== undefined ? params.affordance_mask : (current.affordance_mask ?? 0);
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
          vx = ?,
          vy = ?,
          vz = ?,
          affordance_mask = ?,
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
        updatedVel?.x ?? null,
        updatedVel?.y ?? null,
        updatedVel?.z ?? null,
        updatedAffordance,
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

  static getNearestEntities(
    db: Database.Database,
    params: {
      project: string;
      observer?:
        | {
            x?: number;
            y?: number;
            z?: number;
            heading?: number;
            position?: Vector3D | [number, number, number];
          }
        | [number, number, number]
        | Vector3D;
      k?: number;
    }
  ): SpatialSlice {
    const allEntities = EntityStore.listEntities(db, {
      project: params.project,
      status: 'active',
      limit: 10000,
    });

    let x0 = 0;
    let y0 = 0;
    let z0 = 0;
    let heading = 0;
    let hasObserver = false;

    if (Array.isArray(params.observer)) {
      x0 = params.observer[0] ?? 0;
      y0 = params.observer[1] ?? 0;
      z0 = params.observer[2] ?? 0;
      hasObserver = true;
    } else if (params.observer && typeof params.observer === 'object') {
      const obs = params.observer as any;
      if (Array.isArray(obs.position)) {
        x0 = obs.position[0] ?? 0;
        y0 = obs.position[1] ?? 0;
        z0 = obs.position[2] ?? 0;
        hasObserver = true;
      } else if (obs.position && typeof obs.position === 'object') {
        x0 = obs.position.x ?? 0;
        y0 = obs.position.y ?? 0;
        z0 = obs.position.z ?? 0;
        hasObserver = true;
      } else if (
        typeof obs.x === 'number' ||
        typeof obs.y === 'number' ||
        typeof obs.z === 'number'
      ) {
        x0 = obs.x ?? 0;
        y0 = obs.y ?? 0;
        z0 = obs.z ?? 0;
        hasObserver = true;
      }
      if (typeof obs.heading === 'number') {
        heading = obs.heading;
      }
    }

    if (!hasObserver) {
      // Find observer entity (agent, camera, player)
      const observerEntity = allEntities.find(
        (e) =>
          e.position &&
          ((e.type as string) === 'agent' ||
            (e.type as string) === 'camera' ||
            e.type === 'npc' ||
            e.name.toLowerCase() === 'agent' ||
            e.tags?.includes('observer'))
      );
      if (observerEntity && observerEntity.position) {
        x0 = observerEntity.position.x;
        y0 = observerEntity.position.y;
        z0 = observerEntity.position.z;
        if (observerEntity.orientation?.yaw !== undefined) {
          heading = observerEntity.orientation.yaw;
        }
        hasObserver = true;
      }
    }

    const maxK = Math.min(16, Math.max(1, params.k ?? 16));
    const positionedEntities = allEntities.filter((e) => e.position);

    const calculated = positionedEntities.map((e) => {
      const pos = e.position!;
      const dx = pos.x - x0;
      const dy = pos.y - y0;
      const dz = pos.z - z0;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      let bearing = Math.atan2(dy, dx) * (180 / Math.PI) - heading;
      while (bearing > 180) bearing -= 360;
      while (bearing < -180) bearing += 360;
      return {
        id: e.id,
        type: e.type,
        distance: Math.round(dist * 1000) / 1000,
        bearing: Math.round(bearing * 100) / 100,
        confidence: e.confidence,
        entity: e,
      };
    });

    calculated.sort((a, b) => a.distance - b.distance);

    const visible_entities = calculated.slice(0, maxK).map((item) => ({
      id: item.id,
      type: item.type,
      distance: item.distance,
      bearing: item.bearing,
      confidence: item.confidence,
    }));

    let nearest_obstacle_distance: number | undefined = undefined;
    for (const item of calculated) {
      const e = item.entity;
      const isObstacle = Boolean(
        e.properties?.is_obstacle ||
        e.properties?.collidable ||
        e.tags?.includes('obstacle') ||
        e.tags?.includes('collidable') ||
        e.type === 'obstacle'
      );
      if (isObstacle) {
        if (nearest_obstacle_distance === undefined || item.distance < nearest_obstacle_distance) {
          nearest_obstacle_distance = item.distance;
        }
      }
    }

    const sortedSummary = allEntities
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((e) => ({ id: e.id, v: e.version }));

    const spatial_hash = crypto
      .createHash('sha256')
      .update(canonicalJsonStringify(sortedSummary))
      .digest('hex');

    const nearestObstacleDist = nearest_obstacle_distance !== undefined ? nearest_obstacle_distance : 999.0;
    const collisionImminent = nearest_obstacle_distance !== undefined && nearest_obstacle_distance < 1.0;

    let occlusionFlag = false;
    if (visible_entities.length > 0 && nearest_obstacle_distance !== undefined) {
      if (nearest_obstacle_distance < visible_entities[0].distance) {
        occlusionFlag = true;
      }
    }

    let clearanceToLinkedGoal: number | null = null;
    try {
      const goalLink = db
        .prepare('SELECT * FROM goal_links WHERE project = ? ORDER BY created_at DESC LIMIT 1')
        .get(params.project) as any;
      if (goalLink) {
        const targetId = goalLink.target_entity_id || goalLink.entity_id;
        if (targetId) {
          const targetEntity = allEntities.find((e) => e.id === targetId);
          if (targetEntity && targetEntity.position && hasObserver) {
            const dx = targetEntity.position.x - x0;
            const dy = targetEntity.position.y - y0;
            const dz = targetEntity.position.z - z0;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            clearanceToLinkedGoal = Math.round(dist * 1000) / 1000;
          }
        }
      }
    } catch {}

    let spooledOutcomesCount = 0;
    try {
      const row = db
        .prepare('SELECT COUNT(*) as c FROM spooled_outcomes WHERE project = ?')
        .get(params.project) as { c: number } | undefined;
      if (row) spooledOutcomesCount = row.c;
    } catch {}

    const predicates: SpatialPredicatePack = {
      relative_bearing: visible_entities[0]?.bearing ?? 0,
      occlusion_flag: occlusionFlag,
      nearest_obstacle_distance: nearestObstacleDist,
      collision_imminent: collisionImminent,
      clearance_to_linked_goal: clearanceToLinkedGoal,
      feature_density: positionedEntities.length,
      spooled_outcomes_count: spooledOutcomesCount,
    };

    const result: SpatialSlice = {
      observer_position: hasObserver ? [x0, y0, z0] : undefined,
      visible_entities,
      nearest_obstacle_distance,
      spatial_hash,
      predicates,
    };

    return result;
  }

  static getCompactSlice(
    db: Database.Database,
    params: {
      project: string;
      observer?:
        | {
            x?: number;
            y?: number;
            z?: number;
            heading?: number;
            position?: Vector3D | [number, number, number];
          }
        | [number, number, number]
        | Vector3D;
      k?: number;
    }
  ): SpatialSlice {
    return EntityStore.getNearestEntities(db, params);
  }
}
