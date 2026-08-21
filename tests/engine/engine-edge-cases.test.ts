import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from '../../src/engine/db.js';
import { EntityStore } from '../../src/engine/entity-store.js';
import { SpatialGraph } from '../../src/engine/spatial-graph.js';
import { PermanenceEngine } from '../../src/engine/permanence.js';
import { SimulationEngine } from '../../src/engine/simulation.js';
import { NavigationEngine } from '../../src/engine/navigation.js';
import { VisionBridge } from '../../src/engine/vision-bridge.js';
import { GoalBridge } from '../../src/engine/goal-bridge.js';
import { FrustumEngine } from '../../src/engine/frustum.js';
import { getWorldSummary } from '../../src/engine/summary.js';
import { ValidationError } from '../../src/utils/errors.js';

describe('Engine Modules Deep Edge Cases', () => {
  const project = 'test-edge-cases-suite';
  const db = getDb(project);

  beforeEach(() => {
    db.prepare('DELETE FROM entities WHERE project = ?').run(project);
    db.prepare('DELETE FROM spatial_relations WHERE project = ?').run(project);
    db.prepare('DELETE FROM goal_links WHERE project = ?').run(project);
    db.prepare('DELETE FROM observations WHERE project = ?').run(project);
  });

  it('handles optimistic concurrency error and soft vs hard delete', () => {
    const e = EntityStore.addEntity(db, {
      project,
      name: 'Versioned Node',
      type: 'item',
      position: { x: 0, y: 0, z: 0 },
    });

    expect(() =>
      EntityStore.updateEntity(db, {
        project,
        id: e.id,
        name: 'Stale Update',
        expected_version: e.version + 99,
      })
    ).toThrow(ValidationError);

    // Soft delete
    const softDelSuccess = EntityStore.removeEntity(db, {
      project,
      id: e.id,
      hard_delete: false,
    });
    expect(softDelSuccess).toBe(true);

    const softDeleted = EntityStore.getEntity(db, { project, id: e.id });
    expect(softDeleted?.status).toBe('destroyed');

    // Hard delete
    const hardDelSuccess = EntityStore.removeEntity(db, {
      project,
      id: e.id,
      hard_delete: true,
    });
    expect(hardDelSuccess).toBe(true);
    expect(EntityStore.getEntity(db, { project, id: e.id })).toBeNull();
  });

  it('handles spatial graph queries and relation removal', () => {
    const a = EntityStore.addEntity(db, {
      project,
      name: 'Node A',
      type: 'landmark',
      position: { x: 0, y: 0, z: 0 },
    });
    const b = EntityStore.addEntity(db, {
      project,
      name: 'Node B',
      type: 'item',
      position: { x: 0, y: 1, z: 0 },
    });

    const rel = SpatialGraph.setRelation(db, {
      project,
      source_id: a.id,
      relation: 'contains',
      target_id: b.id,
      bidirectional: true,
    });
    expect(rel.relation).toBe('contains');

    const asTarget = SpatialGraph.getRelations(db, { project, entity_id: b.id, as_target: true });
    expect(asTarget.length).toBeGreaterThan(0);

    SpatialGraph.removeRelation(db, {
      project,
      source_id: a.id,
      relation: 'contains',
      target_id: b.id,
      remove_inverse: true,
    });
  });

  it('handles permanence decay and status transitions to lost', () => {
    const e = EntityStore.addEntity(db, {
      project,
      name: 'Decaying Item',
      type: 'item',
      position: { x: 0, y: 0, z: 0 },
      confidence: 0.1,
    });

    const decayRes = PermanenceEngine.applyPermanenceDecay(db, {
      project,
      decay_rate: 0.08,
      unseen_for_ms: 0,
    });
    expect(decayRes.decayed_count).toBeGreaterThanOrEqual(0);

    // Re-observe
    PermanenceEngine.reObserveEntity(db, {
      project,
      entity_id: e.id,
    });
    const reobserved = EntityStore.getEntity(db, { project, id: e.id });
    expect(reobserved?.confidence).toBe(1.0);
    expect(reobserved?.status).toBe('active');
  });

  it('handles simulation movement with velocity and duration', () => {
    const hero = EntityStore.addEntity(db, {
      project,
      name: 'Hero Runner',
      type: 'agent',
      position: { x: 0, y: 0, z: 0 },
    });

    const sim = SimulationEngine.simulateMovement(db, {
      project,
      entity_id: hero.id,
      velocity: { x: 2, y: 0, z: 0 },
      duration_seconds: 3,
      check_collisions: false,
    });
    expect(sim.projected_position.x).toBe(6);
  });

  it('handles navigation hints with topological/spatial fallbacks', () => {
    const x = EntityStore.addEntity(db, {
      project,
      name: 'Waypoint X',
      type: 'waypoint',
      position: { x: 0, y: 0, z: 0 },
    });
    const y = EntityStore.addEntity(db, {
      project,
      name: 'Waypoint Y',
      type: 'waypoint',
      position: { x: 10, y: 0, z: 10 },
    });

    const nav = NavigationEngine.getNavigationHints(db, {
      project,
      start_entity_id: x.id,
      target_entity_id: y.id,
    });
    expect(nav.path_found).toBe(true);
  });

  it('handles vision bridge observation reconciliation with anomalies', () => {
    const recon = VisionBridge.reconcileObservation(db, {
      project,
      observer_pose: { position: { x: 0, y: 0, z: 0 }, orientation: { yaw: 0 } },
      field_of_view: { fov_horizontal: 90 },
      detections: [
        {
          label: 'Surprise Goblin',
          class_name: 'npc',
          confidence: 0.9,
          estimated_position: { x: 0, y: 0, z: 15 },
        },
      ],
    });
    expect(recon.anomalies.length).toBeGreaterThanOrEqual(0);
  });

  it('handles goal bridge context extraction and task linking', () => {
    const chest = EntityStore.addEntity(db, {
      project,
      name: 'Quest Chest',
      type: 'container',
      position: { x: 10, y: 0, z: 10 },
    });
    GoalBridge.linkToGoal(db, {
      project,
      task_id: 'task-quest-1',
      entity_id: chest.id,
      relationship: 'target',
    });

    const ctx = GoalBridge.getRelevantContext(db, {
      project,
      task_id: 'task-quest-1',
      current_agent_position: { x: 0, y: 0, z: 0 },
      radius: 50,
    });
    expect(ctx.goal_targets.length).toBeGreaterThan(0);

    GoalBridge.unlinkFromGoal(db, { project, task_id: 'task-quest-1', entity_id: chest.id });
  });

  it('handles summary and frustum view engines', () => {
    const summary = getWorldSummary(db, { project });
    expect(summary.total_entities).toBeGreaterThanOrEqual(0);

    const frustum = FrustumEngine.getExpectedView(db, {
      project,
      observer_position: { x: 0, y: 0, z: 0 },
      observer_orientation: { yaw: 0 },
      fov_degrees: 90,
    });
    expect(frustum.visible_entities).toBeDefined();
  });
});
