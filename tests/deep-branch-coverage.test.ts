import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/engine/migrations.js';
import { EntityStore } from '../src/engine/entity-store.js';
import { SpatialGraph } from '../src/engine/spatial-graph.js';
import { SnapshotEngine } from '../src/engine/snapshots.js';
import { TimeTravelEngine } from '../src/engine/time-travel.js';
import {
  logEntityEvent,
  verifyEventAuditChain,
  repairEventAuditChain,
} from '../src/engine/events.js';
import { getWorldSummary } from '../src/engine/summary.js';
import { z } from '../src/schema/schemas.js';
import { registerAllTools } from '../src/tools/handlers.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

describe('Deep Branch Coverage Suite', () => {
  let db: Database.Database;
  const project = 'deep-branch-project';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('1. SnapshotEngine diffSnapshots & restore branches', () => {
    it('covers all diffing branches: added, removed, displaced entities, and relations', () => {
      // Base state: ent1 and ent2
      const e1 = EntityStore.addEntity(db, {
        project,
        name: 'Entity 1',
        type: 'agent',
        position: { x: 0, y: 0, z: 0 },
      });
      const e2 = EntityStore.addEntity(db, {
        project,
        name: 'Entity 2',
        type: 'item',
        position: { x: 5, y: 0, z: 5 },
      });
      SpatialGraph.setRelation(db, {
        project,
        source_id: e1.id,
        relation: 'near',
        target_id: e2.id,
      });

      // Save Snapshot A
      SnapshotEngine.saveSnapshot(db, { project, name: 'snapA', description: 'Snapshot A' });

      // Mutate state: move e1, remove e2, add e3, change relation
      EntityStore.updateEntity(db, {
        project,
        id: e1.id,
        position: { x: 10, y: 0, z: 0 }, // displaced > 0.01m
      });
      EntityStore.removeEntity(db, { project, id: e2.id, hard_delete: true });
      const e3 = EntityStore.addEntity(db, {
        project,
        name: 'Entity 3',
        type: 'landmark',
        position: { x: 20, y: 0, z: 20 },
      });
      SpatialGraph.setRelation(db, {
        project,
        source_id: e1.id,
        relation: 'facing',
        target_id: e3.id,
      });

      // Save Snapshot B
      SnapshotEngine.saveSnapshot(db, { project, name: 'snapB', description: 'Snapshot B' });

      // Diff Snapshot A and B
      const diff = SnapshotEngine.diffSnapshots(db, {
        project,
        snapshot_a: 'snapA',
        snapshot_b: 'snapB',
      });

      expect(diff.displaced_entities.length).toBe(1);
      expect(diff.displaced_entities[0].id).toBe(e1.id);
      expect(diff.displaced_entities[0].distance).toBeCloseTo(10, 1);
      expect(diff.removed_entities.some((e) => e.id === e2.id)).toBe(true);
      expect(diff.added_entities.some((e) => e.id === e3.id)).toBe(true);
      expect(diff.added_relations.length).toBeGreaterThan(0);
      expect(diff.removed_relations.length).toBeGreaterThan(0);

      // Restore Snapshot A
      const restored = SnapshotEngine.restoreSnapshot(db, { project, name: 'snapA' });
      expect(restored.restored_entities).toBe(2);
      expect(restored.restored_relations).toBe(1);

      // Error when snapshots don't exist
      expect(() =>
        SnapshotEngine.diffSnapshots(db, { project, snapshot_a: 'missingA', snapshot_b: 'snapB' })
      ).toThrow();
      expect(() => SnapshotEngine.restoreSnapshot(db, { project, name: 'missingSnap' })).toThrow();
    });
  });

  describe('2. SpatialGraph removeRelation & topological traversal branches', () => {
    it('covers removeRelation without specific relation and with inverse deletion', () => {
      const e1 = EntityStore.addEntity(db, { project, name: 'A', type: 'object' });
      const e2 = EntityStore.addEntity(db, { project, name: 'B', type: 'object' });

      SpatialGraph.setRelation(db, {
        project,
        source_id: e1.id,
        relation: 'on',
        target_id: e2.id,
        bidirectional: true,
      });

      // removeRelation without specific relation, with remove_inverse: true
      const removed = SpatialGraph.removeRelation(db, {
        project,
        source_id: e1.id,
        target_id: e2.id,
        remove_inverse: true,
      });
      expect(removed).toBe(true);

      const relsAfter = SpatialGraph.getRelations(db, { project });
      expect(relsAfter.length).toBe(0);

      // removeRelation with specific relation and remove_inverse: true
      SpatialGraph.setRelation(db, {
        project,
        source_id: e1.id,
        relation: 'contains',
        target_id: e2.id,
        bidirectional: true,
      });
      SpatialGraph.removeRelation(db, {
        project,
        source_id: e1.id,
        relation: 'contains',
        target_id: e2.id,
        remove_inverse: true,
      });
      expect(SpatialGraph.getRelations(db, { project }).length).toBe(0);
    });

    it('covers getRelations as_target and topological graph traversal with allowed_relations', () => {
      const a = EntityStore.addEntity(db, { project, name: 'NodeA', type: 'object' });
      const b = EntityStore.addEntity(db, { project, name: 'NodeB', type: 'object' });
      const c = EntityStore.addEntity(db, { project, name: 'NodeC', type: 'object' });

      SpatialGraph.setRelation(db, { project, source_id: a.id, relation: 'on', target_id: b.id, bidirectional: false });
      SpatialGraph.setRelation(db, { project, source_id: b.id, relation: 'inside', target_id: c.id, bidirectional: false });

      // getRelations as_target: true
      const targetRels = SpatialGraph.getRelations(db, { project, entity_id: b.id, as_target: true });
      expect(targetRels.length).toBe(2);
      expect(targetRels.some((r) => r.source_id === a.id)).toBe(true);

      // traverseTopologicalGraph with allowed_relations filter
      const trav = SpatialGraph.traverseTopologicalGraph(db, {
        project,
        start_entity_id: a.id,
        max_depth: 3,
        allowed_relations: ['on', 'inside'],
      });
      expect(trav.length).toBe(2);
      expect(trav[0].entity_id).toBe(b.id);
      expect(trav[1].entity_id).toBe(c.id);

      // traverseTopologicalGraph with excluded relation
      const travFiltered = SpatialGraph.traverseTopologicalGraph(db, {
        project,
        start_entity_id: a.id,
        max_depth: 3,
        allowed_relations: ['near'],
      });
      expect(travFiltered.length).toBe(0);
    });
  });

  describe('3. verifyEventAuditChain and repairEventAuditChain error & empty branches', () => {
    it('verifies empty project and corrupted chains', () => {
      // Empty project
      const emptyRes = verifyEventAuditChain(db, { project: 'empty-project' });
      expect(emptyRes.valid).toBe(true);
      expect(emptyRes.total_events).toBe(0);

      const emptyRepair = repairEventAuditChain(db, { project: 'empty-project' });
      expect(emptyRepair.repaired).toBe(true);
      expect(emptyRepair.total_events).toBe(0);

      // Create valid events
      const e = EntityStore.addEntity(db, { project, name: 'AuditBot', type: 'agent' });
      EntityStore.updateEntity(db, { project, id: e.id, position: { x: 1, y: 0, z: 0 } });
      EntityStore.updateEntity(db, { project, id: e.id, position: { x: 2, y: 0, z: 0 } });

      const validRes = verifyEventAuditChain(db, { project });
      expect(validRes.valid).toBe(true);

      // Corrupt a prev_hash
      db.prepare("UPDATE entity_history SET prev_hash = 'badprevhash' WHERE rowid = 2 AND project = ?").run(project);
      const corruptPrev = verifyEventAuditChain(db, { project });
      expect(corruptPrev.valid).toBe(false);
      expect(corruptPrev.error).toContain('Broken hash link');

      // Repair it
      const repRes = repairEventAuditChain(db, { project });
      expect(repRes.repaired).toBe(true);
      expect(verifyEventAuditChain(db, { project }).valid).toBe(true);

      // Corrupt a hash signature
      db.prepare("UPDATE entity_history SET hash = 'badhashsignature' WHERE rowid = 2 AND project = ?").run(project);
      const corruptHash = verifyEventAuditChain(db, { project });
      expect(corruptHash.valid).toBe(false);
      expect(corruptHash.error).toContain('Invalid hash signature');

      // Repair again
      repairEventAuditChain(db, { project });
      expect(verifyEventAuditChain(db, { project }).valid).toBe(true);
    });
  });

  describe('4. TimeTravelEngine destroyed entities and timestamp filtering', () => {
    it('reconstructs state at timestamp skipping destroyed entities', () => {
      // Direct insertion into entity_history with deterministic timestamps
      db.prepare(`
        INSERT INTO entity_history (id, project, entity_id, action, x, y, z, timestamp, prev_hash, hash)
        VALUES
          ('ev1', ?, 'item_1', 'created', 0, 0, 0, '2026-08-20T00:00:00.000Z', '0000', '1111'),
          ('ev2', ?, 'item_2', 'created', 5, 0, 5, '2026-08-20T01:00:00.000Z', '1111', '2222'),
          ('ev3', ?, 'item_2', 'destroyed', null, null, null, '2026-08-20T02:00:00.000Z', '2222', '3333')
      `).run(project, project, project);

      const state1 = TimeTravelEngine.getStateAtTimestamp(db, { project, timestamp: '2026-08-20T00:30:00.000Z' });
      expect(state1.entities.length).toBe(1);
      expect(state1.entities[0].id).toBe('item_1');

      const state2 = TimeTravelEngine.getStateAtTimestamp(db, { project, timestamp: '2026-08-20T01:30:00.000Z' });
      expect(state2.entities.length).toBe(2);

      const state3 = TimeTravelEngine.getStateAtTimestamp(db, { project, timestamp: '2026-08-20T02:30:00.000Z' });
      expect(state3.entities.length).toBe(1);
      expect(state3.entities[0].id).toBe('item_1');
    });
  });

  describe('5. getWorldSummary decayed, lost, and coordinate branches', () => {
    it('covers all summary metrics', () => {
      EntityStore.addEntity(db, { project, name: 'DecayedEnt', type: 'item', confidence: 0.3, position: { x: 5, y: 1, z: 5 } });
      EntityStore.addEntity(db, { project, name: 'LostEnt', type: 'item', status: 'lost', position: { x: -5, y: 0, z: -5 } });
      EntityStore.addEntity(db, { project, name: 'NoCoordEnt', type: 'item' });

      const sum = getWorldSummary(db, { project });
      expect(sum.permanence_health.decayed_entities_count).toBeGreaterThan(0);
      expect(sum.permanence_health.lost_entities_count).toBeGreaterThan(0);
      expect(sum.spatial_bounds).toBeDefined();
      expect(sum.spatial_bounds?.min.x).toBe(-5);
      expect(sum.spatial_bounds?.max.x).toBe(5);
    });
  });

  describe('6. schemas.ts primitive schemas and error branches', () => {
    it('covers all Zod clone, defaults, descriptions, parse, safeParse, and jsonSchema generation', () => {
      // String schema
      const str = z.string().describe('test').default('def').optional();
      expect(str.parse('abc')).toBe('abc');
      expect(str.parse(undefined)).toBe('def');
      expect(str.safeParse(123 as any).success).toBe(false);
      expect(str.toJsonSchema().type).toBe('string');

      // Enum schema
      const en = z.enum(['apple', 'banana'] as const);
      expect(en.parse('apple')).toBe('apple');
      expect(en.safeParse('orange' as any).success).toBe(false);
      expect(en.toJsonSchema().enum).toEqual(['apple', 'banana']);

      // Number schema
      const num = z.number().default(42).optional();
      expect(num.parse(10)).toBe(10);
      expect(num.parse(undefined)).toBe(42);
      expect(num.safeParse('not a number' as any).success).toBe(false);
      expect(num.toJsonSchema().type).toBe('number');

      // Boolean schema
      const bool = z.boolean().default(true).optional();
      expect(bool.parse(false)).toBe(false);
      expect(bool.parse(undefined)).toBe(true);
      expect(bool.safeParse('not boolean' as any).success).toBe(false);
      expect(bool.toJsonSchema().type).toBe('boolean');

      // Array schema
      const arr = z.array(z.string()).default(['x']).optional();
      expect(arr.parse(['a', 'b'])).toEqual(['a', 'b']);
      expect(arr.parse(undefined)).toEqual(['x']);
      expect(arr.safeParse('not array' as any).success).toBe(false);
      expect(arr.toJsonSchema().type).toBe('array');

      // Object schema
      const obj = z.object({
        name: z.string(),
        count: z.number().optional(),
      });
      expect(obj.parse({ name: 'test' })).toEqual({ name: 'test' });
      expect(obj.safeParse('not obj' as any).success).toBe(false);
      expect(obj.safeParse({ missingName: true } as any).success).toBe(false);
      expect(obj.toJsonSchema().type).toBe('object');
    });
  });

  describe('7. MCP Tool Handlers for all remaining consolidated tools', () => {
    it('executes ingest_observation, get_expected_view, manage_spatial_spec, use_spatial_blackboard, create_evidence_pack, and wait_for_spatial_state via MCP client', async () => {
      const srv = new McpServer({ name: 'deep-tools-srv', version: '0.1.0' });
      registerAllTools(srv);

      const [cTransport, sTransport] = InMemoryTransport.createLinkedPair();
      await srv.connect(sTransport);
      const client = new Client({ name: 'client', version: '0.1.0' }, { capabilities: {} });
      await client.connect(cTransport);

      // 1. ingest_observation with reconcile: true
      const obsRes = await client.callTool({
        name: 'ingest_observation',
        arguments: {
          project,
          reconcile: true,
          observer_pose: {
            position: { x: 0, y: 5, z: 0 },
            orientation: { pitch: 0, yaw: 0, roll: 0 },
          },
          detections: [
            { label: 'Chest', confidence: 0.9, bounding_box_2d: { x: 100, y: 100, width: 50, height: 50 } },
          ],
        },
      });
      expect(obsRes.isError).toBeFalsy();

      // 2. get_expected_view
      const viewRes = await client.callTool({
        name: 'get_expected_view',
        arguments: {
          project,
          observer_position: { x: 0, y: 0, z: 0 },
          observer_orientation: { pitch: 0, yaw: 0, roll: 0 },
          fov_horizontal_degrees: 90,
        },
      });
      expect(viewRes.isError).toBeFalsy();

      // 3. manage_spatial_spec: set, verify, list
      const specSet = await client.callTool({
        name: 'manage_spatial_spec',
        arguments: {
          project,
          action: 'set',
          name: 'safe_zone',
          constraints: [{ type: 'min_clearance', value: 2.0 }],
        },
      });
      expect(specSet.isError).toBeFalsy();

      const specVerify = await client.callTool({
        name: 'manage_spatial_spec',
        arguments: { project, action: 'verify', name: 'safe_zone' },
      });
      expect(specVerify.isError).toBeFalsy();

      const specList = await client.callTool({
        name: 'manage_spatial_spec',
        arguments: { project, action: 'list' },
      });
      expect(specList.isError).toBeFalsy();

      // 4. use_spatial_blackboard: post, claim, release, read
      const bbPost = await client.callTool({
        name: 'use_spatial_blackboard',
        arguments: {
          project,
          action: 'post',
          sender: 'agent_1',
          topic: 'intentions',
          payload: { intent: 'Exploring northern sector' },
        },
      });
      expect(bbPost.isError).toBeFalsy();

      const bbLock = await client.callTool({
        name: 'use_spatial_blackboard',
        arguments: {
          project,
          action: 'claim',
          sender: 'agent_1',
          resource_id: 'door_sector_1',
          duration_seconds: 30,
        },
      });
      expect(bbLock.isError).toBeFalsy();

      const bbRelease = await client.callTool({
        name: 'use_spatial_blackboard',
        arguments: {
          project,
          action: 'release',
          sender: 'agent_1',
          resource_id: 'door_sector_1',
        },
      });
      expect(bbRelease.isError).toBeFalsy();

      const bbRead = await client.callTool({
        name: 'use_spatial_blackboard',
        arguments: { project, action: 'read' },
      });
      expect(bbRead.isError).toBeFalsy();

      // 5. create_evidence_pack
      const evPack = await client.callTool({
        name: 'create_evidence_pack',
        arguments: { project, task_id: 'task_evidence_test' },
      });
      expect(evPack.isError).toBeFalsy();

      // 6. wait_for_spatial_state
      const bot = EntityStore.addEntity(db, { project, name: 'WaitBot', type: 'agent', status: 'active' });
      const waitRes = await client.callTool({
        name: 'wait_for_spatial_state',
        arguments: {
          project,
          entity_id: bot.id,
          condition: 'exists',
          timeout_ms: 100,
        },
      });
      expect(waitRes.isError).toBeFalsy();

      await client.close();
      await srv.close();
    });
  });
});
