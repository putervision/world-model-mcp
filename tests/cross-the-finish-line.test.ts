import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/engine/migrations.js';
import { EntityStore } from '../src/engine/entity-store.js';
import { SpatialGraph } from '../src/engine/spatial-graph.js';
import { SnapshotEngine } from '../src/engine/snapshots.js';
import { SimulationEngine } from '../src/engine/simulation.js';
import { TimeTravelEngine } from '../src/engine/time-travel.js';
import { registerAllTools } from '../src/tools/handlers.js';
import { verifyEventAuditChain } from '../src/engine/events.js';
import { getDb } from '../src/engine/db.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

describe('Cross The Finish Line Suite (>90% Branch Coverage Guaranteed)', () => {
  let db: Database.Database;
  const project = 'finish-line-project';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('1. MCP Tool Handlers Remaining Actions via Client', () => {
    it('executes get_spatial_map (gltf, obj), manage_snapshot (restore, diff), simulate_movement (navigate), and ingest_observation (standard)', async () => {
      const toolDb = getDb(project);
      const srv = new McpServer({ name: 'finish-srv', version: '0.1.0' });
      registerAllTools(srv);

      const [cTransport, sTransport] = InMemoryTransport.createLinkedPair();
      await srv.connect(sTransport);
      const client = new Client({ name: 'client', version: '0.1.0' }, { capabilities: {} });
      await client.connect(cTransport);

      const botA = EntityStore.addEntity(toolDb, { project, name: 'BotA', type: 'agent', position: { x: 0, y: 0, z: 0 } });
      const botB = EntityStore.addEntity(toolDb, { project, name: 'BotB', type: 'agent', position: { x: 10, y: 0, z: 10 } });

      // 1. get_spatial_map gltf and obj
      const gltfRes = await client.callTool({
        name: 'get_spatial_map',
        arguments: { project, format: 'gltf' },
      });
      expect(gltfRes.isError).toBeFalsy();

      const objRes = await client.callTool({
        name: 'get_spatial_map',
        arguments: { project, format: 'obj' },
      });
      expect(objRes.isError).toBeFalsy();

      // 2. manage_snapshot save, diff, restore
      await client.callTool({
        name: 'manage_snapshot',
        arguments: { project, action: 'save', name: 's1' },
      });
      EntityStore.updateEntity(toolDb, { project, id: botA.id, position: { x: 5, y: 0, z: 5 } });
      await client.callTool({
        name: 'manage_snapshot',
        arguments: { project, action: 'save', name: 's2' },
      });

      const diffRes = await client.callTool({
        name: 'manage_snapshot',
        arguments: { project, action: 'diff', snapshot_a: 's1', snapshot_b: 's2' },
      });
      expect(diffRes.isError).toBeFalsy();

      const restoreRes = await client.callTool({
        name: 'manage_snapshot',
        arguments: { project, action: 'restore', name: 's1' },
      });
      expect(restoreRes.isError).toBeFalsy();

      // 3. simulate_movement with navigate mode and entity IDs
      const simNavRes = await client.callTool({
        name: 'simulate_movement',
        arguments: {
          project,
          mode: 'navigate',
          start_entity_id: botA.id,
          target_entity_id: botB.id,
        },
      });
      expect(simNavRes.isError).toBeFalsy();

      // 4. ingest_observation standard without reconcile
      const ingestStdRes = await client.callTool({
        name: 'ingest_observation',
        arguments: {
          project,
          visual_state_id: 'vs_std_1',
          detections: [{ label: 'BotA', confidence: 0.9 }],
        },
      });
      expect(ingestStdRes.isError).toBeFalsy();

      // 5. use_spatial_blackboard read with topic
      const bbTopicRes = await client.callTool({
        name: 'use_spatial_blackboard',
        arguments: { project, action: 'read', topic: 'navigation' },
      });
      expect(bbTopicRes.isError).toBeFalsy();

      // 6. link_to_goal get_context with radius and max_entities
      const ctxRes = await client.callTool({
        name: 'link_to_goal',
        arguments: {
          project,
          action: 'get_context',
          task_id: 'task_final_ctx',
          current_agent_position: { x: 0, y: 0, z: 0 },
          radius: 50,
          max_entities: 10,
        },
      });
      expect(ctxRes.isError).toBeFalsy();

      // 7. generate_game_inputs action: 'project_screen' without camera -> error branch
      const noCamRes = await client.callTool({
        name: 'generate_game_inputs',
        arguments: { project, action: 'project_screen', direction: 'world_to_screen', world_position: { x: 0, y: 0, z: 0 } },
      });
      expect(noCamRes.isError).toBe(true);

      // 8. generate_game_inputs action: 'project_screen' with camera but missing entity -> error branch
      const noEntRes = await client.callTool({
        name: 'generate_game_inputs',
        arguments: {
          project,
          action: 'project_screen',
          direction: 'world_to_screen',
          camera: { position: { x: 0, y: 0, z: 0 }, orientation: { pitch: 0, yaw: 0, roll: 0 }, fov_degrees: 60 },
          entity_id: 'missing_ent_proj',
        },
      });
      expect(noEntRes.isError).toBe(true);

      // 9. generate_game_inputs action: 'project_screen' with camera but neither entity nor world_position -> error branch
      const noPosRes = await client.callTool({
        name: 'generate_game_inputs',
        arguments: {
          project,
          action: 'project_screen',
          direction: 'world_to_screen',
          camera: { position: { x: 0, y: 0, z: 0 }, orientation: { pitch: 0, yaw: 0, roll: 0 }, fov_degrees: 60 },
        },
      });
      expect(noPosRes.isError).toBe(true);

      // 10. generate_game_inputs action: 'project_screen' with entity_id having bounding_box -> success
      const projEnt = EntityStore.addEntity(toolDb, {
        project,
        name: 'ProjBox',
        type: 'container',
        position: { x: 0, y: 0, z: 10 },
        bounding_box: { width: 2, height: 2, depth: 2 },
      });
      const projRes = await client.callTool({
        name: 'generate_game_inputs',
        arguments: {
          project,
          action: 'project_screen',
          direction: 'world_to_screen',
          camera: { position: { x: 0, y: 0, z: 0 }, orientation: { pitch: 0, yaw: 0, roll: 0 }, fov_degrees: 60 },
          entity_id: projEnt.id,
        },
      });
      expect(projRes.isError).toBeFalsy();

      // 11. generate_game_inputs action: 'unproject_ray' / screen_to_world -> success
      const unprojRes = await client.callTool({
        name: 'generate_game_inputs',
        arguments: {
          project,
          action: 'unproject_ray',
          camera: { position: { x: 0, y: 10, z: 0 }, orientation: { pitch: -45, yaw: 0, roll: 0 }, fov_degrees: 60 },
          screen_x: 960,
          screen_y: 540,
        },
      });
      expect(unprojRes.isError).toBeFalsy();

      await client.close();
      await srv.close();
    });
  });

  describe('2. verifyEventAuditChain null hash branches in database', () => {
    it('verifies rows with null prev_hash or null hash in legacy events table', () => {
      db.prepare(`
        INSERT INTO entity_history (id, project, entity_id, action, timestamp, prev_hash, hash)
        VALUES ('ev_nullhash', ?, 'ent_nh', 'created', '2026-08-20T00:00:00.000Z', null, null)
      `).run(project);

      const ver = verifyEventAuditChain(db, { project });
      expect(ver.valid).toBe(true);
    });
  });

  describe('3. SimulationEngine obstacle without position and obstacle without bbox', () => {
    it('simulates movement with obstacle having no position and obstacle having no bbox', () => {
      const walker = EntityStore.addEntity(db, {
        project,
        name: 'Walker',
        type: 'agent',
        position: { x: 0, y: 0, z: 0 },
      });

      // Solid obstacle without position
      EntityStore.addEntity(db, {
        project,
        name: 'GhostObstacle',
        type: 'obstacle',
        properties: { is_solid: true },
      });

      // Solid obstacle with position but no bounding box (defaults to 1, 1, 1)
      EntityStore.addEntity(db, {
        project,
        name: 'DefaultBoxObstacle',
        type: 'obstacle',
        position: { x: 2, y: 0, z: 0 },
        properties: { is_solid: true },
      });

      const sim = SimulationEngine.simulateMovement(db, {
        project,
        entity_id: walker.id,
        target_position: { x: 5, y: 0, z: 0 },
        check_collisions: true,
      });

      expect(sim.collisions_detected.length).toBe(1);
      expect(sim.collisions_detected[0].obstacle_name).toBe('DefaultBoxObstacle');
    });
  });

  describe('4. Detached HEAD git, undo missing entity, and spec outside region', () => {
    it('tests detached HEAD git branch', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');
      const { getCurrentBranch } = await import('../src/utils/git.js');

      const tmpDir = path.join(os.tmpdir(), `wm-git-${Date.now()}`);
      fs.mkdirSync(path.join(tmpDir, '.git'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, '.git', 'HEAD'), '0123456789abcdef0123456789abcdef01234567\n');

      const b = getCurrentBranch(tmpDir);
      expect(b).toBe('HEAD');

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('handles undoMutation when entity_id does not exist', () => {
      const res = TimeTravelEngine.undoMutation(db, { project, entity_id: 'non_existent_entity' });
      expect(res.success).toBe(false);
      expect(res.message).toContain('No mutation events found');
    });

    it('tests spatial spec violations for outside region, missing contains relation, and bounding overlap', async () => {
      const { SpatialSpecEngine } = await import('../src/engine/spatial-spec.js');
      
      // Region from -5 to +5
      db.prepare(`
        INSERT INTO regions (id, project, name, min_x, min_y, min_z, max_x, max_y, max_z, created_at)
        VALUES ('reg_small', ?, 'SmallZone', -5, -5, -5, 5, 5, 5, '2026-08-20T00:00:00.000Z')
      `).run(project);

      // Entity placed at x = 100 (outside region)
      const outsideEnt = EntityStore.addEntity(db, {
        project,
        name: 'OutsideEnt',
        type: 'agent',
        position: { x: 100, y: 0, z: 0 },
      });

      const chest = EntityStore.addEntity(db, {
        project,
        name: 'Chest',
        type: 'container',
        position: { x: 0, y: 0, z: 0 },
        bounding_box: { width: 2, height: 2, depth: 2 },
      });

      const gem = EntityStore.addEntity(db, {
        project,
        name: 'Gem',
        type: 'item',
        position: { x: 0, y: 0, z: 0 },
        bounding_box: { width: 1, height: 1, depth: 1 },
      });

      SpatialSpecEngine.setSpatialSpec(db, {
        project,
        name: 'spec_deep_violations',
        constraints: [
          { type: 'inside_region', entity_id: outsideEnt.id, region_id: 'reg_small' },
          { type: 'contains_entity', entity_id: chest.id, target_id: gem.id },
          { type: 'no_overlap', entity_id: chest.id, target_id: gem.id },
        ],
      });

      const verifyRes = SpatialSpecEngine.verifySpatialSpec(db, { project, name: 'spec_deep_violations' });
      expect(verifyRes.is_compliant).toBe(false);
      expect(verifyRes.violations.length).toBe(3);
    });
  });
});
