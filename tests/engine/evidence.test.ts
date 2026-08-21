import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/engine/migrations.js';
import { EvidenceEngine } from '../../src/engine/evidence.js';
import { EntityStore } from '../../src/engine/entity-store.js';

describe('EvidenceEngine (Cryptographic Spatial Evidence Packs)', () => {
  let db: Database.Database;
  const project = 'test-evidence';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  it('should create a valid SHA-256 evidence pack with state memory tool calls', () => {
    const chest = EntityStore.addEntity(db, {
      project,
      name: 'Treasure Chest',
      type: 'container',
      position: { x: 10, y: 0, z: 5 },
    });

    const pack = EvidenceEngine.createEvidencePack(db, {
      project,
      task_id: 'task_001',
      entity_ids: [chest.id],
      linked_state_memory_nodes: { task_ids: ['task_001'] },
    });

    expect(pack.id).toBeDefined();
    expect(pack.payload_hash).toHaveLength(64); // SHA-256 hex string
    expect(pack.entities_snapshot.length).toBe(1);
    expect(pack.state_memory_tool_calls).toBeDefined();
    expect(pack.state_memory_tool_calls?.mcp_tool_call?.arguments).toMatchObject({
      action: 'create',
      type: 'artifact',
    });

    const verified = EvidenceEngine.verifyEvidencePack(db, { project, id: pack.id });
    expect(verified.valid).toBe(true);

    const list = EvidenceEngine.listEvidencePacks(db, { project });
    expect(list.length).toBe(1);
  });
});
