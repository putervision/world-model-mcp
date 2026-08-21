import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/engine/migrations.js';
import { SpatialSpecEngine } from '../../src/engine/spatial-spec.js';
import { EntityStore } from '../../src/engine/entity-store.js';
import { SpatialGraph } from '../../src/engine/spatial-graph.js';

describe('SpatialSpecEngine (Spatial SDD)', () => {
  let db: Database.Database;
  const project = 'test-sdd';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  it('should set, retrieve, and list spatial specifications', () => {
    const spec = SpatialSpecEngine.setSpatialSpec(db, {
      project,
      name: 'living-room-clearance',
      description: 'Minimum clearance between couch and coffee table',
      bounds: { min: { x: -10, y: 0, z: -10 }, max: { x: 10, y: 5, z: 10 } },
      constraints: [
        {
          type: 'min_clearance',
          entity_id: 'ent_couch',
          target_id: 'ent_table',
          value: 1.5,
        },
      ],
      sdd_requirement_id: 'sdd_req_001',
    });

    expect(spec.name).toBe('living-room-clearance');
    expect(spec.constraints.length).toBe(1);

    const fetched = SpatialSpecEngine.getSpatialSpec(db, {
      project,
      name: 'living-room-clearance',
    });
    expect(fetched).not.toBeNull();
    expect(fetched?.sdd_requirement_id).toBe('sdd_req_001');

    const list = SpatialSpecEngine.listSpatialSpecs(db, { project });
    expect(list.length).toBe(1);
  });

  it('should verify min_clearance constraints and detect violations', () => {
    const couch = EntityStore.addEntity(db, {
      project,
      name: 'Couch',
      type: 'object',
      position: { x: 0, y: 0, z: 0 },
    });

    const table = EntityStore.addEntity(db, {
      project,
      name: 'Coffee Table',
      type: 'object',
      position: { x: 0.8, y: 0, z: 0 },
    });

    SpatialSpecEngine.setSpatialSpec(db, {
      project,
      name: 'clearance-check',
      constraints: [
        {
          type: 'min_clearance',
          entity_id: couch.id,
          target_id: table.id,
          value: 1.5,
        },
      ],
      sdd_requirement_id: 'req_123',
    });

    const result = SpatialSpecEngine.verifySpatialSpec(db, { project, name: 'clearance-check' });
    expect(result.is_compliant).toBe(false);
    expect(result.violations.length).toBe(1);
    expect(result.violations[0].constraint_type).toBe('min_clearance');
    expect(result.state_memory_tool_calls).toBeDefined();
  });

  it('should verify max_distance, inside_region, contains_entity, and no_overlap constraints', () => {
    const entA = EntityStore.addEntity(db, {
      project,
      name: 'Entity A',
      type: 'object',
      position: { x: 0, y: 0, z: 0 },
      bounding_box: { width: 2, height: 2, depth: 2 },
    });

    const entB = EntityStore.addEntity(db, {
      project,
      name: 'Entity B',
      type: 'object',
      position: { x: 10, y: 0, z: 0 },
      bounding_box: { width: 2, height: 2, depth: 2 },
    });

    // Create Region
    db.prepare(
      `
      INSERT INTO regions (id, project, name, min_x, min_y, min_z, max_x, max_y, max_z, created_at)
      VALUES ('reg_zone1', 'test-sdd', 'Zone 1', -5, -5, -5, 5, 5, 5, datetime('now'))
    `
    ).run();

    // Set relations
    SpatialGraph.setRelation(db, {
      project,
      source_id: entA.id,
      relation: 'contains',
      target_id: entB.id,
    });

    SpatialSpecEngine.setSpatialSpec(db, {
      project,
      name: 'multi-constraint-spec',
      constraints: [
        { type: 'max_distance', entity_id: entA.id, target_id: entB.id, value: 5.0 }, // violation (dist 10 > 5)
        { type: 'inside_region', entity_id: entA.id, region_id: 'reg_zone1' }, // passed (pos 0 is inside -5..5)
        { type: 'inside_region', entity_id: entB.id, region_id: 'reg_zone1' }, // violation (pos 10 is outside)
        { type: 'contains_entity', entity_id: entA.id, target_id: entB.id }, // passed
        { type: 'no_overlap', entity_id: entA.id, target_id: entB.id }, // passed (dist 10)
      ],
    });

    const res = SpatialSpecEngine.verifySpatialSpec(db, { project, name: 'multi-constraint-spec' });
    expect(res.is_compliant).toBe(false);
    expect(res.violations.length).toBe(2);
  });

  it('should delete spatial specifications and throw on non-existent verify', () => {
    SpatialSpecEngine.setSpatialSpec(db, {
      project,
      name: 'temp-spec',
      constraints: [],
    });
    expect(SpatialSpecEngine.listSpatialSpecs(db, { project }).length).toBe(1);

    const deleted = SpatialSpecEngine.deleteSpatialSpec(db, { project, name: 'temp-spec' });
    expect(deleted).toBe(true);
    expect(SpatialSpecEngine.listSpatialSpecs(db, { project }).length).toBe(0);

    expect(() =>
      SpatialSpecEngine.verifySpatialSpec(db, { project, name: 'nonexistent' })
    ).toThrow();
  });
});
