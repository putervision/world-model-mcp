import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from '../../src/engine/db.js';
import { EntityStore } from '../../src/engine/entity-store.js';
import { PermanenceEngine } from '../../src/engine/permanence.js';

describe('Permanence Engine Complete', () => {
  const project = 'test-permanence-full';
  const db = getDb(project);

  beforeEach(() => {
    db.prepare('DELETE FROM entities WHERE project = ?').run(project);
  });

  it('decays active entity confidence and transitions status to hidden and lost', () => {
    const pastTime = new Date(Date.now() - 5000).toISOString();

    // Entity 1: confidence 0.22 -> 0.12 -> hidden
    const eHidden = EntityStore.addEntity(db, {
      project,
      name: 'Fading Gem',
      type: 'item',
      position: { x: 0, y: 0, z: 0 },
      confidence: 0.22,
    });
    db.prepare('UPDATE entities SET last_seen_at = ? WHERE id = ?').run(pastTime, eHidden.id);

    // Entity 2: confidence 0.08 -> 0.0 -> lost
    const eLost = EntityStore.addEntity(db, {
      project,
      name: 'Vanishing Ghost',
      type: 'npc',
      position: { x: 10, y: 0, z: 10 },
      confidence: 0.08,
    });
    db.prepare('UPDATE entities SET last_seen_at = ? WHERE id = ?').run(pastTime, eLost.id);

    // Run decay with unseen_for_ms = 1000
    const decayRes = PermanenceEngine.applyPermanenceDecay(db, {
      project,
      decay_rate: 0.1,
      unseen_for_ms: 1000,
      min_confidence_threshold: 0.2,
    });

    expect(decayRes.decayed_count).toBe(2);
    expect(decayRes.lost_count).toBe(1);

    const hiddenEntity = EntityStore.getEntity(db, { project, id: eHidden.id });
    expect(hiddenEntity?.status).toBe('hidden');

    const lostEntity = EntityStore.getEntity(db, { project, id: eLost.id });
    expect(lostEntity?.status).toBe('lost');
  });
});
