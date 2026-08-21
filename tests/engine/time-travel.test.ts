import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/engine/migrations.js';
import { TimeTravelEngine } from '../../src/engine/time-travel.js';
import { EntityStore } from '../../src/engine/entity-store.js';
import { logEntityEvent } from '../../src/engine/events.js';

describe('TimeTravelEngine (Mutation Undo & Historical Replay)', () => {
  let db: Database.Database;
  const project = 'test-timetravel';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  it('should undo entity creation and coordinate modifications', () => {
    const ent = EntityStore.addEntity(db, {
      project,
      name: 'Mobile Bot',
      type: 'agent',
      position: { x: 0, y: 0, z: 0 },
    });

    // Update position
    EntityStore.updateEntity(db, {
      project,
      id: ent.id,
      position: { x: 10, y: 0, z: 10 },
    });

    let current = EntityStore.getEntity(db, { project, id: ent.id });
    expect(current?.position?.x).toBe(10);

    // Revert latest move
    const undo1 = TimeTravelEngine.undoMutation(db, { project, entity_id: ent.id });
    expect(undo1.success).toBe(true);

    current = EntityStore.getEntity(db, { project, id: ent.id });
    expect(current?.position?.x).toBe(0);

    // Revert creation
    const undo2 = TimeTravelEngine.undoMutation(db, { project, entity_id: ent.id });
    expect(undo2.success).toBe(true);

    current = EntityStore.getEntity(db, { project, id: ent.id });
    expect(current).toBeNull();
  });

  it('should reconstruct state at past timestamps', () => {
    const t1 = '2026-01-01T10:00:00.000Z';
    const t2 = '2026-01-01T11:00:00.000Z';
    const t3 = '2026-01-01T12:00:00.000Z';

    db.prepare(
      `
      INSERT INTO entity_history (id, project, entity_id, action, x, y, z, confidence, source, timestamp)
      VALUES ('h1', 'test-timetravel', 'e1', 'created', 1, 2, 3, 1.0, 'test', ?)
    `
    ).run(t1);

    db.prepare(
      `
      INSERT INTO entity_history (id, project, entity_id, action, x, y, z, confidence, source, timestamp)
      VALUES ('h2', 'test-timetravel', 'e1', 'moved', 10, 20, 30, 0.9, 'test', ?)
    `
    ).run(t2);

    db.prepare(
      `
      INSERT INTO entity_history (id, project, entity_id, action, source, timestamp)
      VALUES ('h3', 'test-timetravel', 'e1', 'destroyed', 'test', ?)
    `
    ).run(t3);

    const stateAtT1 = TimeTravelEngine.getStateAtTimestamp(db, { project, timestamp: t1 });
    expect(stateAtT1.entities.length).toBe(1);
    expect(stateAtT1.entities[0].position).toEqual({ x: 1, y: 2, z: 3 });

    const stateAtT2 = TimeTravelEngine.getStateAtTimestamp(db, { project, timestamp: t2 });
    expect(stateAtT2.entities.length).toBe(1);
    expect(stateAtT2.entities[0].position).toEqual({ x: 10, y: 20, z: 30 });

    const stateAtT3 = TimeTravelEngine.getStateAtTimestamp(db, { project, timestamp: t3 });
    expect(stateAtT3.entities.length).toBe(0);
  });
});
