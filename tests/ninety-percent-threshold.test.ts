import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/engine/migrations.js';
import { EntityStore } from '../src/engine/entity-store.js';
import { EvidenceEngine } from '../src/engine/evidence.js';
import { GameControlsEngine } from '../src/engine/game-controls.js';
import { TilemapMapper } from '../src/utils/projection.js';
import { verifyEventAuditChain } from '../src/engine/events.js';

describe('Ninety Percent Threshold Final Suite', () => {
  let db: Database.Database;
  const project = 'ninety-boost-project';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('1. GameControlsEngine left turn, right turn, mouse look left/right', () => {
    it('generates turning actions for left, right, and mouse-look in both directions', () => {
      // 1. Left turn with keyboard (target is to the left / -X)
      const turnLeft = GameControlsEngine.generateInputs({
        current_position: { x: 0, y: 0, z: 0 },
        current_orientation: { yaw: 90, pitch: 0, roll: 0 }, // heading +X
        target_position: { x: 0, y: 0, z: 10 }, // target is +Z (0 deg) -> turn left by -90 deg
        control_profile: { scheme: 'wasd', use_mouse_look: false },
      });
      expect(turnLeft.actions.some((a) => a.type === 'key_hold' && a.key === 'ArrowLeft')).toBe(true);

      // 2. Right turn with keyboard (current 0 deg, target +X / 90 deg)
      const turnRight = GameControlsEngine.generateInputs({
        current_position: { x: 0, y: 0, z: 0 },
        current_orientation: { yaw: 0, pitch: 0, roll: 0 },
        target_position: { x: 10, y: 0, z: 0 },
        control_profile: { scheme: 'wasd', use_mouse_look: false },
      });
      expect(turnRight.actions.some((a) => a.type === 'key_hold' && a.key === 'ArrowRight')).toBe(true);

      // 3. Mouse look left (deltaYaw < 0)
      const mouseLeft = GameControlsEngine.generateInputs({
        current_position: { x: 0, y: 0, z: 0 },
        current_orientation: { yaw: 90, pitch: 0, roll: 0 },
        target_position: { x: 0, y: 0, z: 10 },
        control_profile: { use_mouse_look: true, mouse_sensitivity: 1.5 },
      });
      expect(mouseLeft.actions.some((a) => a.type === 'mouse_move' && (a.delta_x ?? 0) < 0)).toBe(true);

      // 4. Mouse look right (deltaYaw > 0)
      const mouseRight = GameControlsEngine.generateInputs({
        current_position: { x: 0, y: 0, z: 0 },
        current_orientation: { yaw: 0, pitch: 0, roll: 0 },
        target_position: { x: 10, y: 0, z: 0 },
        control_profile: { use_mouse_look: true, mouse_sensitivity: 1.5 },
      });
      expect(mouseRight.actions.some((a) => a.type === 'mouse_move' && (a.delta_x ?? 0) > 0)).toBe(true);

      // 5. Multi-waypoint path
      const multiWp = GameControlsEngine.generateInputs({
        current_position: { x: 0, y: 0, z: 0 },
        waypoints: [
          { x: 0, y: 0, z: 5 },
          { x: 5, y: 0, z: 5 },
          { x: 5, y: 0, z: 10 },
        ],
      });
      expect(multiWp.actions.length).toBeGreaterThan(2);
    });
  });

  describe('2. TilemapMapper with empty defaults', () => {
    it('uses fallback default tile dimensions and origins', () => {
      // Empty config (defaults: width=32, height=32, origin_x=0, origin_y=0)
      const emptyConfig = { orientation: 'isometric' as const };
      const s = TilemapMapper.tileToScreen(1, 1, emptyConfig as any);
      expect(s.screen_x).toBe(0); // (1 - 1) * 16 = 0
      expect(s.screen_y).toBe(32); // (1 + 1) * 16 = 32

      const t = TilemapMapper.screenToTile(0, 32, emptyConfig as any);
      expect(t.tile_x).toBe(1);
      expect(t.tile_y).toBe(1);
    });
  });

  describe('3. EvidenceEngine with complete observations snapshot', () => {
    it('creates evidence pack including complete observation with pose, fov, detections, reconcile report', () => {
      db.prepare(`
        INSERT INTO observations (
          id, project, visual_state_id, observer_x, observer_y, observer_z, observer_pitch, observer_yaw, observer_roll,
          fov_horizontal, fov_vertical, raw_detections_json, reconcile_report_json, timestamp
        ) VALUES (
          'obs_full', ?, 'vs_999', 5, 2, 5, 10, 45, 0, 90, 60,
          '[{"label":"TreasureChest","confidence":0.99}]',
          '{"confirmed":[{"entity_id":"e1","name":"TreasureChest","match_score":0.99}]}',
          '2026-08-20T00:00:00.000Z'
        )
      `).run(project);

      const pack = EvidenceEngine.createEvidencePack(db, {
        project,
        observation_ids: ['obs_full'],
        linked_state_memory_nodes: {
          task_ids: ['task_find_treasure'],
        },
      });

      expect(pack.observations_snapshot?.length).toBe(1);
      const obs = pack.observations_snapshot![0];
      expect(obs.observer_pose?.position.x).toBe(5);
      expect(obs.observer_pose?.orientation?.pitch).toBe(10);
      expect(obs.field_of_view?.fov_horizontal).toBe(90);
      expect(obs.detections.length).toBe(1);
      expect(obs.reconcile_report).toBeDefined();
      expect(pack.state_memory_tool_calls?.link_tool_call).toBeDefined();
    });
  });
});
