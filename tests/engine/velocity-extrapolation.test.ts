import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/engine/migrations.js';
import { PermanenceEngine } from '../../src/engine/permanence.js';
import { EntityStore } from '../../src/engine/entity-store.js';
import { FrustumEngine } from '../../src/engine/frustum.js';
import { Entity } from '../../src/schema/types.js';

describe('Velocity Extrapolation & Predictive Permanence', () => {
  let db: Database.Database;
  const project = 'test_velocity_extrap';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('extrapolates position with exponential velocity damping', () => {
    const now = new Date();
    const updated1sAgo = new Date(now.getTime() - 1000).toISOString();

    const entity: Entity = {
      id: 'ball_1',
      project,
      name: 'Moving Ball',
      type: 'object',
      status: 'active',
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 10, y: 0, z: 0 },
      confidence: 1.0,
      properties: {},
      tags: [],
      last_seen_at: updated1sAgo,
      created_at: updated1sAgo,
      updated_at: updated1sAgo,
      version: 1,
    };

    // dt = 1s, gamma = 0.1, displacement = v * dt * e^(-0.1 * 1) = 10 * 1 * 0.904837 = ~9.048
    const result = PermanenceEngine.extrapolateEntityPosition(
      entity,
      now.toISOString(),
      [],
      { damping: 0.1 }
    );

    expect(result.entity_id).toBe('ball_1');
    expect(result.elapsed_seconds).toBeCloseTo(1.0, 1);
    expect(result.clamped).toBe(false);
    expect(result.extrapolated_position.x).toBeGreaterThan(8.5);
    expect(result.extrapolated_position.x).toBeLessThan(9.5);
  });

  it('clamps extrapolation against static obstacle AABB', () => {
    const now = new Date();
    const updated1sAgo = new Date(now.getTime() - 1000).toISOString();

    const entity: Entity = {
      id: 'projectile_1',
      project,
      name: 'Projectile',
      type: 'object',
      status: 'active',
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 20, y: 0, z: 0 }, // would move to ~18 without obstacle
      confidence: 1.0,
      properties: {},
      tags: [],
      last_seen_at: updated1sAgo,
      created_at: updated1sAgo,
      updated_at: updated1sAgo,
      version: 1,
    };

    // Obstacle at x = 5, size = 2x2x2 (bounds: [4, 6])
    const obstacle: Entity = {
      id: 'wall_1',
      project,
      name: 'Concrete Wall',
      type: 'obstacle',
      status: 'active',
      position: { x: 5, y: 0, z: 0 },
      bounding_box: { width: 2, height: 2, depth: 2 },
      confidence: 1.0,
      properties: { is_solid: true },
      tags: ['obstacle'],
      last_seen_at: now.toISOString(),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      version: 1,
    };

    const result = PermanenceEngine.extrapolateEntityPosition(
      entity,
      now.toISOString(),
      [obstacle],
      { damping: 0.1, clampObstacles: true }
    );

    expect(result.clamped).toBe(true);
    // Wall min x is 4, clamped position should be clamped before x = 4.0
    expect(result.extrapolated_position.x).toBeLessThanOrEqual(4.0);
    expect(result.extrapolated_position.x).toBeGreaterThan(3.5);
  });

  it('zeros out velocity if elapsed time > 10 seconds', () => {
    const now = new Date();
    const updated15sAgo = new Date(now.getTime() - 15000).toISOString();

    const entity: Entity = {
      id: 'stale_mover',
      project,
      name: 'Stale Mover',
      type: 'object',
      status: 'active',
      position: { x: 10, y: 5, z: 2 },
      velocity: { x: 5, y: 0, z: 0 },
      confidence: 1.0,
      properties: {},
      tags: [],
      last_seen_at: updated15sAgo,
      created_at: updated15sAgo,
      updated_at: updated15sAgo,
      version: 1,
    };

    const result = PermanenceEngine.extrapolateEntityPosition(
      entity,
      now.toISOString(),
      [],
      { maxElapsedSeconds: 10.0 }
    );

    expect(result.elapsed_seconds).toBeCloseTo(15.0, 1);
    expect(result.extrapolated_position.x).toBe(10);
    expect(result.velocity.x).toBe(0);
    expect(result.clamped).toBe(false);
  });

  it('computes expected_reentry_entities in FrustumEngine when an entity is entering observer view', () => {
    // Observer looking toward positive Z: observer at (0, 0, 0), yaw = 0 (heading +Z in cone test)
    // Wait, let's see how pointInFrustumCone calculates heading:
    // dx = target.x - obs.x, dz = target.z - obs.z.
    // targetAngleDeg = normalizeAngle(atan2(dx, dz) * 180 / PI).
    // When yaw = 0, target at (0, 0, 10) -> dx = 0, dz = 10 -> atan2(0, 10) = 0 deg -> diff = 0 <= 45 -> visible!

    // Moving entity starts at (-15, 0, 10) (outside 90-deg FOV cone at distance 10, angle is atan2(-15, 10) = -56.3 deg)
    // It has velocity (+10, 0, 0), so in 1-2 seconds it will move to (-5, 0, 10) and (5, 0, 10) inside the FOV cone!
    const ent = EntityStore.addEntity(db, {
      project,
      name: 'Approaching Vehicle',
      type: 'agent',
      status: 'active',
      position: { x: -20, y: 0, z: 10 },
      velocity: { x: 12, y: 0, z: 0 },
      confidence: 1.0,
    });

    const expectedView = FrustumEngine.getExpectedView(db, {
      project,
      observer_position: { x: 0, y: 0, z: 0 },
      observer_orientation: { yaw: 0, pitch: 0, roll: 0 },
      fov_degrees: 60,
      max_distance: 50,
    });

    // Currently not visible in primary cone
    const currentlyVisible = expectedView.visible_entities.some((v) => v.entity.id === ent.id && !v.is_occluded);
    expect(currentlyVisible).toBe(false);

    // Should predict re-entry in expected_reentry_entities
    expect(expectedView.expected_reentry_entities).toBeDefined();
    expect(expectedView.expected_reentry_entities!.length).toBeGreaterThan(0);
    const reentry = expectedView.expected_reentry_entities!.find((r) => r.id === ent.id);
    expect(reentry).toBeDefined();
    expect(reentry!.estimated_reentry_ms).toBeGreaterThan(0);
    expect(reentry!.predicted_position.x).toBeGreaterThan(-20);
  });
});
