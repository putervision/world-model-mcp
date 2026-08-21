import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from '../../src/engine/db.js';
import { EntityStore } from '../../src/engine/entity-store.js';
import { SnapshotEngine } from '../../src/engine/snapshots.js';
import { ValidationError } from '../../src/utils/errors.js';

describe('Snapshot Engine Comprehensive', () => {
  const project = 'test-snapshots-comp';
  const db = getDb(project);

  beforeEach(() => {
    db.prepare('DELETE FROM entities WHERE project = ?').run(project);
    db.prepare('DELETE FROM spatial_relations WHERE project = ?').run(project);
    db.prepare('DELETE FROM snapshots WHERE project = ?').run(project);
  });

  it('saves, lists, and restores snapshots and handles error branches', () => {
    EntityStore.addEntity(db, {
      project,
      name: 'Treasure Island',
      type: 'landmark',
      position: { x: 50, y: 0, z: 50 },
    });

    // Error: missing snapshot name
    expect(() => SnapshotEngine.saveSnapshot(db, { project, name: '' })).toThrow(ValidationError);

    const snap1 = SnapshotEngine.saveSnapshot(db, {
      project,
      name: 'checkpoint-1',
      description: 'Initial state',
    });
    expect(snap1.snapshot_id).toBeDefined();

    const list = SnapshotEngine.listSnapshots(db, { project });
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('checkpoint-1');

    // Error: restore non-existent snapshot
    expect(() => SnapshotEngine.restoreSnapshot(db, { project, name: 'non-existent' })).toThrow(
      ValidationError
    );

    EntityStore.addEntity(db, {
      project,
      name: 'Pirate Ship',
      type: 'agent',
      position: { x: 60, y: 0, z: 60 },
    });

    const restored = SnapshotEngine.restoreSnapshot(db, {
      project,
      name: 'checkpoint-1',
    });
    expect(restored.restored_entities).toBe(1);

    const afterEntities = EntityStore.listEntities(db, { project });
    expect(afterEntities.length).toBe(1);
    expect(afterEntities[0].name).toBe('Treasure Island');
  });
});
