import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from '../../src/engine/db.js';
import { EntityStore } from '../../src/engine/entity-store.js';
import { SpatialGraph } from '../../src/engine/spatial-graph.js';
import { ValidationError } from '../../src/utils/errors.js';

describe('Spatial Graph Comprehensive', () => {
  const project = 'test-spatial-graph-comp';
  const db = getDb(project);

  beforeEach(() => {
    db.prepare('DELETE FROM entities WHERE project = ?').run(project);
    db.prepare('DELETE FROM spatial_relations WHERE project = ?').run(project);
  });

  it('handles relations, inverses, relation type filters, and removal without inverse', () => {
    const table = EntityStore.addEntity(db, {
      project,
      name: 'Dining Table',
      type: 'surface',
      position: { x: 0, y: 0, z: 0 },
    });
    const cup = EntityStore.addEntity(db, {
      project,
      name: 'Tea Cup',
      type: 'item',
      position: { x: 0, y: 1, z: 0 },
    });

    const rel = SpatialGraph.setRelation(db, {
      project,
      source_id: cup.id,
      relation: 'on',
      target_id: table.id,
      bidirectional: false,
    });
    expect(rel.relation).toBe('on');

    // Filter by relation
    const onRels = SpatialGraph.getRelations(db, { project, relation: 'on' });
    expect(onRels.length).toBe(1);

    // Topological traversal
    const neighbors = SpatialGraph.traverseTopologicalGraph(db, {
      project,
      start_entity_id: cup.id,
    });
    expect(neighbors.length).toBeGreaterThan(0);

    // Remove single relation without inverse
    const remSingle = SpatialGraph.removeRelation(db, {
      project,
      source_id: cup.id,
      relation: 'on',
      target_id: table.id,
      remove_inverse: false,
    });
    expect(remSingle).toBe(true);
  });

  it('queries relations as_target and removes relation with inverse by source/target', () => {
    const room = EntityStore.addEntity(db, {
      project,
      name: 'Living Room',
      type: 'region',
      position: { x: 0, y: 0, z: 0 },
    });
    const chair = EntityStore.addEntity(db, {
      project,
      name: 'Armchair',
      type: 'item',
      position: { x: 2, y: 0, z: 2 },
    });

    SpatialGraph.setRelation(db, {
      project,
      source_id: chair.id,
      relation: 'inside',
      target_id: room.id,
      bidirectional: false,
    });

    const targetRels = SpatialGraph.getRelations(db, {
      project,
      entity_id: room.id,
      as_target: true,
    });
    expect(targetRels.length).toBe(1);

    const removed = SpatialGraph.removeRelation(db, {
      project,
      source_id: chair.id,
      relation: 'inside',
      target_id: room.id,
      remove_inverse: true,
    });
    expect(removed).toBe(true);
  });

  it('throws ValidationError when source or target entity is missing in setRelation', () => {
    const validEnt = EntityStore.addEntity(db, { project, name: 'Valid Entity', type: 'item' });

    expect(() =>
      SpatialGraph.setRelation(db, {
        project,
        source_id: 'missing-source',
        relation: 'on',
        target_id: validEnt.id,
      })
    ).toThrow(ValidationError);

    expect(() =>
      SpatialGraph.setRelation(db, {
        project,
        source_id: validEnt.id,
        relation: 'on',
        target_id: 'missing-target',
      })
    ).toThrow(ValidationError);
  });
});
