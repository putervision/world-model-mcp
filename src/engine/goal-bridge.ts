import Database from 'better-sqlite3';
import { GoalLink, GoalRelationshipType, Entity } from '../schema/types.js';
import { EntityStore } from './entity-store.js';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';
import { Vector3D } from '../utils/math.js';

export class GoalBridge {
  static linkToGoal(
    db: Database.Database,
    params: {
      project: string;
      task_id: string;
      entity_id?: string;
      region_id?: string;
      relationship: GoalRelationshipType;
      notes?: string;
    }
  ): GoalLink {
    const id = generateId();
    const now = getCurrentIsoString();

    db.prepare(
      `
      INSERT INTO goal_links (id, project, task_id, entity_id, region_id, relationship, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      params.project,
      params.task_id,
      params.entity_id ?? null,
      params.region_id ?? null,
      params.relationship,
      params.notes ?? null,
      now
    );

    return {
      id,
      project: params.project,
      task_id: params.task_id,
      entity_id: params.entity_id,
      region_id: params.region_id,
      relationship: params.relationship,
      notes: params.notes,
      created_at: now,
    };
  }

  static unlinkFromGoal(
    db: Database.Database,
    params: { project: string; task_id: string; entity_id?: string }
  ): boolean {
    if (params.entity_id) {
      db.prepare('DELETE FROM goal_links WHERE project = ? AND task_id = ? AND entity_id = ?').run(
        params.project,
        params.task_id,
        params.entity_id
      );
    } else {
      db.prepare('DELETE FROM goal_links WHERE project = ? AND task_id = ?').run(
        params.project,
        params.task_id
      );
    }
    return true;
  }

  static getLinkedGoals(
    db: Database.Database,
    params: { project: string; task_id?: string; entity_id?: string }
  ): GoalLink[] {
    let query = 'SELECT * FROM goal_links WHERE project = ?';
    const args: any[] = [params.project];

    if (params.task_id) {
      query += ' AND task_id = ?';
      args.push(params.task_id);
    }
    if (params.entity_id) {
      query += ' AND entity_id = ?';
      args.push(params.entity_id);
    }

    const rows = db.prepare(query).all(...args) as any[];
    return rows.map((r) => ({
      id: r.id,
      project: r.project,
      task_id: r.task_id,
      entity_id: r.entity_id ?? undefined,
      region_id: r.region_id ?? undefined,
      relationship: r.relationship,
      notes: r.notes ?? undefined,
      created_at: r.created_at,
    }));
  }

  /**
   * Returns contextual entities relevant to an active goal or task.
   */
  static getRelevantContext(
    db: Database.Database,
    params: {
      project: string;
      task_id?: string;
      current_agent_position?: Vector3D;
      max_entities?: number;
      radius?: number;
    }
  ): {
    goal_targets: Entity[];
    nearby_entities: Entity[];
    obstacles: Entity[];
  } {
    const goalTargets: Entity[] = [];
    const max = params.max_entities || 20;

    if (params.task_id) {
      const links = GoalBridge.getLinkedGoals(db, {
        project: params.project,
        task_id: params.task_id,
      });
      for (const link of links) {
        if (link.entity_id) {
          const ent = EntityStore.getEntity(db, { project: params.project, id: link.entity_id });
          if (ent) goalTargets.push(ent);
        }
      }
    }

    let nearby: Entity[] = [];
    let obstacles: Entity[] = [];

    if (params.current_agent_position) {
      const radius = params.radius || 30;
      const proximityList = EntityStore.queryEntities(db, {
        project: params.project,
        near_position: params.current_agent_position,
        max_distance: radius,
        limit: max,
      });

      nearby = proximityList.filter(
        (e) => !goalTargets.some((g) => g.id === e.id) && e.type !== 'obstacle'
      );
      obstacles = proximityList.filter(
        (e) => e.type === 'obstacle' || e.properties.is_solid === true
      );
    } else {
      nearby = EntityStore.listEntities(db, { project: params.project, limit: max });
    }

    return {
      goal_targets: goalTargets,
      nearby_entities: nearby.slice(0, max),
      obstacles: obstacles.slice(0, max),
    };
  }
}
