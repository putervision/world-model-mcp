import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/engine/migrations.js';
import { SpatialBlackboard } from '../../src/engine/blackboard.js';

describe('SpatialBlackboard (Multi-Agent Coordination)', () => {
  let db: Database.Database;
  const project = 'test-blackboard';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  it('should post and read topic messages with collision alerts', () => {
    // Agent 1 posts movement intention
    const res1 = SpatialBlackboard.post(db, {
      project,
      topic: 'navigation:intentions',
      sender: 'agent_alpha',
      payload: { position: { x: 5, y: 0, z: 5 } },
      ttl_seconds: 60,
    });
    expect(res1.item.id).toBeDefined();

    // Agent 2 posts proximate movement intention -> triggers collision alert
    const res2 = SpatialBlackboard.post(db, {
      project,
      topic: 'navigation:intentions',
      sender: 'agent_beta',
      payload: { position: { x: 5.5, y: 0, z: 5.2 } },
    });
    expect(res2.collision_warnings).toBeDefined();
    expect(res2.collision_warnings?.length).toBe(1);

    const items = SpatialBlackboard.read(db, { project, topic: 'navigation:intentions' });
    expect(items.length).toBe(2);
  });

  it('should claim and release spatial resources exclusively', () => {
    const claim1 = SpatialBlackboard.claim(db, {
      project,
      resource_id: 'dock_01',
      agent_id: 'agent_alpha',
      duration_seconds: 60,
    });
    expect(claim1.success).toBe(true);

    // Agent 2 attempts to claim same resource
    const claim2 = SpatialBlackboard.claim(db, {
      project,
      resource_id: 'dock_01',
      agent_id: 'agent_beta',
    });
    expect(claim2.success).toBe(false);

    // Agent 1 releases resource
    const release = SpatialBlackboard.release(db, {
      project,
      resource_id: 'dock_01',
      agent_id: 'agent_alpha',
    });
    expect(release.success).toBe(true);

    // Agent 2 can now claim
    const claim3 = SpatialBlackboard.claim(db, {
      project,
      resource_id: 'dock_01',
      agent_id: 'agent_beta',
    });
    expect(claim3.success).toBe(true);
  });

  it('should support canonical verbs: set, get, delete, lease, list', () => {
    // 1. set & get
    const setRes = SpatialBlackboard.set(db, {
      project,
      topic: 'pentad:spatial_intent',
      sender: 'agent_gamma',
      payload: { position: { x: 10, y: 0, z: 10 } },
    });
    expect(setRes.item.id).toBeDefined();

    const getById = SpatialBlackboard.get(db, { project, id: setRes.item.id });
    expect(getById).toBeDefined();
    expect((getById as any).topic).toBe('pentad:spatial_intent');

    const getByTopic = SpatialBlackboard.get(db, { project, topic: 'pentad:spatial_intent' });
    expect(Array.isArray(getByTopic)).toBe(true);
    expect((getByTopic as any[]).length).toBe(1);

    // 2. list
    SpatialBlackboard.set(db, {
      project,
      topic: 'pentad:waypoints',
      sender: 'agent_delta',
      payload: { waypoints: [] },
    });
    const listRes = SpatialBlackboard.list(db, { project });
    expect(listRes.topics).toContain('pentad:spatial_intent');
    expect(listRes.topics).toContain('pentad:waypoints');
    expect(listRes.count).toBe(2);

    // 3. lease
    const leaseRes1 = SpatialBlackboard.lease(db, {
      project,
      resource_id: 'airlock_01',
      agent_id: 'agent_gamma',
      duration_seconds: 45,
      mode: 'acquire',
    });
    expect(leaseRes1.success).toBe(true);

    const leaseResConflict = SpatialBlackboard.lease(db, {
      project,
      resource_id: 'airlock_01',
      agent_id: 'agent_delta',
      duration_seconds: 45,
      mode: 'acquire',
    });
    expect(leaseResConflict.success).toBe(false);

    const leaseResRelease = SpatialBlackboard.lease(db, {
      project,
      resource_id: 'airlock_01',
      agent_id: 'agent_gamma',
      mode: 'release',
    });
    expect(leaseResRelease.success).toBe(true);

    // 4. delete
    const delRes = SpatialBlackboard.delete(db, { project, id: setRes.item.id });
    expect(delRes.success).toBe(true);
    expect(delRes.deleted_count).toBe(1);
    expect(SpatialBlackboard.get(db, { project, id: setRes.item.id })).toBeNull();
  });
});
