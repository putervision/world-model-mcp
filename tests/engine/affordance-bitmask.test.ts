import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/engine/migrations.js';
import { EntityStore } from '../../src/engine/entity-store.js';
import { AffordanceBitmask } from '../../src/schema/types.js';

describe('Affordance Bitmasks and Physical Properties', () => {
  let db: Database.Database;
  const project = 'test_affordance';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('verifies AffordanceBitmask numeric values', () => {
    expect(AffordanceBitmask.TRAVERSABLE).toBe(1);
    expect(AffordanceBitmask.OCCLUDER).toBe(2);
    expect(AffordanceBitmask.CONTAINER).toBe(4);
    expect(AffordanceBitmask.INTERACTABLE).toBe(8);
    expect(AffordanceBitmask.THREAT).toBe(16);
  });

  it('stores and retrieves entity with compound affordance_mask and velocity in SQLite', () => {
    const mask = AffordanceBitmask.INTERACTABLE | AffordanceBitmask.CONTAINER; // 8 | 4 = 12

    const created = EntityStore.addEntity(db, {
      project,
      name: 'Treasure Chest',
      type: 'container',
      status: 'active',
      position: { x: 1, y: 2, z: 3 },
      velocity: { x: 0.1, y: 0.2, z: 0.3 },
      affordance_mask: mask,
    });

    expect(created.affordance_mask).toBe(12);
    expect(created.velocity).toEqual({ x: 0.1, y: 0.2, z: 0.3 });

    // Verify bitwise checks
    expect((created.affordance_mask! & AffordanceBitmask.CONTAINER) !== 0).toBe(true);
    expect((created.affordance_mask! & AffordanceBitmask.INTERACTABLE) !== 0).toBe(true);
    expect((created.affordance_mask! & AffordanceBitmask.THREAT) !== 0).toBe(false);

    // Retrieve fresh from database
    const fetched = EntityStore.getEntity(db, { project, id: created.id });
    expect(fetched).not.toBeNull();
    expect(fetched!.affordance_mask).toBe(12);
    expect(fetched!.velocity).toEqual({ x: 0.1, y: 0.2, z: 0.3 });
  });

  it('updates affordance_mask and velocity on existing entity', () => {
    const entity = EntityStore.addEntity(db, {
      project,
      name: 'Neutral NPC',
      type: 'npc',
      status: 'active',
      position: { x: 0, y: 0, z: 0 },
      affordance_mask: AffordanceBitmask.INTERACTABLE,
    });

    expect(entity.affordance_mask).toBe(AffordanceBitmask.INTERACTABLE);

    // NPC turns hostile (adds THREAT bit) and begins running
    const updated = EntityStore.updateEntity(db, {
      project,
      id: entity.id,
      affordance_mask: AffordanceBitmask.INTERACTABLE | AffordanceBitmask.THREAT,
      velocity: { x: 3, y: 0, z: 0 },
    });

    expect(updated.affordance_mask).toBe(24); // 8 + 16
    expect(updated.velocity).toEqual({ x: 3, y: 0, z: 0 });
    expect((updated.affordance_mask! & AffordanceBitmask.THREAT) !== 0).toBe(true);
  });
});
