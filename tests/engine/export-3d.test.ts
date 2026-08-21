import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/engine/migrations.js';
import { exportWorldModel, exportTrajectories } from '../../src/engine/export.js';
import { EntityStore } from '../../src/engine/entity-store.js';

describe('3D Export Formats & Trajectories', () => {
  let db: Database.Database;
  const project = 'test-export-3d';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  it('should export valid glTF 2.0 and Wavefront OBJ representations', () => {
    EntityStore.addEntity(db, {
      project,
      name: 'Pillar',
      type: 'landmark',
      position: { x: 5, y: 2, z: 5 },
      bounding_box: { width: 1, height: 4, depth: 1 },
    });

    const gltf = exportWorldModel(db, { project, format: 'gltf' });
    expect(gltf.asset.version).toBe('2.0');
    expect(gltf.nodes.length).toBe(1);
    expect(gltf.nodes[0].translation).toEqual([5, 2, 5]);

    const obj = exportWorldModel(db, { project, format: 'obj' });
    expect(typeof obj).toBe('string');
    expect(obj).toContain('o Pillar_');
    expect(obj).toContain('v ');
    expect(obj).toContain('f ');
  });

  it('should export joint and spatial_vlm trajectories', () => {
    EntityStore.addEntity(db, {
      project,
      name: 'Agent Drone',
      type: 'agent',
      position: { x: 0, y: 1, z: 0 },
    });

    const joint = exportTrajectories(db, { project, format: 'joint', trace_id: 'trace_123' });
    expect(Array.isArray(joint)).toBe(true);
    expect(joint.length).toBe(1);
    expect(joint[0].trace_id).toBe('trace_123');

    const vlm = exportTrajectories(db, { project, format: 'spatial_vlm' });
    expect(Array.isArray(vlm)).toBe(true);
    expect(vlm.length).toBe(1);
    expect(vlm[0].instruction).toBeDefined();
  });
});
