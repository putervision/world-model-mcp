import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/engine/migrations.js';
import { EntityStore } from '../../src/engine/entity-store.js';
import { canonicalJsonStringify } from '../../src/utils/canonical-json.js';

describe('World-Model Compact Spatial Slice Contract', () => {
  let db: Database.Database;
  const project = 'compact_spatial_test';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);

    // Seed 20 entities at various distances
    for (let i = 1; i <= 20; i++) {
      EntityStore.addEntity(db, {
        project,
        name: `Entity ${i}`,
        type: i % 3 === 0 ? 'obstacle' : 'waypoint',
        position: { x: i * 2, y: 0, z: 0 }, // distances: 2, 4, 6, 8, ...
        confidence: 0.9,
        properties: i % 3 === 0 ? { is_obstacle: true } : {},
      });
    }
  });

  afterEach(() => {
    db.close();
  });

  it('computes focal SpatialSlice with K <= 16 nearest entities sorted by distance', () => {
    const slice = EntityStore.getNearestEntities(db, {
      project,
      observer: [0, 0, 0],
      k: 16,
    });

    expect(slice).toBeDefined();
    expect(slice.observer_position).toEqual([0, 0, 0]);
    expect(slice.visible_entities).toBeDefined();
    // Cap at 16
    expect(slice.visible_entities.length).toBe(16);

    // Sorted ascending by distance
    for (let i = 0; i < slice.visible_entities.length - 1; i++) {
      expect(slice.visible_entities[i].distance).toBeLessThanOrEqual(
        slice.visible_entities[i + 1].distance
      );
    }

    // Nearest entity should be at distance 2
    expect(slice.visible_entities[0].id).toBeDefined();
    expect(slice.visible_entities[0].distance).toBe(2);

    // Bearing normalized to [-180, 180]
    for (const e of slice.visible_entities) {
      expect(e.bearing).toBeGreaterThanOrEqual(-180);
      expect(e.bearing).toBeLessThanOrEqual(180);
    }

    // Nearest obstacle should be at distance 6
    expect(slice.nearest_obstacle_distance).toBe(6);

    // Spatial hash must be 64-char hex SHA-256
    expect(slice.spatial_hash).toBeDefined();
    expect(slice.spatial_hash).toMatch(/^[a-f0-9]{64}$/);

    // Budget: SpatialSlice JSON string representation must be <2KB
    const serialized = canonicalJsonStringify(slice);
    expect(Buffer.byteLength(serialized, 'utf8')).toBeLessThan(2048);
  });

  it('respects custom K parameter when K < 16', () => {
    const slice = EntityStore.getNearestEntities(db, {
      project,
      observer: [0, 0, 0],
      k: 4,
    });

    expect(slice.visible_entities.length).toBe(4);
    expect(slice.visible_entities[3].distance).toBe(8);
  });
});
