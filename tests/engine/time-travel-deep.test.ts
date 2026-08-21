import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/engine/migrations.js';
import { EntityStore } from '../../src/engine/entity-store.js';
import { TimeTravelEngine } from '../../src/engine/time-travel.js';

describe('TimeTravelEngine Deep Suite', () => {
  let db: Database.Database;
  const project = 'time-travel-deep-project';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('undoes creation of an entity by deleting it and reverting event', () => {
    const ent = EntityStore.addEntity(db, {
      project,
      name: 'TemporaryProbe',
      type: 'agent',
      position: { x: 1, y: 2, z: 3 },
    });

    expect(EntityStore.getEntity(db, { project, id: ent.id })).toBeDefined();

    const undoRes = TimeTravelEngine.undoMutation(db, {
      project,
      entity_id: ent.id,
    });

    expect(undoRes.success).toBe(true);
    expect(undoRes.message).toContain('Reverted creation');
    expect(EntityStore.getEntity(db, { project, id: ent.id })).toBeNull();
  });

  it('undoes coordinate mutations by restoring previous historical coordinates', () => {
    const ent = EntityStore.addEntity(db, {
      project,
      name: 'NavRover',
      type: 'agent',
      position: { x: 0, y: 0, z: 0 },
    });

    // Move Rover to (10, 0, 0)
    EntityStore.updateEntity(db, {
      project,
      id: ent.id,
      position: { x: 10, y: 0, z: 0 },
    });

    // Move Rover to (20, 0, 0)
    EntityStore.updateEntity(db, {
      project,
      id: ent.id,
      position: { x: 20, y: 0, z: 0 },
    });

    expect(EntityStore.getEntity(db, { project, id: ent.id })?.position?.x).toBe(20);

    // Undo last move (should revert from 20 -> 10)
    const undo1 = TimeTravelEngine.undoMutation(db, {
      project,
      entity_id: ent.id,
    });

    expect(undo1.success).toBe(true);
    expect(EntityStore.getEntity(db, { project, id: ent.id })?.position?.x).toBe(10);

    // Undo again (should revert from 10 -> 0)
    const undo2 = TimeTravelEngine.undoMutation(db, {
      project,
      entity_id: ent.id,
    });

    expect(undo2.success).toBe(true);
    expect(EntityStore.getEntity(db, { project, id: ent.id })?.position?.x).toBe(0);
  });

  it('returns false when no mutations exist to undo', () => {
    const res = TimeTravelEngine.undoMutation(db, {
      project,
      entity_id: 'nonexistent_id',
    });

    expect(res.success).toBe(false);
    expect(res.message).toContain('No mutation events found');
  });

  it('reconstructs historical world state at arbitrary past timestamp', () => {
    const t0 = new Date('2026-08-20T10:00:00.000Z').toISOString();
    const t1 = new Date('2026-08-20T11:00:00.000Z').toISOString();
    const t2 = new Date('2026-08-20T12:00:00.000Z').toISOString();

    // Insert events at explicit timestamps
    db.prepare(
      `
      INSERT INTO entity_history (id, project, entity_id, action, x, y, z, confidence, source, timestamp)
      VALUES ('h1', ?, 'ent_beacon', 'created', 0, 0, 0, 1.0, 'init', ?)
    `
    ).run(project, t0);

    db.prepare(
      `
      INSERT INTO entity_history (id, project, entity_id, action, x, y, z, confidence, source, timestamp)
      VALUES ('h2', ?, 'ent_beacon', 'moved', 50, 0, 0, 1.0, 'move', ?)
    `
    ).run(project, t1);

    db.prepare(
      `
      INSERT INTO entity_history (id, project, entity_id, action, x, y, z, confidence, source, timestamp)
      VALUES ('h3', ?, 'ent_beacon', 'destroyed', 50, 0, 0, 0.0, 'destroy', ?)
    `
    ).run(project, t2);

    // At T0: beacon at (0, 0, 0)
    const stateAtT0 = TimeTravelEngine.getStateAtTimestamp(db, { project, timestamp: t0 });
    expect(stateAtT0.entities.length).toBe(1);
    expect(stateAtT0.entities[0].position?.x).toBe(0);

    // At T1: beacon moved to (50, 0, 0)
    const stateAtT1 = TimeTravelEngine.getStateAtTimestamp(db, { project, timestamp: t1 });
    expect(stateAtT1.entities.length).toBe(1);
    expect(stateAtT1.entities[0].position?.x).toBe(50);

    // At T2: beacon destroyed (omitted from active entities)
    const stateAtT2 = TimeTravelEngine.getStateAtTimestamp(db, { project, timestamp: t2 });
    expect(stateAtT2.entities.length).toBe(0);
  });
});
