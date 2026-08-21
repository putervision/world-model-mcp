import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/engine/migrations.js';
import { FrustumEngine } from '../../src/engine/frustum.js';
import { EntityStore } from '../../src/engine/entity-store.js';

describe('FrustumEngine with Ray-AABB Occlusion Culling', () => {
  let db: Database.Database;
  const project = 'test-occlusion';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  it('should detect when an entity is occluded by a closer obstacle box', () => {
    // Observer at (0, 0, 0) facing +Z (yaw: 0)
    // Wall at (0, 0, 5) with width 4, height 4, depth 1
    const wall = EntityStore.addEntity(db, {
      project,
      name: 'Concrete Wall',
      type: 'obstacle',
      position: { x: 0, y: 0, z: 5 },
      bounding_box: { width: 4, height: 4, depth: 1 },
    });

    // Target chest directly behind wall at (0, 0, 10)
    const chest = EntityStore.addEntity(db, {
      project,
      name: 'Hidden Chest',
      type: 'container',
      position: { x: 0, y: 0, z: 10 },
      bounding_box: { width: 1, height: 1, depth: 1 },
    });

    // Unoccluded target to the side at (8, 0, 10)
    const sideTarget = EntityStore.addEntity(db, {
      project,
      name: 'Side Target',
      type: 'landmark',
      position: { x: 8, y: 0, z: 10 },
      bounding_box: { width: 1, height: 1, depth: 1 },
    });

    const view = FrustumEngine.getExpectedView(db, {
      project,
      observer_position: { x: 0, y: 0, z: 0 },
      observer_orientation: { yaw: 0 },
      fov_degrees: 90,
      max_distance: 50,
      enable_occlusion: true,
    });

    expect(view.visible_entities.length).toBe(3);
    const chestVis = view.visible_entities.find((e) => e.entity.id === chest.id);
    expect(chestVis?.is_occluded).toBe(true);
    expect(chestVis?.occluded_by_id).toBe(wall.id);

    const sideVis = view.visible_entities.find((e) => e.entity.id === sideTarget.id);
    expect(sideVis?.is_occluded).toBe(false);

    expect(view.occluded_entities.length).toBe(1);
    expect(view.occluded_entities[0].entity.id).toBe(chest.id);
  });
});
