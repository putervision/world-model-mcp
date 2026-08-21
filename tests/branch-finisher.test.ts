import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/engine/migrations.js';
import { getDb } from '../src/engine/db.js';
import { EntityStore } from '../src/engine/entity-store.js';
import { SpatialGraph } from '../src/engine/spatial-graph.js';
import { SnapshotEngine } from '../src/engine/snapshots.js';
import { TimeTravelEngine } from '../src/engine/time-travel.js';
import { SpatialSpecEngine } from '../src/engine/spatial-spec.js';
import { PermanenceEngine } from '../src/engine/permanence.js';
import { NavigationEngine } from '../src/engine/navigation.js';
import { GameControlsEngine } from '../src/engine/game-controls.js';
import { exportWorldModel } from '../src/engine/export.js';
import { computeScreenBoundingBox } from '../src/utils/projection.js';
import { z } from '../src/schema/schemas.js';
import { registerAllTools } from '../src/tools/handlers.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

describe('Branch Finisher Suite (Targeting >90% Branch Coverage)', () => {
  let db: Database.Database;
  const project = 'branch-finisher-project';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('1. projection.ts computeScreenBoundingBox behind camera', () => {
    it('returns undefined when all 3D box corners are behind camera', () => {
      const camera = {
        position: { x: 0, y: 0, z: 0 },
        orientation: { pitch: 0, yaw: 0, roll: 0 }, // looking towards +Z
        fov_degrees: 60,
      };
      const viewport = { width: 1920, height: 1080 };

      // Box placed behind camera (Z = -20)
      const bbox = computeScreenBoundingBox(
        { x: 0, y: 0, z: -20 },
        { width: 2, height: 2, depth: 2 },
        camera,
        viewport
      );
      expect(bbox).toBeUndefined();
    });
  });

  describe('2. snapshots.ts diffSnapshots without positions', () => {
    it('diffs snapshots where entities have no position', () => {
      EntityStore.addEntity(db, { project, name: 'AbstractA', type: 'object' });
      SnapshotEngine.saveSnapshot(db, { project, name: 'snap_nopos_1' });

      EntityStore.addEntity(db, { project, name: 'AbstractB', type: 'object' });
      SnapshotEngine.saveSnapshot(db, { project, name: 'snap_nopos_2' });

      const diff = SnapshotEngine.diffSnapshots(db, {
        project,
        snapshot_a: 'snap_nopos_1',
        snapshot_b: 'snap_nopos_2',
      });
      expect(diff.displaced_entities.length).toBe(0);
      expect(diff.added_entities.length).toBe(1);
    });
  });

  describe('3. time-travel.ts undoMutation when prevEvent is not found', () => {
    it('handles undoMutation when only a single non-created event exists', () => {
      // Direct insertion of a single 'moved' event without 'created'
      db.prepare(`
        INSERT INTO entity_history (id, project, entity_id, action, x, y, z, timestamp, prev_hash, hash)
        VALUES ('ev_orphan_move', ?, 'orphan_bot', 'moved', 10, 0, 10, '2026-08-20T00:00:00.000Z', '0000', '1111')
      `).run(project);

      // Create entity in entities table
      db.prepare(`
        INSERT INTO entities (id, project, name, type, status, x, y, z, last_seen_at, created_at, updated_at)
        VALUES ('orphan_bot', ?, 'OrphanBot', 'agent', 'active', 10, 0, 10, '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z')
      `).run(project);

      const undoRes = TimeTravelEngine.undoMutation(db, { project, entity_id: 'orphan_bot' });
      expect(undoRes.success).toBe(true);
      expect(undoRes.message).toContain('Removed entity');

      // Verify entity was removed
      expect(EntityStore.getEntity(db, { project, id: 'orphan_bot' })).toBeNull();
    });

    it('filters relations in getStateAtTimestamp', () => {
      const e1 = EntityStore.addEntity(db, { project, name: 'R1', type: 'object' });
      const e2 = EntityStore.addEntity(db, { project, name: 'R2', type: 'object' });

      db.prepare(`
        INSERT INTO entity_history (id, project, entity_id, action, timestamp, prev_hash, hash)
        VALUES ('ev_r1', ?, 'R1', 'created', '2026-08-20T00:00:00.000Z', '0000', '1111')
      `).run(project);

      db.prepare(`
        INSERT INTO spatial_relations (id, project, source_id, relation, target_id, created_at, updated_at)
        VALUES
          ('rel_past', ?, ?, 'near', ?, '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'),
          ('rel_future', ?, ?, 'on', ?, '2026-08-20T02:00:00.000Z', '2026-08-20T02:00:00.000Z')
      `).run(project, e1.id, e2.id, project, e1.id, e2.id);

      const statePast = TimeTravelEngine.getStateAtTimestamp(db, { project, timestamp: '2026-08-20T01:00:00.000Z' });
      expect(statePast.relations.length).toBe(1);
      expect(statePast.relations[0].id).toBe('rel_past');
    });
  });

  describe('4. spatial-spec.ts missing entity and missing region error branches', () => {
    it('records error violations for missing entities and missing regions across all constraint types', () => {
      SpatialSpecEngine.setSpatialSpec(db, {
        project,
        name: 'spec_missing',
        constraints: [
          { type: 'min_clearance', entity_id: 'ghost_1', target_id: 'ghost_2', value: 2.0 },
          { type: 'max_distance', entity_id: 'ghost_1', target_id: 'ghost_2', value: 5.0 },
          { type: 'inside_region', entity_id: 'ghost_1', region_id: 'ghost_reg' },
        ],
      });

      const res = SpatialSpecEngine.verifySpatialSpec(db, { project, name: 'spec_missing' });
      expect(res.is_compliant).toBe(false);
      expect(res.violations.length).toBe(3);
    });
  });

  describe('5. permanence.ts getDecayStats on empty project', () => {
    it('returns avg_confidence 1.0 when no entities exist', () => {
      const stats = PermanenceEngine.getDecayStats(db, { project: 'empty-decay-project' });
      expect(stats.total_tracked).toBe(0);
      expect(stats.avg_confidence).toBe(1.0);
    });
  });

  describe('6. exportWorldModel with default bounding boxes and missing positions', () => {
    it('exports gltf and obj with undefined bounding_box and undefined position', () => {
      EntityStore.addEntity(db, {
        project,
        name: 'NoBBoxEntity',
        type: 'item',
        position: { x: 1, y: 1, z: 1 },
        // bounding_box omitted -> defaults to 1, 1, 1
      });

      EntityStore.addEntity(db, {
        project,
        name: 'NoPositionEntity',
        type: 'item',
        // position omitted -> obj skips it
      });

      const gltf = exportWorldModel(db, { project, format: 'gltf' });
      expect(gltf.nodes.length).toBe(1);

      const obj = exportWorldModel(db, { project, format: 'obj' });
      expect(obj).toContain('o NoBBoxEntity_');
    });
  });

  describe('7. NavigationEngine validation errors on missing start/target entities', () => {
    it('throws ValidationError when start or target entity ID is not found', () => {
      expect(() =>
        NavigationEngine.getNavigationHints(db, { project, start_entity_id: 'non_existent_start' })
      ).toThrow();

      expect(() =>
        NavigationEngine.getNavigationHints(db, { project, target_entity_id: 'non_existent_target' })
      ).toThrow();
    });
  });

  describe('8. GameControlsEngine script generation (mouse_move, click canvas, wait)', () => {
    it('generates Playwright scripts for mouse_move, canvas click, and wait actions', () => {
      const script = GameControlsEngine.generateInputs({
        current_position: { x: 0, y: 0, z: 0 },
        target_position: { x: 0, y: 5, z: 10 },
        control_profile: {
          scheme: 'wasd',
          use_mouse_look: true,
          mouse_sensitivity: 2.0,
        },
      });

      expect(script.playwright_script).toContain('executeGameNavigation');
      expect(script.actions.some((a) => a.type === 'key_press' && a.key === 'Space')).toBe(true); // jumped dy > 0.4
    });
  });

  describe('9. schemas.ts optional primitives without default and RecordSchema', () => {
    it('covers optional booleans, arrays, records without default values', () => {
      // Optional boolean without default
      const optBool = z.boolean().optional();
      expect(optBool.parse(undefined)).toBeUndefined();
      expect(() => z.boolean().parse(undefined)).toThrow();
      expect(() => z.boolean().parse('not bool')).toThrow();

      // Optional array without default
      const optArr = z.array(z.string()).optional();
      expect(optArr.parse(undefined)).toBeUndefined();
      expect(() => z.array(z.string()).parse(undefined)).toThrow();

      // RecordSchema
      const rec = z.record(z.number());
      expect(rec.parse({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
      expect(() => rec.parse(undefined)).toThrow();
      expect(() => rec.parse('not obj')).toThrow();

      const optRec = z.record(z.number()).optional();
      expect(optRec.parse(undefined)).toBeUndefined();
    });
  });

  describe('10. MCP Tool Handlers remaining actions and branches', () => {
    it('calls update_entity with remove: true, query_entities filters, and manage_snapshot time_travel', async () => {
      const toolDb = getDb(project);
      const srv = new McpServer({ name: 'finisher-srv', version: '0.1.0' });
      registerAllTools(srv);

      const [cTransport, sTransport] = InMemoryTransport.createLinkedPair();
      await srv.connect(sTransport);
      const client = new Client({ name: 'client', version: '0.1.0' }, { capabilities: {} });
      await client.connect(cTransport);

      // 1. update_entity updating existing entity
      const e = EntityStore.addEntity(toolDb, { project, name: 'ToUpdate', type: 'item' });
      const updateRes = await client.callTool({
        name: 'update_entity',
        arguments: { project, id: e.id, name: 'UpdatedName', type: 'item', status: 'hidden' },
      });
      expect(updateRes.isError).toBeFalsy();

      // 2. query_entities with all filters (type, status, tags, min_confidence, near_position)
      const qRes = await client.callTool({
        name: 'query_entities',
        arguments: {
          project,
          type: 'agent',
          status: 'active',
          tags: ['hero'],
          min_confidence: 0.5,
          near_position: { x: 0, y: 0, z: 0 },
          max_distance: 100,
        },
      });
      expect(qRes.isError).toBeFalsy();

      // 3. get_spatial_map in geojson format
      const geoRes = await client.callTool({
        name: 'get_spatial_map',
        arguments: { project, format: 'geojson' },
      });
      expect(geoRes.isError).toBeFalsy();

      // 4. manage_snapshot with action: 'time_travel'
      const ttRes = await client.callTool({
        name: 'manage_snapshot',
        arguments: { project, action: 'time_travel', timestamp: new Date().toISOString() },
      });
      expect(ttRes.isError).toBeFalsy();

      // 5. simulate_movement with target_position and collisions
      const moveEnt = EntityStore.addEntity(toolDb, { project, name: 'Mover', type: 'agent', position: { x: 0, y: 0, z: 0 } });
      const simRes = await client.callTool({
        name: 'simulate_movement',
        arguments: {
          project,
          entity_id: moveEnt.id,
          target_position: { x: 5, y: 0, z: 5 },
          check_collisions: true,
        },
      });
      expect(simRes.isError).toBeFalsy();

      await client.close();
      await srv.close();
    });
  });
});
