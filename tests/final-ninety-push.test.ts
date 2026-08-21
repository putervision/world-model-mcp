import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/engine/migrations.js';
import { EntityStore } from '../src/engine/entity-store.js';
import { EvidenceEngine } from '../src/engine/evidence.js';
import { registerAllTools } from '../src/tools/handlers.js';
import { getDb } from '../src/engine/db.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

describe('Final Push to >90% Branch Coverage', () => {
  let db: Database.Database;
  const project = 'final-push-project';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('1. EvidenceEngine entity_ids filter, null observation fields, hash mismatch, and list', () => {
    it('exercises all branches of EvidenceEngine', () => {
      const e = EntityStore.addEntity(db, { project, name: 'RealEnt', type: 'object' });

      // 1. Observation with null pose, null fov, null reconcile report
      db.prepare(`
        INSERT INTO observations (
          id, project, visual_state_id, raw_detections_json, timestamp
        ) VALUES ('obs_sparse', ?, 'vs_1', '[]', '2026-08-20T00:00:00.000Z')
      `).run(project);

      // Create evidence pack with entity_ids containing both real and missing IDs
      const pack = EvidenceEngine.createEvidencePack(db, {
        project,
        entity_ids: [e.id, 'missing_entity_id'],
        observation_ids: ['obs_sparse'],
      });
      expect(pack.entity_ids.length).toBe(1);
      expect(pack.observations_snapshot?.length).toBe(1);
      expect(pack.observations_snapshot![0].observer_pose).toBeUndefined();

      // Verify valid
      const verValid = EvidenceEngine.verifyEvidencePack(db, { project, id: pack.id });
      expect(verValid.valid).toBe(true);

      // Corrupt payload_json to test hash mismatch branch
      db.prepare("UPDATE evidence_packs SET sha256_hash = 'badhash' WHERE id = ?").run(pack.id);
      const verBad = EvidenceEngine.verifyEvidencePack(db, { project, id: pack.id });
      expect(verBad.valid).toBe(false);
      expect(verBad.message).toContain('FAILED verification');

      // List packs with and without task_id
      const listPacks = EvidenceEngine.listEvidencePacks(db, { project });
      expect(listPacks.length).toBe(1);
      expect(listPacks[0].task_id).toBeUndefined();
    });
  });

  describe('2. MCP Tool Handlers set_relation bidirectional/offset/distance and query_entities filters', () => {
    it('calls set_relation with bidirectional, offset, distance and query_entities with fts query and region', async () => {
      const toolDb = getDb(project);
      const srv = new McpServer({ name: 'final-tool-srv', version: '0.1.0' });
      registerAllTools(srv);

      const [cTransport, sTransport] = InMemoryTransport.createLinkedPair();
      await srv.connect(sTransport);
      const client = new Client({ name: 'client', version: '0.1.0' }, { capabilities: {} });
      await client.connect(cTransport);

      const a = EntityStore.addEntity(toolDb, { project, name: 'Alpha Bot', type: 'agent', position: { x: 0, y: 0, z: 0 } });
      const b = EntityStore.addEntity(toolDb, { project, name: 'Beta Bot', type: 'agent', position: { x: 10, y: 0, z: 0 } });

      // set_relation with bidirectional, offset, distance, metadata
      const relRes = await client.callTool({
        name: 'set_relation',
        arguments: {
          project,
          source_id: a.id,
          relation: 'facing',
          target_id: b.id,
          bidirectional: true,
          offset: { x: 10, y: 0, z: 0 },
          distance: 10.0,
          metadata: { connection: 'direct_sight' },
        },
      });
      expect(relRes.isError).toBeFalsy();

      // query_entities with fts query, region_id, min_confidence
      const qRes = await client.callTool({
        name: 'query_entities',
        arguments: {
          project,
          query: 'Alpha',
          min_confidence: 0.5,
        },
      });
      expect(qRes.isError).toBeFalsy();

      // query_entities non-existent entity_id
      const notFoundRes = await client.callTool({
        name: 'query_entities',
        arguments: {
          project,
          entity_id: 'missing_id_123',
        },
      });
      expect(notFoundRes.isError).toBe(true);

      await client.close();
      await srv.close();
    });
  });
});
