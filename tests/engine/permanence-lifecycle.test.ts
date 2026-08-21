import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/engine/migrations.js';
import { EntityStore } from '../../src/engine/entity-store.js';
import { PermanenceEngine } from '../../src/engine/permanence.js';
import { getEntityHistory } from '../../src/engine/events.js';

describe('PermanenceEngine Lifecycle Suite', () => {
  let db: Database.Database;
  const project = 'permanence-lifecycle-project';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('decays unobserved entities and transitions active -> hidden -> lost', () => {
    // Insert entity seen 2 hours ago
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const ent = EntityStore.addEntity(db, {
      project,
      name: 'UnobservedArtifact',
      type: 'item',
      position: { x: 5, y: 0, z: 5 },
      confidence: 1.0,
    });

    // Manually backdate last_seen_at
    db.prepare('UPDATE entities SET last_seen_at = ? WHERE id = ?').run(twoHoursAgo, ent.id);

    // Step 1: Minor decay
    const step1 = PermanenceEngine.applyPermanenceDecay(db, {
      project,
      decay_rate: 0.2,
      unseen_for_ms: 3600 * 1000,
      min_confidence_threshold: 0.5,
    });

    expect(step1.decayed_count).toBe(1);
    expect(step1.updated_entities[0].confidence).toBeCloseTo(0.8, 2);
    expect(step1.updated_entities[0].status).toBe('active');

    // Step 2: Decay past threshold (0.5) -> becomes hidden
    const step2 = PermanenceEngine.applyPermanenceDecay(db, {
      project,
      decay_rate: 0.4,
      unseen_for_ms: 3600 * 1000,
      min_confidence_threshold: 0.5,
    });

    expect(step2.decayed_count).toBe(1);
    expect(step2.updated_entities[0].confidence).toBeCloseTo(0.4, 2);
    expect(step2.updated_entities[0].status).toBe('hidden');

    // Step 3: Decay past lost threshold (<=0.05) -> becomes lost
    db.prepare("UPDATE entities SET status = 'active', confidence = 0.1 WHERE id = ?").run(ent.id);

    const step3 = PermanenceEngine.applyPermanenceDecay(db, {
      project,
      decay_rate: 0.08,
      unseen_for_ms: 1000,
      min_confidence_threshold: 0.2,
    });

    expect(step3.decayed_count).toBe(1);
    expect(step3.lost_count).toBe(1);
    expect(step3.updated_entities[0].confidence).toBeCloseTo(0.02, 2);
    expect(step3.updated_entities[0].status).toBe('lost');
  });

  it('re-observes entity and restores confidence to 1.0 and status to active', () => {
    const ent = EntityStore.addEntity(db, {
      project,
      name: 'Keycard',
      type: 'item',
      position: { x: 2, y: 1, z: 0 },
      confidence: 0.1,
    });
    db.prepare("UPDATE entities SET status = 'hidden' WHERE id = ?").run(ent.id);

    PermanenceEngine.reObserveEntity(db, {
      project,
      entity_id: ent.id,
      visual_state_id: 'vs_cam_01',
    });

    const refreshed = EntityStore.getEntity(db, { project, id: ent.id });
    expect(refreshed?.confidence).toBe(1.0);
    expect(refreshed?.status).toBe('active');

    // History event logged
    const history = getEntityHistory(db, { project, entity_id: ent.id });
    expect(history.some((h) => h.action === 're_identified')).toBe(true);
  });

  it('computes accurate decay stats across active, hidden, lost, and destroyed entities', () => {
    EntityStore.addEntity(db, { project, name: 'E1', type: 'item', confidence: 1.0 });
    EntityStore.addEntity(db, { project, name: 'E2', type: 'item', confidence: 0.8 });
    const e3 = EntityStore.addEntity(db, { project, name: 'E3', type: 'item', confidence: 0.3 });
    const e4 = EntityStore.addEntity(db, { project, name: 'E4', type: 'item', confidence: 0.04 });
    const e5 = EntityStore.addEntity(db, { project, name: 'E5', type: 'item', confidence: 0.0 });

    db.prepare("UPDATE entities SET status = 'hidden' WHERE id = ?").run(e3.id);
    db.prepare("UPDATE entities SET status = 'lost' WHERE id = ?").run(e4.id);
    db.prepare("UPDATE entities SET status = 'destroyed' WHERE id = ?").run(e5.id);

    const stats = PermanenceEngine.getDecayStats(db, { project });
    expect(stats.total_tracked).toBe(5);
    expect(stats.active_count).toBe(2);
    expect(stats.hidden_count).toBe(1);
    expect(stats.lost_count).toBe(1);
    expect(stats.destroyed_count).toBe(1);
    expect(stats.avg_confidence).toBeCloseTo((1.0 + 0.8 + 0.3 + 0.04 + 0.0) / 5, 2);
  });
});
