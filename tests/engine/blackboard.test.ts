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
});
