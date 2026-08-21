import Database from 'better-sqlite3';
import { BlackboardItem, BlackboardItemRow } from '../schema/types.js';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';
import { safeJsonParse } from '../utils/json-validator.js';
import { vec3Distance, Vector3D } from '../utils/math.js';

export class SpatialBlackboard {
  static post(
    db: Database.Database,
    params: {
      project: string;
      topic: string;
      sender: string;
      payload: Record<string, any>;
      ttl_seconds?: number;
    }
  ): { item: BlackboardItem; collision_warnings?: string[] } {
    const id = generateId();
    const now = getCurrentIsoString();
    let expiresAt: string | undefined;

    if (params.ttl_seconds && params.ttl_seconds > 0) {
      expiresAt = new Date(Date.now() + params.ttl_seconds * 1000).toISOString();
    }

    // Collision intent check if spatial coordinates are present in payload
    const collisionWarnings: string[] = [];
    const targetPos = (params.payload.position ||
      params.payload.destination ||
      params.payload.target_coords) as Vector3D | undefined;

    if (targetPos && typeof targetPos.x === 'number') {
      const activeItems = this.read(db, { project: params.project, include_expired: false });
      for (const item of activeItems) {
        if (item.sender !== params.sender) {
          const otherPos = (item.payload.position ||
            item.payload.destination ||
            item.payload.target_coords) as Vector3D | undefined;
          if (otherPos && typeof otherPos.x === 'number') {
            const dist = vec3Distance(targetPos, otherPos);
            if (dist < 2.0) {
              collisionWarnings.push(
                `Spatial intent proximity alert: Agent "${params.sender}" target is ${dist.toFixed(
                  2
                )}m from Agent "${item.sender}" target on topic "${item.topic}".`
              );
            }
          }
        }
      }
    }

    db.prepare(
      `
      INSERT INTO blackboard_items (
        id, project, topic, sender, payload_json, claimed_by, claimed_until, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      params.project,
      params.topic,
      params.sender,
      JSON.stringify(params.payload),
      null,
      null,
      expiresAt || null,
      now
    );

    const item: BlackboardItem = {
      id,
      project: params.project,
      topic: params.topic,
      sender: params.sender,
      payload: params.payload,
      expires_at: expiresAt,
      created_at: now,
    };

    return {
      item,
      collision_warnings: collisionWarnings.length > 0 ? collisionWarnings : undefined,
    };
  }

  static read(
    db: Database.Database,
    params: {
      project: string;
      topic?: string;
      include_expired?: boolean;
      limit?: number;
    }
  ): BlackboardItem[] {
    const now = getCurrentIsoString();
    let query = 'SELECT * FROM blackboard_items WHERE project = ?';
    const queryParams: any[] = [params.project];

    if (params.topic) {
      query += ' AND topic = ?';
      queryParams.push(params.topic);
    }

    if (!params.include_expired) {
      query += ' AND (expires_at IS NULL OR expires_at > ?)';
      queryParams.push(now);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    queryParams.push(params.limit || 50);

    const rows = db.prepare(query).all(...queryParams) as BlackboardItemRow[];

    return rows.map((r) => ({
      id: r.id,
      project: r.project,
      topic: r.topic,
      sender: r.sender,
      payload: safeJsonParse(r.payload_json || '{}', {}),
      claimed_by: r.claimed_by || undefined,
      claimed_until: r.claimed_until || undefined,
      expires_at: r.expires_at || undefined,
      created_at: r.created_at,
    }));
  }

  static claim(
    db: Database.Database,
    params: {
      project: string;
      resource_id: string;
      agent_id: string;
      duration_seconds?: number;
    }
  ): { success: boolean; message: string; expires_at?: string } {
    const topic = `claim:${params.resource_id}`;
    const now = getCurrentIsoString();
    const duration = params.duration_seconds || 60;
    const expiresAt = new Date(Date.now() + duration * 1000).toISOString();

    const existingClaim = db
      .prepare('SELECT * FROM blackboard_items WHERE project = ? AND topic = ? AND expires_at > ?')
      .get(params.project, topic, now) as BlackboardItemRow | undefined;

    if (existingClaim && existingClaim.claimed_by && existingClaim.claimed_by !== params.agent_id) {
      return {
        success: false,
        message: `Resource "${params.resource_id}" is currently claimed by agent "${existingClaim.claimed_by}" until ${existingClaim.expires_at}.`,
        expires_at: existingClaim.expires_at || undefined,
      };
    }

    // Clean previous claim for this resource
    db.prepare('DELETE FROM blackboard_items WHERE project = ? AND topic = ?').run(
      params.project,
      topic
    );

    const id = generateId();
    db.prepare(
      `
      INSERT INTO blackboard_items (
        id, project, topic, sender, payload_json, claimed_by, claimed_until, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      params.project,
      topic,
      params.agent_id,
      JSON.stringify({ resource_id: params.resource_id, status: 'claimed' }),
      params.agent_id,
      expiresAt,
      expiresAt,
      now
    );

    return {
      success: true,
      message: `Resource "${params.resource_id}" successfully claimed by agent "${params.agent_id}" for ${duration}s.`,
      expires_at: expiresAt,
    };
  }

  static release(
    db: Database.Database,
    params: {
      project: string;
      resource_id: string;
      agent_id: string;
    }
  ): { success: boolean; message: string } {
    const topic = `claim:${params.resource_id}`;
    const res = db
      .prepare('DELETE FROM blackboard_items WHERE project = ? AND topic = ? AND claimed_by = ?')
      .run(params.project, topic, params.agent_id);

    if (res.changes > 0) {
      return {
        success: true,
        message: `Resource "${params.resource_id}" released by agent "${params.agent_id}".`,
      };
    }
    return {
      success: false,
      message: `No active claim found on resource "${params.resource_id}" by agent "${params.agent_id}".`,
    };
  }

  static pruneExpired(db: Database.Database, params: { project: string }): number {
    const now = getCurrentIsoString();
    const res = db
      .prepare(
        'DELETE FROM blackboard_items WHERE project = ? AND expires_at IS NOT NULL AND expires_at <= ?'
      )
      .run(params.project, now);
    return res.changes;
  }
}
