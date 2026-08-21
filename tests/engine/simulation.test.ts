import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getDb, closeAllDbs } from '../../src/engine/db.js';
import { EntityStore } from '../../src/engine/entity-store.js';
import { SimulationEngine } from '../../src/engine/simulation.js';

const PROJECT = 'test-simulation';

describe('SimulationEngine', () => {
  beforeEach(() => {
    const db = getDb(PROJECT);
    db.prepare('DELETE FROM entities WHERE project = ?').run(PROJECT);
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('simulates linear movement without obstacles', () => {
    const db = getDb(PROJECT);
    const agent = EntityStore.addEntity(db, {
      project: PROJECT,
      name: 'Drone',
      type: 'agent',
      position: { x: 0, y: 0, z: 0 },
    });

    const res = SimulationEngine.simulateMovement(db, {
      project: PROJECT,
      entity_id: agent.id,
      delta_position: { x: 0, y: 0, z: 10 },
    });

    expect(res.is_valid).toBe(true);
    expect(res.projected_position).toEqual({ x: 0, y: 0, z: 10 });
    expect(res.distance_traversed).toBe(10);
    expect(res.collisions_detected.length).toBe(0);
  });

  it('detects obstacle collisions along movement trajectory', () => {
    const db = getDb(PROJECT);
    const agent = EntityStore.addEntity(db, {
      project: PROJECT,
      name: 'Robot',
      type: 'agent',
      position: { x: 0, y: 0, z: 0 },
      bounding_box: { width: 1, height: 1, depth: 1 },
    });

    EntityStore.addEntity(db, {
      project: PROJECT,
      name: 'Brick Wall',
      type: 'obstacle',
      position: { x: 0, y: 0, z: 5 },
      bounding_box: { width: 2, height: 2, depth: 2 },
    });

    const res = SimulationEngine.simulateMovement(db, {
      project: PROJECT,
      entity_id: agent.id,
      delta_position: { x: 0, y: 0, z: 10 },
      check_collisions: true,
    });

    expect(res.is_valid).toBe(false);
    expect(res.collisions_detected.length).toBeGreaterThan(0);
    expect(res.collisions_detected[0].obstacle_name).toBe('Brick Wall');
  });
});
