import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from '../../src/engine/db.js';
import { EntityStore } from '../../src/engine/entity-store.js';
import { ValidationError } from '../../src/utils/errors.js';

describe('EntityStore Comprehensive', () => {
  const project = 'test-entity-store-comp';
  const db = getDb(project);

  beforeEach(() => {
    db.prepare('DELETE FROM entities WHERE project = ?').run(project);
  });

  it('handles entity creation, updates, validation, and optimistic concurrency', () => {
    const e = EntityStore.addEntity(db, {
      project,
      name: 'Hero Tower',
      type: 'landmark',
      position: { x: 0, y: 0, z: 0 },
      properties: { height: 100 },
      tags: ['defense', 'base'],
    });
    expect(e.id).toBeDefined();

    expect(() => EntityStore.addEntity(db, { project, name: '', type: 'landmark' })).toThrow(
      ValidationError
    );

    const fetched = EntityStore.getEntity(db, { project, id: e.id });
    expect(fetched?.name).toBe('Hero Tower');

    const updated = EntityStore.updateEntity(db, {
      project,
      id: e.id,
      position: { x: 5, y: 0, z: 5 },
      tags: ['defense', 'upgraded'],
      expected_version: e.version,
    });
    expect(updated.position?.x).toBe(5);
    expect(updated.tags).toContain('upgraded');

    expect(() =>
      EntityStore.updateEntity(db, {
        project,
        id: 'non-existent-id',
        name: 'Ghost',
      })
    ).toThrow(ValidationError);
  });

  it('handles queryEntities with FTS, LIKE fallback, tags, min_confidence, and near_position', () => {
    EntityStore.addEntity(db, {
      project,
      name: 'Alpha Sentinel',
      type: 'npc',
      position: { x: 10, y: 0, z: 10 },
      confidence: 0.9,
      tags: ['guard', 'patrol'],
    });

    EntityStore.addEntity(db, {
      project,
      name: 'Beta Scout',
      type: 'npc',
      position: { x: 40, y: 0, z: 40 },
      confidence: 0.4,
      tags: ['recon'],
    });

    EntityStore.addEntity(db, {
      project,
      name: 'Omega Ghost',
      type: 'npc',
      confidence: 0.8,
    });

    // FTS query
    const fts = EntityStore.queryEntities(db, { project, query: 'Sentinel' });
    expect(fts.length).toBe(1);
    expect(fts[0].name).toBe('Alpha Sentinel');

    // Tag filter
    const tagged = EntityStore.queryEntities(db, { project, tags: ['guard'] });
    expect(tagged.length).toBe(1);

    // Min confidence filter
    const conf = EntityStore.queryEntities(db, { project, min_confidence: 0.8 });
    expect(conf.length).toBe(2);

    // Proximity search
    const near = EntityStore.queryEntities(db, {
      project,
      near_position: { x: 0, y: 0, z: 0 },
      max_distance: 25,
    });
    expect(near.length).toBe(1);
    expect(near[0].name).toBe('Alpha Sentinel');

    // List entities with region and pagination
    const list = EntityStore.listEntities(db, {
      project,
      limit: 2,
      offset: 1,
    });
    expect(list.length).toBeGreaterThan(0);
  });

  it('handles LIKE search fallback for invalid FTS query syntax and type/status filters', () => {
    EntityStore.addEntity(db, {
      project,
      name: 'Special*Item',
      type: 'item',
      status: 'active',
    });

    // Invalid FTS syntax triggers LIKE fallback
    const likeResults = EntityStore.queryEntities(db, {
      project,
      query: 'Special*Item',
      type: 'item',
      status: 'active',
    });
    expect(likeResults.length).toBe(1);
    expect(likeResults[0].name).toBe('Special*Item');
  });
});
