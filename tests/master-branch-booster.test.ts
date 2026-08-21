import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/engine/migrations.js';
import { EntityStore } from '../src/engine/entity-store.js';
import { SpatialGraph } from '../src/engine/spatial-graph.js';
import { GoalBridge } from '../src/engine/goal-bridge.js';
import { NavigationEngine } from '../src/engine/navigation.js';
import { GameControlsEngine } from '../src/engine/game-controls.js';
import { TilemapMapper } from '../src/utils/projection.js';
import { computeEventHash, getEntityHistory } from '../src/engine/events.js';
import { registerAllTools } from '../src/tools/handlers.js';
import { getDb } from '../src/engine/db.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

describe('Master Branch Coverage Booster Suite (>90% Overall)', () => {
  let db: Database.Database;
  const project = 'master-boost-project';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('1. Isometric Tilemap Projection & Screen to Tile Mapping', () => {
    it('maps isometric coordinates back and forth', () => {
      const isoConfig = {
        tile_width: 64,
        tile_height: 32,
        orientation: 'isometric' as const,
        origin_x: 100,
        origin_y: 50,
      };

      const screen = TilemapMapper.tileToScreen(2, 3, isoConfig);
      expect(screen.screen_x).toBeDefined();
      expect(screen.screen_y).toBeDefined();

      const tile = TilemapMapper.screenToTile(screen.screen_x, screen.screen_y, isoConfig);
      expect(tile.tile_x).toBe(2);
      expect(tile.tile_y).toBe(3);

      // Orthogonal with origins
      const orthoConfig = {
        tile_width: 32,
        tile_height: 32,
        orientation: 'orthogonal' as const,
        origin_x: 10,
        origin_y: 20,
      };
      const orthoScreen = TilemapMapper.tileToScreen(5, 5, orthoConfig);
      const orthoTile = TilemapMapper.screenToTile(orthoScreen.screen_x, orthoScreen.screen_y, orthoConfig);
      expect(orthoTile.tile_x).toBe(5);
      expect(orthoTile.tile_y).toBe(5);
    });
  });

  describe('2. GameControlsEngine all action types & canvas click branch', () => {
    it('exercises mouse_click canvas fallback, mouse_move, key_hold, and wait actions', () => {
      // Inputs without camera/viewport -> screenX < 0 -> canvas fallback
      const inputs = GameControlsEngine.generateInputs({
        current_position: { x: 0, y: 0, z: 0 },
        target_position: { x: 10, y: 0, z: 10 },
        control_profile: {
          scheme: 'click_to_move',
        },
      });

      expect(inputs.playwright_commands.some((c) => c.tool === 'browser_click' && (c.args as any).target === 'canvas')).toBe(true);
      expect(inputs.playwright_script).toContain("await page.click('canvas')");
      expect(inputs.playwright_script).toContain('await page.waitForTimeout');

      // Inputs with camera/viewport -> mouse_click with screen coordinates
      const inputsCam = GameControlsEngine.generateInputs({
        current_position: { x: 0, y: 0, z: 0 },
        target_position: { x: 0, y: 0, z: 10 },
        control_profile: {
          scheme: 'click_to_move',
        },
        camera: {
          position: { x: 0, y: 10, z: -10 },
          orientation: { pitch: -30, yaw: 0, roll: 0 },
          fov_degrees: 60,
        },
        viewport: { width: 1920, height: 1080 },
      });

      expect(inputsCam.playwright_script).toContain('await page.mouse.click');
    });
  });

  describe('3. GoalBridge context and linked goals with entity_id filter', () => {
    it('queries linked goals with entity_id filter and gets context without agent position', () => {
      const e = EntityStore.addEntity(db, { project, name: 'GoalItem', type: 'item' });
      GoalBridge.linkToGoal(db, { project, task_id: 'task_g1', entity_id: e.id, relationship: 'target' });

      const links = GoalBridge.getLinkedGoals(db, { project, entity_id: e.id });
      expect(links.length).toBe(1);
      expect(links[0].task_id).toBe('task_g1');

      // Context without current_agent_position -> returns full entity list slice
      const ctxNoPos = GoalBridge.getRelevantContext(db, { project, max_entities: 10 });
      expect(ctxNoPos.nearby_entities.length).toBe(1);
    });
  });

  describe('4. NavigationEngine topological BFS multi-hop and cycle handling', () => {
    it('traverses multi-hop topological path and handles cycles', () => {
      const n1 = EntityStore.addEntity(db, { project, name: 'Room1', type: 'region' });
      const n2 = EntityStore.addEntity(db, { project, name: 'Hallway', type: 'region' });
      const n3 = EntityStore.addEntity(db, { project, name: 'Room2', type: 'region' });

      SpatialGraph.setRelation(db, { project, source_id: n1.id, relation: 'next_to', target_id: n2.id, distance: 5 });
      SpatialGraph.setRelation(db, { project, source_id: n2.id, relation: 'next_to', target_id: n3.id, distance: 5 });
      // Create cycle
      SpatialGraph.setRelation(db, { project, source_id: n3.id, relation: 'next_to', target_id: n1.id, distance: 10 });

      const nav = NavigationEngine.getNavigationHints(db, {
        project,
        start_entity_id: n1.id,
        target_entity_id: n3.id,
      });
      expect(nav.path_found).toBe(true);
      expect(nav.hints.length).toBe(2);
      expect(nav.total_distance).toBe(10);
    });
  });

  describe('5. events.ts computeEventHash without details and getEntityHistory with action filter', () => {
    it('computes event hash without details and queries history with action filter', () => {
      const hashNoDetails = computeEventHash({
        prev_hash: '0'.repeat(64),
        id: 'ev_nodet',
        project,
        entity_id: 'e1',
        action: 'created',
        timestamp: '2026-08-20T00:00:00.000Z',
      });
      expect(hashNoDetails).toBeDefined();

      db.prepare(`
        INSERT INTO entity_history (id, project, entity_id, action, timestamp, prev_hash, hash)
        VALUES
          ('h1', ?, 'e1', 'created', '2026-08-20T00:00:00.000Z', '0000', '1111'),
          ('h2', ?, 'e1', 'moved', '2026-08-20T01:00:00.000Z', '1111', '2222')
      `).run(project, project);

      const histLimited = getEntityHistory(db, { project, entity_id: 'e1', limit: 1 });
      expect(histLimited.length).toBe(1);
      expect(histLimited[0].action).toBe('moved');
    });
  });

  describe('6. MCP Handlers query_entities history_limit and missing entity in game inputs', () => {
    it('tests history_limit on query_entities and missing entity error on generate_game_inputs', async () => {
      const toolDb = getDb(project);
      const srv = new McpServer({ name: 'master-srv', version: '0.1.0' });
      registerAllTools(srv);

      const [cTransport, sTransport] = InMemoryTransport.createLinkedPair();
      await srv.connect(sTransport);
      const client = new Client({ name: 'client', version: '0.1.0' }, { capabilities: {} });
      await client.connect(cTransport);

      const ent = EntityStore.addEntity(toolDb, { project, name: 'HistBot', type: 'agent' });
      EntityStore.updateEntity(toolDb, { project, id: ent.id, position: { x: 1, y: 0, z: 0 } });
      EntityStore.updateEntity(toolDb, { project, id: ent.id, position: { x: 2, y: 0, z: 0 } });

      // query_entities with include_history and history_limit: 1
      const histRes = await client.callTool({
        name: 'query_entities',
        arguments: { project, entity_id: ent.id, include_history: true, history_limit: 1 },
      });
      expect(histRes.isError).toBeFalsy();
      const histData = JSON.parse((histRes.content as any)[0].text);
      expect(histData.history.length).toBe(1);

      // generate_game_inputs with non-existent entity_id -> error branch
      const missingEntInputs = await client.callTool({
        name: 'generate_game_inputs',
        arguments: { project, entity_id: 'non_existent_entity_id' },
      });
      expect(missingEntInputs.isError).toBe(true);

      await client.close();
      await srv.close();
    });
  });
});
