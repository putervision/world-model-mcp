import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/engine/migrations.js';
import { EntityStore } from '../../src/engine/entity-store.js';
import { SpatialGraph } from '../../src/engine/spatial-graph.js';
import { SnapshotEngine } from '../../src/engine/snapshots.js';
import { ValidationError } from '../../src/utils/errors.js';

describe('SnapshotEngine Deep Suite', () => {
  let db: Database.Database;
  const project = 'snapshot-test-project';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('saves and lists named snapshots', () => {
    EntityStore.addEntity(db, {
      project,
      name: 'Rover',
      type: 'agent',
      position: { x: 1, y: 0, z: 2 },
    });

    const res = SnapshotEngine.saveSnapshot(db, {
      project,
      name: 'checkpoint_alpha',
      description: 'Initial rover deployment',
    });

    expect(res.name).toBe('checkpoint_alpha');
    expect(res.snapshot_id).toBeDefined();

    const list = SnapshotEngine.listSnapshots(db, { project });
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('checkpoint_alpha');
    expect(list[0].description).toBe('Initial rover deployment');
  });

  it('throws ValidationError when saving with invalid name', () => {
    expect(() => {
      SnapshotEngine.saveSnapshot(db, {
        project,
        name: '' as any,
      });
    }).toThrow(ValidationError);
  });

  it('diffs two snapshots detecting added, removed, and displaced entities', () => {
    const rover = EntityStore.addEntity(db, {
      project,
      name: 'Rover',
      type: 'agent',
      position: { x: 0, y: 0, z: 0 },
    });

    const beaconA = EntityStore.addEntity(db, {
      project,
      name: 'BeaconA',
      type: 'landmark',
      position: { x: 5, y: 0, z: 5 },
    });

    SpatialGraph.setRelation(db, {
      project,
      source_id: rover.id,
      relation: 'near',
      target_id: beaconA.id,
      distance: 7.07,
    });

    // Save Snapshot 1
    SnapshotEngine.saveSnapshot(db, { project, name: 'snap_v1' });

    // Mutate world: move Rover, remove BeaconA, add BeaconB
    EntityStore.updateEntity(db, {
      project,
      id: rover.id,
      position: { x: 10, y: 0, z: 0 }, // displaced by 10m
    });

    EntityStore.removeEntity(db, { project, id: beaconA.id, hard_delete: true });

    const beaconB = EntityStore.addEntity(db, {
      project,
      name: 'BeaconB',
      type: 'landmark',
      position: { x: 20, y: 0, z: 0 },
    });

    SpatialGraph.setRelation(db, {
      project,
      source_id: rover.id,
      relation: 'near',
      target_id: beaconB.id,
      distance: 10.0,
    });

    // Save Snapshot 2
    SnapshotEngine.saveSnapshot(db, { project, name: 'snap_v2' });

    // Compute diff
    const diff = SnapshotEngine.diffSnapshots(db, {
      project,
      snapshot_a: 'snap_v1',
      snapshot_b: 'snap_v2',
    });

    expect(diff.snapshot_a).toBe('snap_v1');
    expect(diff.snapshot_b).toBe('snap_v2');

    // Added: BeaconB
    expect(diff.added_entities.length).toBe(1);
    expect(diff.added_entities[0].name).toBe('BeaconB');

    // Removed: BeaconA
    expect(diff.removed_entities.length).toBe(1);
    expect(diff.removed_entities[0].name).toBe('BeaconA');

    // Displaced: Rover moved 10m
    expect(diff.displaced_entities.length).toBe(1);
    expect(diff.displaced_entities[0].name).toBe('Rover');
    expect(diff.displaced_entities[0].distance).toBeCloseTo(10.0, 2);

    // Relations diff
    expect(diff.added_relations.length).toBe(1);
    expect(diff.added_relations[0].target_id).toBe(beaconB.id);
    expect(diff.removed_relations.length).toBe(1);
    expect(diff.removed_relations[0].target_id).toBe(beaconA.id);
  });

  it('restores snapshot wiping current state and restoring entities/relations', () => {
    const e1 = EntityStore.addEntity(db, {
      project,
      name: 'InitialBox',
      type: 'object',
      position: { x: 1, y: 1, z: 1 },
    });

    SnapshotEngine.saveSnapshot(db, { project, name: 'snap_initial' });

    // Clear and create new entity
    EntityStore.removeEntity(db, { project, id: e1.id, hard_delete: true });
    EntityStore.addEntity(db, {
      project,
      name: 'NewSpuriousObject',
      type: 'object',
      position: { x: 99, y: 99, z: 99 },
    });

    expect(EntityStore.listEntities(db, { project }).length).toBe(1);
    expect(EntityStore.listEntities(db, { project })[0].name).toBe('NewSpuriousObject');

    // Restore initial snapshot
    const restoreRes = SnapshotEngine.restoreSnapshot(db, {
      project,
      name: 'snap_initial',
    });

    expect(restoreRes.restored_entities).toBe(1);
    const current = EntityStore.listEntities(db, { project });
    expect(current.length).toBe(1);
    expect(current[0].name).toBe('InitialBox');
    expect(current[0].position?.x).toBe(1);
  });

  it('throws ValidationError when diffing or restoring nonexistent snapshots', () => {
    expect(() => {
      SnapshotEngine.restoreSnapshot(db, { project, name: 'nonexistent_snap' });
    }).toThrow(ValidationError);

    expect(() => {
      SnapshotEngine.diffSnapshots(db, {
        project,
        snapshot_a: 'snap_1',
        snapshot_b: 'snap_missing',
      });
    }).toThrow(ValidationError);
  });
});
