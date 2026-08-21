import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/engine/migrations.js';
import { EntityStore } from '../../src/engine/entity-store.js';
import { SpatialGraph } from '../../src/engine/spatial-graph.js';
import { EvidenceEngine, canonicalJsonStringify } from '../../src/engine/evidence.js';

describe('EvidenceEngine Verification Suite', () => {
  let db: Database.Database;
  const project = 'evidence-verification-project';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('produces canonical, deterministic JSON across differently ordered keys', () => {
    const objA = { z: 1, a: 2, m: { y: 'bar', x: 'foo' }, arr: [1, 2] };
    const objB = { a: 2, arr: [1, 2], m: { x: 'foo', y: 'bar' }, z: 1 };

    expect(canonicalJsonStringify(objA)).toBe(canonicalJsonStringify(objB));
    expect(canonicalJsonStringify(null)).toBe('null');
    expect(canonicalJsonStringify(42)).toBe('42');
  });

  it('creates cryptographically signed evidence packs with state memory instructions', () => {
    const e1 = EntityStore.addEntity(db, {
      project,
      name: 'RoverCore',
      type: 'agent',
      position: { x: 10, y: 0, z: 10 },
    });

    const e2 = EntityStore.addEntity(db, {
      project,
      name: 'SampleCache',
      type: 'container',
      position: { x: 12, y: 0, z: 10 },
    });

    SpatialGraph.setRelation(db, {
      project,
      source_id: e1.id,
      relation: 'near',
      target_id: e2.id,
      distance: 2.0,
    });

    const pack = EvidenceEngine.createEvidencePack(db, {
      project,
      task_id: 'task_navigate_and_secure',
      entity_ids: [e1.id, e2.id],
      linked_state_memory_nodes: {
        task_ids: ['task_navigate_and_secure'],
        decision_ids: ['dec_secure_cache_01'],
      },
    });

    expect(pack.id).toBeDefined();
    expect(pack.payload_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(pack.entities_snapshot.length).toBe(2);
    expect(pack.relations_snapshot.length).toBe(1);
    expect(pack.state_memory_tool_calls?.mcp_tool_call?.server).toBe('state-memory-mcp');
    expect((pack.state_memory_tool_calls?.link_tool_call?.arguments as any)?.source_id).toBe(
      'task_navigate_and_secure'
    );

    // Verify evidence pack
    const verification = EvidenceEngine.verifyEvidencePack(db, {
      project,
      id: pack.id,
    });

    expect(verification.valid).toBe(true);
    expect(verification.calculated_hash).toBe(pack.payload_hash);
    expect(verification.message).toContain('verified successfully');
  });

  it('detects tampering when database payload is altered', () => {
    const e1 = EntityStore.addEntity(db, {
      project,
      name: 'VaultKey',
      type: 'item',
      position: { x: 0, y: 0, z: 0 },
    });

    const pack = EvidenceEngine.createEvidencePack(db, {
      project,
      task_id: 'task_auth',
      entity_ids: [e1.id],
    });

    // Tamper with the stored payload in SQLite directly
    db.prepare(
      "UPDATE evidence_packs SET payload_json = replace(payload_json, 'VaultKey', 'TamperedKey') WHERE id = ?"
    ).run(pack.id);

    const check = EvidenceEngine.verifyEvidencePack(db, {
      project,
      id: pack.id,
    });

    expect(check.valid).toBe(false);
    expect(check.calculated_hash).not.toBe(pack.payload_hash);
    expect(check.message).toContain('FAILED verification');
  });

  it('lists evidence packs correctly', async () => {
    EvidenceEngine.createEvidencePack(db, { project, task_id: 'task_1' });
    await new Promise((r) => setTimeout(r, 10));
    EvidenceEngine.createEvidencePack(db, { project, task_id: 'task_2' });

    const list = EvidenceEngine.listEvidencePacks(db, { project });
    expect(list.length).toBe(2);
    expect(list.some((p) => p.task_id === 'task_1')).toBe(true);
    expect(list.some((p) => p.task_id === 'task_2')).toBe(true);
  });

  it('throws error when verifying nonexistent evidence pack', () => {
    expect(() => {
      EvidenceEngine.verifyEvidencePack(db, { project, id: 'nonexistent_pack' });
    }).toThrow('not found');
  });
});
