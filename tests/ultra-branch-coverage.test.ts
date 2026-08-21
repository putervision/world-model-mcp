import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/engine/migrations.js';
import { EntityStore } from '../src/engine/entity-store.js';
import { SpatialGraph } from '../src/engine/spatial-graph.js';
import { PermanenceEngine } from '../src/engine/permanence.js';
import { VisionBridge } from '../src/engine/vision-bridge.js';
import { SimulationEngine } from '../src/engine/simulation.js';
import { NavigationEngine } from '../src/engine/navigation.js';
import { exportTrajectories } from '../src/engine/export.js';
import { waitForSpatialState } from '../src/engine/polling.js';
import { registerAllTools } from '../src/tools/handlers.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

describe('Ultra Branch Coverage Suite', () => {
  let db: Database.Database;
  const project = 'ultra-branch-project';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('1. VisionBridge reconciliation branches (displaced, appeared, confirmed)', () => {
    it('covers all detection reconciliation paths', () => {
      // 1. Existing entity expected in view
      const expectedBot = EntityStore.addEntity(db, {
        project,
        name: 'GuardDroid',
        type: 'agent',
        position: { x: 0, y: 0, z: 10 },
      });

      const matchedByTypeBot = EntityStore.addEntity(db, {
        project,
        name: 'StationaryCrate',
        type: 'container',
        position: { x: 2, y: 0, z: 8 },
      });

      const report = VisionBridge.reconcileObservation(db, {
        project,
        observer_pose: {
          position: { x: 0, y: 0, z: 0 },
          orientation: { pitch: 0, yaw: 0, roll: 0 },
        },
        field_of_view: { fov_horizontal: 90, fov_vertical: 60 },
        detections: [
          // Match by name, but displaced > 2m
          {
            label: 'GuardDroid',
            confidence: 0.95,
            estimated_position: { x: 0, y: 0, z: 15 }, // 5m displacement
          },
          // Match by class_name within 3m
          {
            label: 'MysteryContainer',
            class_name: 'container',
            confidence: 0.88,
            estimated_position: { x: 2.5, y: 0, z: 8.5 }, // < 3m
          },
          // Match by name without estimated_position
          {
            label: 'GuardDroid', // Already matched or second detection
            confidence: 0.8,
          },
          // Unmatched detection -> appeared
          {
            label: 'AlienDrone',
            confidence: 0.99,
            estimated_position: { x: -5, y: 0, z: 12 },
          },
        ],
      });

      expect(report.displaced.length).toBe(1);
      expect(report.displaced[0].entity_id).toBe(expectedBot.id);
      expect(report.confirmed.length).toBeGreaterThan(0);
      expect(report.appeared.some((a) => a.label === 'AlienDrone')).toBe(true);
    });
  });

  describe('2. Permanence decay custom parameters & thresholds', () => {
    it('applies decay with custom decay_rate, unseen_for_ms, and threshold', () => {
      // Direct insertion with past last_seen_at
      const pastIso = new Date(Date.now() - 100000).toISOString();
      db.prepare(`
        INSERT INTO entities (id, project, name, type, status, confidence, last_seen_at, created_at, updated_at)
        VALUES
          ('e_drop_lost', ?, 'WillBeLost', 'object', 'active', 0.1, ?, ?, ?),
          ('e_drop_hidden', ?, 'WillBeHidden', 'object', 'active', 0.4, ?, ?, ?),
          ('e_stay_active', ?, 'WillStayActive', 'object', 'active', 0.9, ?, ?, ?)
      `).run(
        project, pastIso, pastIso, pastIso,
        project, pastIso, pastIso, pastIso,
        project, pastIso, pastIso, pastIso
      );

      const decayRes = PermanenceEngine.applyPermanenceDecay(db, {
        project,
        decay_rate: 0.2,
        unseen_for_ms: 50000,
        min_confidence_threshold: 0.3,
      });

      expect(decayRes.decayed_count).toBe(3);
      expect(decayRes.lost_count).toBe(1);

      const entLost = EntityStore.getEntity(db, { project, id: 'e_drop_lost' });
      expect(entLost?.status).toBe('lost');

      const entHidden = EntityStore.getEntity(db, { project, id: 'e_drop_hidden' });
      expect(entHidden?.status).toBe('hidden');

      const entActive = EntityStore.getEntity(db, { project, id: 'e_stay_active' });
      expect(entActive?.status).toBe('active');
    });
  });

  describe('3. SimulationEngine delta_position, velocity, and error handling', () => {
    it('simulates movement with delta_position, velocity vectors, and throws on missing entity', () => {
      const drone = EntityStore.addEntity(db, {
        project,
        name: 'SimDrone',
        type: 'agent',
        position: { x: 0, y: 0, z: 0 },
      });

      // 1. Simulation with delta_position
      const simDelta = SimulationEngine.simulateMovement(db, {
        project,
        entity_id: drone.id,
        delta_position: { x: 5, y: 0, z: 5 },
      });
      expect(simDelta.projected_position.x).toBe(5);
      expect(simDelta.projected_position.z).toBe(5);

      // 2. Simulation with velocity and duration
      const simVel = SimulationEngine.simulateMovement(db, {
        project,
        entity_id: drone.id,
        velocity: { x: 2, y: 1, z: 0 },
        duration_seconds: 3,
      });
      expect(simVel.projected_position.x).toBe(6);
      expect(simVel.projected_position.y).toBe(3);

      // 3. Error on missing entity
      expect(() =>
        SimulationEngine.simulateMovement(db, {
          project,
          entity_id: 'missing_drone',
          delta_position: { x: 1, y: 0, z: 0 },
        })
      ).toThrow();
    });
  });

  describe('4. NavigationEngine fallback when no path exists', () => {
    it('returns empty path when coordinates are undefined', () => {
      const navEmpty = NavigationEngine.getNavigationHints(db, {
        project,
      });
      expect(navEmpty.path_found).toBe(false);
      expect(navEmpty.hints.length).toBe(0);
    });
  });

  describe('5. Trajectory export with null/non-null coordinates across formats', () => {
    it('exports null position rows in joint, spatial_vlm, and default json formats', () => {
      // Event with position
      db.prepare(`
        INSERT INTO entity_history (id, project, entity_id, action, x, y, z, confidence, timestamp, prev_hash, hash)
        VALUES
          ('ev_pos', ?, 'ent1', 'moved', 10, 20, 30, 0.95, '2026-08-20T00:00:00.000Z', '0000', '1111'),
          ('ev_nopos', ?, 'ent1', 'destroyed', null, null, null, null, '2026-08-20T01:00:00.000Z', '1111', '2222')
      `).run(project, project);

      const trajJoint = exportTrajectories(db, { project, format: 'joint' });
      expect(trajJoint.length).toBe(2);
      expect(trajJoint[0].position).toBeDefined();
      expect(trajJoint[1].position).toBeUndefined();

      const trajVlm = exportTrajectories(db, { project, format: 'spatial_vlm' });
      expect(trajVlm.length).toBe(1); // filtered out null position

      const trajJson = exportTrajectories(db, { project });
      expect(trajJson.length).toBe(2);
      expect(trajJson[1].position).toBeUndefined();
    });
  });

  describe('6. waitForSpatialState with region condition (inside vs outside)', () => {
    it('evaluates in_region condition inside and outside region bounds', async () => {
      db.prepare(`
        INSERT INTO regions (id, project, name, min_x, min_y, min_z, max_x, max_y, max_z, created_at)
        VALUES ('reg_box', ?, 'BoxRegion', -10, -10, -10, 10, 10, 10, '2026-08-20T00:00:00.000Z')
      `).run(project);

      const insideBot = EntityStore.addEntity(db, {
        project,
        name: 'InsideBot',
        type: 'agent',
        position: { x: 0, y: 0, z: 0 },
      });

      const outsideBot = EntityStore.addEntity(db, {
        project,
        name: 'OutsideBot',
        type: 'agent',
        position: { x: 50, y: 0, z: 50 },
      });

      // Inside -> satisfied immediately
      const resIn = await waitForSpatialState(db, {
        project,
        entity_id: insideBot.id,
        condition: 'in_region',
        region_id: 'reg_box',
        timeout_ms: 50,
      });
      expect(resIn.satisfied).toBe(true);

      // Outside -> timeout
      const resOut = await waitForSpatialState(db, {
        project,
        entity_id: outsideBot.id,
        condition: 'in_region',
        region_id: 'reg_box',
        timeout_ms: 30,
        poll_interval_ms: 10,
      });
      expect(resOut.satisfied).toBe(false);
    });
  });

  describe('7. MCP Tool Handlers error branches and link_to_goal with region', () => {
    it('tests link_to_goal with region_id and error branches for generate_game_inputs', async () => {
      const srv = new McpServer({ name: 'ultra-tools-srv', version: '0.1.0' });
      registerAllTools(srv);

      const [cTransport, sTransport] = InMemoryTransport.createLinkedPair();
      await srv.connect(sTransport);
      const client = new Client({ name: 'client', version: '0.1.0' }, { capabilities: {} });
      await client.connect(cTransport);

      // 1. link_to_goal with region_id
      const linkRegion = await client.callTool({
        name: 'link_to_goal',
        arguments: {
          project,
          action: 'link',
          task_id: 'task_explore_zone',
          region_id: 'reg_box',
        },
      });
      expect(linkRegion.isError).toBeFalsy();

      // 2. generate_game_inputs without entity_id or current_position -> error branch
      const errInputs = await client.callTool({
        name: 'generate_game_inputs',
        arguments: {
          project,
        },
      });
      expect(errInputs.isError).toBe(true);

      // 3. generate_game_inputs with target_entity_id not found -> error branch
      const errTgtInputs = await client.callTool({
        name: 'generate_game_inputs',
        arguments: {
          project,
          current_position: { x: 0, y: 0, z: 0 },
          target_entity_id: 'non_existent_target',
        },
      });
      expect(errTgtInputs.isError).toBe(true);

      await client.close();
      await srv.close();
    });
  });
});
