import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getDb, closeAllDbs } from '../../src/engine/db.js';
import { EntityStore } from '../../src/engine/entity-store.js';
import { SpatialGraph } from '../../src/engine/spatial-graph.js';
import { NavigationEngine } from '../../src/engine/navigation.js';

const PROJECT = 'test-navigation';

describe('NavigationEngine', () => {
  beforeEach(() => {
    const db = getDb(PROJECT);
    db.prepare('DELETE FROM spatial_relations WHERE project = ?').run(PROJECT);
    db.prepare('DELETE FROM entities WHERE project = ?').run(PROJECT);
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('computes direct vector navigation hints between coordinates', () => {
    const db = getDb(PROJECT);
    const hints = NavigationEngine.getNavigationHints(db, {
      project: PROJECT,
      start_position: { x: 0, y: 0, z: 0 },
      target_position: { x: 10, y: 0, z: 0 },
    });

    expect(hints.path_found).toBe(true);
    expect(hints.total_distance).toBe(10);
    expect(hints.hints.length).toBe(1);
  });

  it('computes step-by-step topological navigation hints across connected rooms', () => {
    const db = getDb(PROJECT);
    const hall = EntityStore.addEntity(db, { project: PROJECT, name: 'Main Hall', type: 'region' });
    const corridor = EntityStore.addEntity(db, {
      project: PROJECT,
      name: 'North Corridor',
      type: 'region',
    });
    const vault = EntityStore.addEntity(db, { project: PROJECT, name: 'Vault', type: 'region' });

    SpatialGraph.setRelation(db, {
      project: PROJECT,
      source_id: hall.id,
      relation: 'connected_to',
      target_id: corridor.id,
    });
    SpatialGraph.setRelation(db, {
      project: PROJECT,
      source_id: corridor.id,
      relation: 'connected_to',
      target_id: vault.id,
    });

    const hints = NavigationEngine.getNavigationHints(db, {
      project: PROJECT,
      start_entity_id: hall.id,
      target_entity_id: vault.id,
    });

    expect(hints.path_found).toBe(true);
    expect(hints.hints.length).toBe(2);
    expect(hints.hints[0].to_entity_id).toBe(corridor.id);
    expect(hints.hints[1].to_entity_id).toBe(vault.id);
  });
});
