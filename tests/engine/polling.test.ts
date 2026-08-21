import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/engine/migrations.js';
import { waitForSpatialState } from '../../src/engine/polling.js';
import { EntityStore } from '../../src/engine/entity-store.js';

describe('waitForSpatialState (Async Polling)', () => {
  let db: Database.Database;
  const project = 'test-polling';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  it('should resolve immediately when entity exists and condition is met', async () => {
    const ent = EntityStore.addEntity(db, {
      project,
      name: 'Target Bot',
      type: 'agent',
      status: 'active',
      confidence: 0.95,
      position: { x: 2, y: 1, z: 2 },
    });

    // Create Region
    db.prepare(
      `
      INSERT INTO regions (id, project, name, min_x, min_y, min_z, max_x, max_y, max_z, created_at)
      VALUES ('reg_room', 'test-polling', 'Room', 0, 0, 0, 10, 10, 10, datetime('now'))
    `
    ).run();

    // 1. Condition: exists
    const resExists = await waitForSpatialState(db, {
      project,
      entity_id: ent.id,
      condition: 'exists',
      timeout_ms: 500,
    });
    expect(resExists.satisfied).toBe(true);

    // 2. Condition: active
    const resActive = await waitForSpatialState(db, {
      project,
      entity_id: ent.id,
      condition: 'active',
      timeout_ms: 500,
    });
    expect(resActive.satisfied).toBe(true);

    // 3. Condition: confidence_above
    const resConf = await waitForSpatialState(db, {
      project,
      entity_id: ent.id,
      condition: 'confidence_above',
      threshold: 0.9,
      timeout_ms: 500,
    });
    expect(resConf.satisfied).toBe(true);

    // 4. Condition: in_region
    const resRegion = await waitForSpatialState(db, {
      project,
      entity_id: ent.id,
      condition: 'in_region',
      region_id: 'reg_room',
      timeout_ms: 500,
    });
    expect(resRegion.satisfied).toBe(true);
  });

  it('should timeout gracefully when condition is not satisfied', async () => {
    const res = await waitForSpatialState(db, {
      project,
      entity_id: 'nonexistent_entity',
      condition: 'exists',
      timeout_ms: 200,
      poll_interval_ms: 50,
    });

    expect(res.satisfied).toBe(false);
    expect(res.message).toContain('Timed out waiting');
  });
});
