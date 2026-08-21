import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runMigrations } from '../src/engine/migrations.js';
import { EntityStore } from '../src/engine/entity-store.js';
import { SpatialGraph } from '../src/engine/spatial-graph.js';
import { PermanenceEngine } from '../src/engine/permanence.js';
import { SpatialSpecEngine } from '../src/engine/spatial-spec.js';
import { EvidenceEngine } from '../src/engine/evidence.js';
import { exportWorldModel, exportTrajectories } from '../src/engine/export.js';
import { GoalBridge } from '../src/engine/goal-bridge.js';
import { NavigationEngine } from '../src/engine/navigation.js';
import { SimulationEngine } from '../src/engine/simulation.js';
import { FrustumEngine } from '../src/engine/frustum.js';
import { waitForSpatialState } from '../src/engine/polling.js';
import { GameControlsEngine } from '../src/engine/game-controls.js';
import { parseEntityRow, parseRelationRow, parseRegionRow } from '../src/engine/row-mappers.js';
import {
  logEntityEvent,
  verifyEventAuditChain,
  repairEventAuditChain,
  getEntityHistory,
} from '../src/engine/events.js';
import { getWorldSummary } from '../src/engine/summary.js';
import { translateLegacyWorldCall, adaptLegacyParameters } from '../src/tools/compat-shim.js';
import { getLogLevel, logger, LOG_LEVELS } from '../src/utils/logger.js';
import { getCurrentBranch } from '../src/utils/git.js';
import {
  worldToScreen,
  computeCameraBasis,
  computeScreenBoundingBox,
  screenToWorldRay,
} from '../src/utils/projection.js';
import { toolDefinitions } from '../src/tools/definitions.js';

describe('Comprehensive Branch Coverage Booster Suite', () => {
  let db: Database.Database;
  const project = 'coverage-boost-project';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('1. compat-shim.ts & legacy translation branches', () => {
    it('covers all legacy tool translation names and default branches', () => {
      expect(translateLegacyWorldCall('create_entity')).toBe('update_entity');
      expect(translateLegacyWorldCall('find_entities')).toBe('query_entities');
      expect(translateLegacyWorldCall('get_entity_location')).toBe('query_entities');
      expect(translateLegacyWorldCall('get_location')).toBe('query_entities');
      expect(translateLegacyWorldCall('add_relation')).toBe('set_relation');
      expect(translateLegacyWorldCall('get_world_map')).toBe('get_spatial_map');
      expect(translateLegacyWorldCall('get_world_summary')).toBe('get_spatial_map');
      expect(translateLegacyWorldCall('get_navigation_hints')).toBe('simulate_movement');
      expect(translateLegacyWorldCall('reconcile_observation')).toBe('ingest_observation');
      expect(translateLegacyWorldCall('get_relevant_context')).toBe('link_to_goal');
      expect(translateLegacyWorldCall('undo_mutation')).toBe('manage_snapshot');
      expect(translateLegacyWorldCall('project_to_screen')).toBe('generate_game_inputs');
      expect(translateLegacyWorldCall('unknown_custom_tool')).toBe('unknown_custom_tool');
    });

    it('covers adaptLegacyParameters across all 7 legacy tools and parameter variations', () => {
      // get_location / get_entity_location
      const loc1 = adaptLegacyParameters('get_location', { entity_id: 'e1' });
      expect(loc1.tool).toBe('query_entities');
      expect(loc1.args.entity_id).toBe('e1');

      const loc2 = adaptLegacyParameters('get_entity_location', { entity_id: 'e2' });
      expect(loc2.tool).toBe('query_entities');

      // get_world_summary
      const sum = adaptLegacyParameters('get_world_summary', { project: 'p1' });
      expect(sum.tool).toBe('get_spatial_map');
      expect(sum.args.format).toBe('summary');

      // get_navigation_hints
      const nav = adaptLegacyParameters('get_navigation_hints', { start_entity_id: 's1' });
      expect(nav.tool).toBe('simulate_movement');
      expect(nav.args.mode).toBe('navigate');

      // reconcile_observation
      const rec = adaptLegacyParameters('reconcile_observation', { observer_pose: {} });
      expect(rec.tool).toBe('ingest_observation');
      expect(rec.args.reconcile).toBe(true);

      // get_relevant_context
      const ctx = adaptLegacyParameters('get_relevant_context', { task_id: 't1' });
      expect(ctx.tool).toBe('link_to_goal');
      expect(ctx.args.action).toBe('get_context');

      // undo_mutation
      const undo = adaptLegacyParameters('undo_mutation', { entity_id: 'e1' });
      expect(undo.tool).toBe('manage_snapshot');
      expect(undo.args.action).toBe('undo');

      // project_to_screen
      const projScreen = adaptLegacyParameters('project_to_screen', {
        entity_id: 'e1',
        direction: 'world_to_screen',
      });
      expect(projScreen.tool).toBe('generate_game_inputs');
      expect(projScreen.args.action).toBe('project_screen');

      const unprojRay = adaptLegacyParameters('project_to_screen', {
        screen_x: 100,
        screen_y: 200,
        direction: 'screen_to_world',
      });
      expect(unprojRay.tool).toBe('generate_game_inputs');
      expect(unprojRay.args.action).toBe('unproject_ray');

      // default
      const unknown = adaptLegacyParameters('some_new_tool', { a: 1 });
      expect(unknown.tool).toBe('some_new_tool');
    });
  });

  describe('2. utils coverage (logger, git, projection)', () => {
    it('covers all logger log levels and branches', () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const oldEnv = process.env.WORLD_MODEL_MCP_LOG_LEVEL;

      process.env.WORLD_MODEL_MCP_LOG_LEVEL = 'debug';
      expect(getLogLevel()).toBe(LOG_LEVELS.debug);
      logger.debug('debug msg');
      logger.info('info msg');
      logger.warn('warn msg');
      logger.error('error msg');

      process.env.WORLD_MODEL_MCP_LOG_LEVEL = 'error';
      expect(getLogLevel()).toBe(LOG_LEVELS.error);
      logger.debug('should not log debug');
      logger.info('should not log info');
      logger.warn('should not log warn');
      logger.error('should log error');

      process.env.WORLD_MODEL_MCP_LOG_LEVEL = 'invalid_level';
      expect(getLogLevel()).toBe(LOG_LEVELS.info);

      delete process.env.WORLD_MODEL_MCP_LOG_LEVEL;
      expect(getLogLevel()).toBe(LOG_LEVELS.info);

      if (oldEnv) process.env.WORLD_MODEL_MCP_LOG_LEVEL = oldEnv;
      errSpy.mockRestore();
    });

    it('covers getCurrentBranch with detached HEAD and fallback branches', () => {
      const tempGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-test-'));
      fs.mkdirSync(path.join(tempGitDir, '.git'), { recursive: true });

      // 1. Detached HEAD with 40-char SHA
      const sha = 'a'.repeat(40);
      fs.writeFileSync(path.join(tempGitDir, '.git', 'HEAD'), sha);
      expect(getCurrentBranch(tempGitDir)).toBe('HEAD');

      // 2. Normal branch ref
      fs.writeFileSync(path.join(tempGitDir, '.git', 'HEAD'), 'ref: refs/heads/feature/spatial-3d');
      expect(getCurrentBranch(tempGitDir)).toBe('feature/spatial-3d');

      // 3. Invalid or missing HEAD -> fallback
      fs.unlinkSync(path.join(tempGitDir, '.git', 'HEAD'));
      expect(typeof getCurrentBranch(tempGitDir)).toBe('string');

      fs.rmSync(tempGitDir, { recursive: true, force: true });
    });

    it('covers screen projection, bounding box, and ray unprojection edge cases', () => {
      const camera = {
        position: { x: 0, y: 10, z: -10 },
        orientation: { pitch: -30, yaw: 0, roll: 0 },
        fov_degrees: 60,
      };
      const viewport = { width: 1920, height: 1080 };

      // Camera basis
      const basis = computeCameraBasis(camera.orientation);
      expect(basis.forward).toBeDefined();
      expect(basis.right).toBeDefined();
      expect(basis.up).toBeDefined();

      // Project point in front of camera
      const pFront = worldToScreen({ x: 0, y: 0, z: 0 }, camera, viewport, {
        width: 2,
        height: 2,
        depth: 2,
      });
      expect(pFront.is_visible).toBe(true);
      expect(pFront.screen_x).toBeGreaterThan(0);
      expect(pFront.screen_y).toBeGreaterThan(0);
      expect(pFront.screen_bounding_box).toBeDefined();

      // Project point directly behind camera (z_camera <= near plane)
      const pBehind = worldToScreen({ x: 0, y: 10, z: -20 }, camera, viewport);
      expect(pBehind.is_behind_camera).toBe(true);

      // Unproject ray
      const ray = screenToWorldRay(960, 540, camera, viewport);
      expect(ray.ray_origin).toBeDefined();
      expect(ray.ray_direction).toBeDefined();

      // Screen bounding box calculation
      const bbox = computeScreenBoundingBox({ x: 0, y: 0, z: 0 }, { width: 1, height: 1, depth: 1 }, camera, viewport);
      expect(bbox).toBeDefined();
    });
  });

  describe('3. row-mappers.ts complete branch coverage', () => {
    it('parses entity, relation, and region rows with null and populated fields', () => {
      // Entity row with null optional fields
      const eNull = parseEntityRow({
        id: 'e1',
        project,
        name: 'NullBot',
        type: 'agent',
        status: 'active',
        x: null,
        y: null,
        z: null,
        pitch: null,
        yaw: null,
        roll: null,
        bbox_width: null,
        bbox_height: null,
        bbox_depth: null,
        confidence: null,
        parent_id: null,
        region_id: null,
        properties_json: null,
        tags_json: null,
        created_at: '2026-08-20T00:00:00.000Z',
        updated_at: '2026-08-20T00:00:00.000Z',
        last_seen_at: '2026-08-20T00:00:00.000Z',
        version: null,
      } as any);
      expect(eNull.position).toBeUndefined();
      expect(eNull.orientation).toBeUndefined();
      expect(eNull.bounding_box).toBeUndefined();
      expect(eNull.confidence).toBe(1.0);
      expect(eNull.version).toBe(1);

      // Entity row with populated orientation and bbox
      const eFull = parseEntityRow({
        id: 'e2',
        project,
        name: 'FullBot',
        type: 'agent',
        status: 'active',
        x: 1,
        y: 2,
        z: 3,
        pitch: 10,
        yaw: 20,
        roll: null,
        bbox_width: 1,
        bbox_height: 2,
        bbox_depth: 3,
        confidence: 0.85,
        parent_id: 'p1',
        region_id: 'r1',
        properties_json: '{"hp":100}',
        tags_json: '["hero"]',
        created_at: '2026-08-20T00:00:00.000Z',
        updated_at: '2026-08-20T00:00:00.000Z',
        last_seen_at: '2026-08-20T00:00:00.000Z',
        version: 5,
      });
      expect(eFull.orientation?.pitch).toBe(10);
      expect(eFull.orientation?.yaw).toBe(20);
      expect(eFull.orientation?.roll).toBeUndefined();
      expect(eFull.bounding_box?.width).toBe(1);

      // Relation row
      const relNull = parseRelationRow({
        id: 'r1',
        project,
        source_id: 'e1',
        relation: 'near',
        target_id: 'e2',
        offset_x: null,
        offset_y: null,
        offset_z: null,
        distance: null,
        metadata_json: null,
        created_at: '2026-08-20T00:00:00.000Z',
        updated_at: '2026-08-20T00:00:00.000Z',
      });
      expect(relNull.offset).toBeUndefined();
      expect(relNull.distance).toBeUndefined();

      const relFull = parseRelationRow({
        id: 'r2',
        project,
        source_id: 'e1',
        relation: 'on',
        target_id: 'e2',
        offset_x: 0,
        offset_y: 1,
        offset_z: 0,
        distance: 1.0,
        metadata_json: '{"surface":"table"}',
        created_at: '2026-08-20T00:00:00.000Z',
        updated_at: '2026-08-20T00:00:00.000Z',
      });
      expect(relFull.offset).toEqual({ x: 0, y: 1, z: 0 });
      expect(relFull.metadata.surface).toBe('table');

      // Region row
      const regNull = parseRegionRow({
        id: 'reg1',
        project,
        name: 'Zone A',
        parent_region_id: null,
        min_x: null,
        min_y: null,
        min_z: null,
        max_x: null,
        max_y: null,
        max_z: null,
        properties_json: null,
        created_at: '2026-08-20T00:00:00.000Z',
      });
      expect(regNull.bounds).toBeUndefined();

      const regFull = parseRegionRow({
        id: 'reg2',
        project,
        name: 'Zone B',
        parent_region_id: 'reg1',
        min_x: -10,
        min_y: 0,
        min_z: -10,
        max_x: 10,
        max_y: 5,
        max_z: 10,
        properties_json: '{"danger":true}',
        created_at: '2026-08-20T00:00:00.000Z',
      });
      expect(regFull.bounds?.min.x).toBe(-10);
      expect(regFull.properties.danger).toBe(true);
    });
  });

  describe('4. export.ts 3D formats and trajectory branches', () => {
    it('exports gltf with orientations and obj with diverse bounding boxes', () => {
      EntityStore.addEntity(db, {
        project,
        name: 'OrientedBot',
        type: 'agent',
        position: { x: 5, y: 0, z: 5 },
        orientation: { pitch: 15, yaw: 90, roll: 0 },
        bounding_box: { width: 2, height: 4, depth: 2 },
      });

      // Export gltf
      const gltf = exportWorldModel(db, { project, format: 'gltf' });
      expect(gltf.asset.version).toBe('2.0');
      expect(gltf.nodes.length).toBe(1);
      expect(gltf.nodes[0].extras.orientation).toEqual({ pitch: 15, yaw: 90, roll: 0 });

      // Export obj
      const obj = exportWorldModel(db, { project, format: 'obj' });
      expect(obj).toContain('o OrientedBot_');
      expect(obj).toContain('v ');
      expect(obj).toContain('f ');

      // Export trajectories in json format (default)
      const trajJson = exportTrajectories(db, { project, format: 'json' });
      expect(Array.isArray(trajJson)).toBe(true);

      // Export trajectories in joint format
      const trajJoint = exportTrajectories(db, { project, format: 'joint', trace_id: 'trace_123' });
      expect(trajJoint[0]?.trace_id).toBe('trace_123');

      // Export trajectories in spatial_vlm format
      const trajVlm = exportTrajectories(db, { project, format: 'spatial_vlm' });
      expect(Array.isArray(trajVlm)).toBe(true);
    });
  });

  describe('5. spatial-spec.ts constraint violation & compliance branches', () => {
    it('evaluates min_clearance, max_distance, inside_region, contains_entity, and no_overlap', () => {
      const e1 = EntityStore.addEntity(db, {
        project,
        name: 'RobotA',
        type: 'agent',
        position: { x: 0, y: 0, z: 0 },
        bounding_box: { width: 2, height: 2, depth: 2 },
      });

      const e2 = EntityStore.addEntity(db, {
        project,
        name: 'RobotB',
        type: 'agent',
        position: { x: 1, y: 0, z: 0 }, // distance = 1.0, overlapping with RobotA
        bounding_box: { width: 2, height: 2, depth: 2 },
      });

      // Create region
      db.prepare(
        `
        INSERT INTO regions (id, project, name, min_x, min_y, min_z, max_x, max_y, max_z, created_at)
        VALUES ('reg_hall', ?, 'Hallway', 10, 0, 10, 20, 5, 20, '2026-08-20T00:00:00.000Z')
      `
      ).run(project);

      // 1. Min clearance violation (dist 1.0 < 5.0 minClearance)
      SpatialSpecEngine.setSpatialSpec(db, {
        project,
        name: 'spec_clearance',
        constraints: [
          { type: 'min_clearance', entity_id: e1.id, target_id: e2.id, value: 5.0 },
        ],
      });
      const resClearance = SpatialSpecEngine.verifySpatialSpec(db, { project, name: 'spec_clearance' });
      expect(resClearance.is_compliant).toBe(false);
      expect(resClearance.violations.length).toBe(1);

      // 2. Max distance violation (dist 1.0 > 0.5 maxDistance)
      SpatialSpecEngine.setSpatialSpec(db, {
        project,
        name: 'spec_max_dist',
        constraints: [
          { type: 'max_distance', entity_id: e1.id, target_id: e2.id, value: 0.5 },
        ],
      });
      const resMaxDist = SpatialSpecEngine.verifySpatialSpec(db, { project, name: 'spec_max_dist' });
      expect(resMaxDist.is_compliant).toBe(false);

      // 3. Inside region violation
      SpatialSpecEngine.setSpatialSpec(db, {
        project,
        name: 'spec_region',
        constraints: [
          { type: 'inside_region', entity_id: e1.id, region_id: 'reg_hall' },
        ],
      });
      const resRegion = SpatialSpecEngine.verifySpatialSpec(db, { project, name: 'spec_region' });
      expect(resRegion.is_compliant).toBe(false);

      // 4. Contains entity violation
      SpatialSpecEngine.setSpatialSpec(db, {
        project,
        name: 'spec_contains',
        constraints: [{ type: 'contains_entity', entity_id: e1.id, target_id: e2.id }],
      });
      const resContains = SpatialSpecEngine.verifySpatialSpec(db, { project, name: 'spec_contains' });
      expect(resContains.is_compliant).toBe(false);

      // 5. No overlap violation
      SpatialSpecEngine.setSpatialSpec(db, {
        project,
        name: 'spec_no_overlap',
        constraints: [{ type: 'no_overlap', entity_id: e1.id, target_id: e2.id }],
      });
      const resOverlap = SpatialSpecEngine.verifySpatialSpec(db, { project, name: 'spec_no_overlap' });
      expect(resOverlap.is_compliant).toBe(false);
    });
  });

  describe('6. evidence.ts with observations & snapshot IDs', () => {
    it('creates evidence pack with observations and without primary target ID', () => {
      // Record an observation in DB
      db.prepare(
        `
        INSERT INTO observations (
          id, project, visual_state_id, observer_x, observer_y, observer_z, observer_pitch, observer_yaw, observer_roll,
          fov_horizontal, fov_vertical, raw_detections_json, reconcile_report_json, timestamp
        ) VALUES (
          'obs_001', ?, 'vs_100', 0, 10, 0, -30, 0, 0, 60, 45, '[]', '{"confirmed":[]}', '2026-08-20T00:00:00.000Z'
        )
      `
      ).run(project);

      const pack = EvidenceEngine.createEvidencePack(db, {
        project,
        observation_ids: ['obs_001'],
        before_snapshot_id: 'snap_before',
        after_snapshot_id: 'snap_after',
      });

      expect(pack.observations_snapshot?.length).toBe(1);
      expect(pack.before_snapshot_id).toBe('snap_before');
      expect(pack.after_snapshot_id).toBe('snap_after');
      expect(pack.state_memory_tool_calls?.link_tool_call).toBeUndefined();
    });
  });

  describe('7. permanence.ts decay thresholds & stats', () => {
    it('covers all permanence status buckets (active, hidden, lost, destroyed)', () => {
      // Create entities in different states
      EntityStore.addEntity(db, { project, name: 'Active1', type: 'object', status: 'active', confidence: 1.0 });
      const h1 = EntityStore.addEntity(db, { project, name: 'Hidden1', type: 'object', status: 'hidden', confidence: 0.1 });
      EntityStore.addEntity(db, { project, name: 'Lost1', type: 'object', status: 'lost', confidence: 0.02 });
      const d1 = EntityStore.addEntity(db, { project, name: 'Destroyed1', type: 'object', status: 'active' });
      EntityStore.removeEntity(db, { project, id: d1.id });

      const stats = PermanenceEngine.getDecayStats(db, { project });
      expect(stats.active_count).toBe(1);
      expect(stats.hidden_count).toBe(1);
      expect(stats.lost_count).toBe(1);
      expect(stats.destroyed_count).toBe(1);
      expect(stats.avg_confidence).toBeGreaterThan(0);

      // Re-observe an entity
      PermanenceEngine.reObserveEntity(db, { project, entity_id: h1.id, visual_state_id: 'vs_reseen' });
      const reseen = EntityStore.getEntity(db, { project, id: h1.id });
      expect(reseen?.status).toBe('active');
      expect(reseen?.confidence).toBe(1.0);
    });
  });

  describe('8. goal-bridge.ts get_context, unlink, and limits', () => {
    it('covers getRelevantContext and goal unlinking', () => {
      const e = EntityStore.addEntity(db, {
        project,
        name: 'GoalObject',
        type: 'item',
        position: { x: 5, y: 0, z: 5 },
      });

      GoalBridge.linkToGoal(db, { project, task_id: 'task_abc', entity_id: e.id, relationship: 'target' });

      const ctx = GoalBridge.getRelevantContext(db, {
        project,
        task_id: 'task_abc',
        current_agent_position: { x: 0, y: 0, z: 0 },
        radius: 20,
        max_entities: 5,
      });
      expect(ctx.goal_targets.length).toBe(1);

      const unlinked = GoalBridge.unlinkFromGoal(db, { project, task_id: 'task_abc', entity_id: e.id });
      expect(unlinked).toBe(true);

      const linksAfter = GoalBridge.getLinkedGoals(db, { project, task_id: 'task_abc' });
      expect(linksAfter.length).toBe(0);
    });
  });

  describe('9. navigation, simulation, frustum, and game controls', () => {
    it('covers waypoint navigation, collision ray-marching, frustum culling, and inputs', () => {
      const rover = EntityStore.addEntity(db, {
        project,
        name: 'RoverBot',
        type: 'agent',
        position: { x: 0, y: 0, z: 0 },
      });

      const obs = EntityStore.addEntity(db, {
        project,
        name: 'ObstacleCube',
        type: 'obstacle',
        position: { x: 5, y: 0, z: 0 },
        bounding_box: { width: 2, height: 2, depth: 2 },
        properties: { is_solid: true },
      });

      // 1. Simulation and Collision
      const simHit = SimulationEngine.simulateMovement(db, {
        project,
        entity_id: rover.id,
        target_position: { x: 10, y: 0, z: 0 },
        check_collisions: true,
      });
      expect(simHit.is_valid).toBe(false);
      expect(simHit.collisions_detected.length).toBeGreaterThan(0);

      // 2. Navigation hints mode
      const navRes = NavigationEngine.getNavigationHints(db, {
        project,
        start_position: { x: 0, y: 0, z: 0 },
        target_position: { x: 20, y: 0, z: 0 },
      });
      expect(navRes.hints.length).toBeGreaterThan(0);

      // 3. Frustum line-of-sight
      const view = FrustumEngine.getExpectedView(db, {
        project,
        observer_position: { x: 0, y: 0, z: -10 },
        observer_orientation: { pitch: 0, yaw: 0, roll: 0 },
        fov_degrees: 90,
        max_distance: 100,
        enable_occlusion: true,
      });
      expect(view.visible_entities.some((v) => v.entity.id === obs.id)).toBe(true);

      // 4. Game controls: arrow keys & click-to-move
      const controlsArrows = GameControlsEngine.generateInputs({
        current_position: { x: 0, y: 0, z: 0 },
        target_position: { x: 10, y: 0, z: 10 },
        control_profile: { scheme: 'arrows', move_speed: 5.0, turn_speed: 90.0 },
      });
      expect(controlsArrows.actions.length).toBeGreaterThan(0);
      expect(controlsArrows.playwright_commands.length).toBeGreaterThan(0);
      expect(controlsArrows.playwright_script).toContain('executeGameNavigation');

      const controlsClick = GameControlsEngine.generateInputs({
        current_position: { x: 0, y: 0, z: 0 },
        target_position: { x: 10, y: 0, z: 10 },
        control_profile: { scheme: 'click_to_move' },
      });
      expect(controlsClick.actions.some((a) => a.type === 'mouse_click')).toBe(true);
    });
  });

  describe('10. polling.ts condition branches', () => {
    it('covers active condition and region condition in waitForSpatialState', async () => {
      const e = EntityStore.addEntity(db, {
        project,
        name: 'PollItem',
        type: 'item',
        status: 'active',
        confidence: 0.9,
        position: { x: 5, y: 0, z: 5 },
      });

      // condition: active
      const activeRes = await waitForSpatialState(db, {
        project,
        entity_id: e.id,
        condition: 'active',
        timeout_ms: 50,
      });
      expect(activeRes.satisfied).toBe(true);

      // condition: confidence_above
      const confRes = await waitForSpatialState(db, {
        project,
        entity_id: e.id,
        condition: 'confidence_above',
        threshold: 0.5,
        timeout_ms: 50,
      });
      expect(confRes.satisfied).toBe(true);
    });
  });

  describe('11. toolDefinitions schema verification', () => {
    it('verifies all 15 tool definitions exist with proper JSON schemas', () => {
      expect(toolDefinitions.length).toBe(15);
      const names = toolDefinitions.map((t) => t.name);
      expect(names).toContain('update_entity');
      expect(names).toContain('query_entities');
      expect(names).toContain('set_relation');
      expect(names).toContain('get_spatial_map');
      expect(names).toContain('simulate_movement');
      expect(names).toContain('ingest_observation');
      expect(names).toContain('get_expected_view');
      expect(names).toContain('link_to_goal');
      expect(names).toContain('record_outcome');
      expect(names).toContain('manage_spatial_spec');
      expect(names).toContain('create_evidence_pack');
      expect(names).toContain('use_spatial_blackboard');
      expect(names).toContain('manage_snapshot');
      expect(names).toContain('generate_game_inputs');
      expect(names).toContain('wait_for_spatial_state');

      for (const tool of toolDefinitions) {
        expect(tool.inputSchema.type).toBe('object');
      }
    });
  });
});
