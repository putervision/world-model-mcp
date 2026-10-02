import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/engine/migrations.js';
import { SpoolEngine } from '../../src/engine/spool.js';
import { EntityStore } from '../../src/engine/entity-store.js';
import { GoalBridge } from '../../src/engine/goal-bridge.js';
import { SpatialBlackboard } from '../../src/engine/blackboard.js';

describe('Spool Engine, Predicates & Goal Links', () => {
  let db: Database.Database;
  const project = 'test_spool_ingest';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('ingests spooled outcomes from high-frequency ticks into SQLite', () => {
    const res = SpoolEngine.ingestSpooledOutcomes(db, {
      project,
      items: [
        {
          session_id: 'sess_1',
          leaf: 'move_to_waypoint',
          status: 'success',
          result: { coords: [1, 2, 3] },
          pack_hash: 'sha256:abc1',
          token_id: 'tok_1',
        },
        {
          session_id: 'sess_1',
          leaf: 'check_clearance',
          status: 'success',
          result: { clearance: 2.5 },
          pack_hash: 'sha256:abc2',
          token_id: 'tok_2',
        },
      ],
    });

    expect(res.ingested).toBe(2);
    expect(res.total_spooled).toBe(2);

    const listed = SpoolEngine.listSpooledOutcomes(db, { project, session_id: 'sess_1' });
    expect(listed.length).toBe(2);
    expect(listed[0].leaf).toBe('check_clearance');
    expect(listed[0].result).toEqual({ clearance: 2.5 });
    expect(listed[1].leaf).toBe('move_to_waypoint');
  });

  it('links goal with target_entity_id, success_region, and min_clearance', () => {
    const goal = GoalBridge.linkToGoal(db, {
      project,
      task_id: 'task_alpha',
      entity_id: 'target_box',
      relationship: 'destination',
      target_entity_id: 'target_box',
      success_region: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 5, y: 5, z: 5 },
      },
      min_clearance: 1.5,
      notes: 'Arrive at target depot',
    });

    expect(goal.id).toBeDefined();
    expect(goal.target_entity_id).toBe('target_box');
    expect(goal.min_clearance).toBe(1.5);
    expect(goal.success_region).toEqual({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 5, y: 5, z: 5 },
    });

    const retrieved = GoalBridge.getLinkedGoals(db, { project, task_id: 'task_alpha' });
    expect(retrieved.length).toBe(1);
    expect(retrieved[0].target_entity_id).toBe('target_box');
    expect(retrieved[0].min_clearance).toBe(1.5);
    expect(retrieved[0].success_region).toEqual({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 5, y: 5, z: 5 },
    });
  });

  it('precomputes SpatialPredicatePack in compact slice', () => {
    // 1. Ingest spooled outcome
    SpoolEngine.ingestSpooledOutcomes(db, {
      project,
      items: [{ status: 'success', leaf: 'step1' }],
    });

    // 2. Add observer agent
    EntityStore.addEntity(db, {
      project,
      name: 'Agent',
      type: 'agent',
      status: 'active',
      position: { x: 0, y: 0, z: 0 },
      orientation: { yaw: 0 },
    });

    // 3. Add target goal entity
    const target = EntityStore.addEntity(db, {
      project,
      name: 'Destination Waypoint',
      type: 'waypoint',
      status: 'active',
      position: { x: 0, y: 0, z: 10 },
    });

    GoalBridge.linkToGoal(db, {
      project,
      task_id: 'task_navigation',
      entity_id: target.id,
      relationship: 'destination',
      target_entity_id: target.id,
    });

    // 4. Add an obstacle nearby
    EntityStore.addEntity(db, {
      project,
      name: 'Blocker Box',
      type: 'obstacle',
      status: 'active',
      position: { x: 0, y: 0, z: 2 },
      properties: { is_obstacle: true },
    });

    const slice = EntityStore.getCompactSlice(db, { project, k: 5 });

    expect(slice.predicates).toBeDefined();
    expect(slice.predicates!.spooled_outcomes_count).toBe(1);
    expect(slice.predicates!.feature_density).toBe(3);
    expect(slice.predicates!.nearest_obstacle_distance).toBeCloseTo(2.0, 1);
    expect(slice.predicates!.collision_imminent).toBe(false); // 2.0 >= 1.0
    expect(slice.predicates!.clearance_to_linked_goal).toBeCloseTo(10.0, 1);
  });

  it('manages blackboard claims with intention_id', () => {
    const claimRes = SpatialBlackboard.claim(db, {
      project,
      resource_id: 'dock_bay_1',
      agent_id: 'agent_42',
      duration_seconds: 30,
      intention_id: 'int_dock_001',
    });

    expect(claimRes.success).toBe(true);
    expect(claimRes.intention_id).toBe('int_dock_001');

    const items = SpatialBlackboard.read(db, { project });
    const claimItem = items.find((i) => i.topic === 'claim:dock_bay_1');
    expect(claimItem).toBeDefined();
    expect(claimItem!.intention_id).toBe('int_dock_001');
    expect(claimItem!.claimed_by).toBe('agent_42');
  });
});
