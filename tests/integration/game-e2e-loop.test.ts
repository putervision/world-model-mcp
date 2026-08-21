import { describe, it, expect } from 'vitest';
import { getDb } from '../../src/engine/db.js';
import { EntityStore } from '../../src/engine/entity-store.js';
import { VisionBridge } from '../../src/engine/vision-bridge.js';
import { FrustumEngine } from '../../src/engine/frustum.js';
import { NavigationEngine } from '../../src/engine/navigation.js';
import { SimulationEngine } from '../../src/engine/simulation.js';
import { GameControlsEngine } from '../../src/engine/game-controls.js';
import { worldToScreen, screenToWorldRay } from '../../src/utils/projection.js';
import { SpatialSpecEngine } from '../../src/engine/spatial-spec.js';
import { EvidenceEngine } from '../../src/engine/evidence.js';
import { CameraState, ViewportSize } from '../../src/schema/types.js';

describe('Autonomous 3D Three.js Game Loop E2E Integration Suite', () => {
  const project = 'e2e-threejs-game-arena';
  const db = getDb(project);

  const camera: CameraState = {
    position: { x: 0, y: 15, z: -25 },
    orientation: { pitch: -30, yaw: 0, roll: 0 },
    fov_degrees: 60,
    near: 0.1,
    far: 1000,
  };

  const viewport: ViewportSize = {
    width: 1920,
    height: 1080,
  };

  it('executes a complete 10-phase perception-action game loop', () => {
    // Clear project data before test
    db.prepare('DELETE FROM entities WHERE project = ?').run(project);
    db.prepare('DELETE FROM spatial_relations WHERE project = ?').run(project);
    db.prepare('DELETE FROM observations WHERE project = ?').run(project);
    db.prepare('DELETE FROM spatial_specs WHERE project = ?').run(project);
    db.prepare('DELETE FROM evidence_packs WHERE project = ?').run(project);
    db.prepare('DELETE FROM blackboard_items WHERE project = ?').run(project);

    // -------------------------------------------------------------
    // Phase 1: Ingest Live Three.js Game Scene via Perception Bridge
    // -------------------------------------------------------------

    const simulatedThreeJsSceneDetections = [
      {
        label: 'player_drone',
        class_name: 'agent',
        estimated_position: { x: 0, y: 0.5, z: 0 },
        bounding_box: { width: 1.2, height: 0.8, depth: 1.2 },
        confidence: 1.0,
      },
      {
        label: 'obstacle_wall_a',
        class_name: 'obstacle',
        estimated_position: { x: 0, y: 1.5, z: 8 },
        bounding_box: { width: 8, height: 3, depth: 1 },
        confidence: 1.0,
      },
      {
        label: 'gold_chest',
        class_name: 'item',
        estimated_position: { x: 8, y: 0.5, z: 12 },
        bounding_box: { width: 1, height: 1, depth: 1 },
        confidence: 1.0,
      },
      {
        label: 'cyan_gem',
        class_name: 'item',
        estimated_position: { x: -8, y: 0.5, z: 12 },
        bounding_box: { width: 1, height: 1, depth: 1 },
        confidence: 1.0,
      },
    ];

    const ingestResult = VisionBridge.ingestObservation(db, {
      project,
      observer_pose: {
        position: camera.position,
        orientation: camera.orientation,
      },
      detections: simulatedThreeJsSceneDetections,
    });

    expect(ingestResult.created_entities).toHaveLength(4);
    expect(ingestResult.updated_entities).toHaveLength(0);

    const player = EntityStore.queryEntities(db, { project, query: 'player_drone' })[0];
    const chest = EntityStore.queryEntities(db, { project, query: 'gold_chest' })[0];
    const wall = EntityStore.queryEntities(db, { project, query: 'obstacle_wall_a' })[0];

    expect(player).toBeDefined();
    expect(chest).toBeDefined();
    expect(wall).toBeDefined();

    // -------------------------------------------------------------
    // Phase 2: Expected View Frustum & Line-of-Sight Occlusion
    // -------------------------------------------------------------
    const expectedView = FrustumEngine.getExpectedView(db, {
      project,
      observer_position: camera.position,
      observer_orientation: camera.orientation,
      fov_degrees: camera.fov_degrees,
      enable_occlusion: true,
    });

    expect(expectedView.visible_entities.length).toBeGreaterThanOrEqual(3);
    const visibleChest = expectedView.visible_entities.find((v) => v.entity.name === 'gold_chest');
    expect(visibleChest).toBeDefined();
    expect(visibleChest!.is_occluded).toBe(false);

    // -------------------------------------------------------------
    // Phase 3: Screen-Space 2D Projection for Playwright Targeting
    // -------------------------------------------------------------
    const chestProj = worldToScreen(chest.position!, camera, viewport, chest.bounding_box);
    expect(chestProj.is_visible).toBe(true);
    expect(chestProj.is_behind_camera).toBe(false);
    expect(chestProj.screen_x).toBeGreaterThan(960); // right side of screen
    expect(chestProj.screen_bounding_box).toBeDefined();
    expect(chestProj.screen_bounding_box!.width).toBeGreaterThan(10);
    expect(chestProj.screen_bounding_box!.height).toBeGreaterThan(10);

    // -------------------------------------------------------------
    // Phase 4: Screen to 3D Ground Unprojection
    // -------------------------------------------------------------
    const unproj = screenToWorldRay(chestProj.screen_x, chestProj.screen_y, camera, viewport, 0.5);
    expect(unproj.ground_intercept).toBeDefined();
    expect(unproj.ground_intercept!.x).toBeCloseTo(chest.position!.x, 0);
    expect(unproj.ground_intercept!.z).toBeCloseTo(chest.position!.z, 0);

    // -------------------------------------------------------------
    // Phase 5: Pathfinding & Obstacle Collision Pre-Check
    // -------------------------------------------------------------
    const navHints = NavigationEngine.getNavigationHints(db, {
      project,
      start_entity_id: player.id,
      target_entity_id: chest.id,
    });
    expect(navHints.path_found).toBe(true);
    expect(navHints.hints.length).toBeGreaterThan(0);

    const waypoints = navHints.hints.map((h) => h.to_position!).filter(Boolean);

    // Verify movement simulation does not hit the obstacle wall
    const simResult = SimulationEngine.simulateMovement(db, {
      project,
      entity_id: player.id,
      target_position: chest.position!,
      check_collisions: true,
    });
    expect(simResult.is_valid).toBe(true); // Path from (0,0,0) to (8,0.5,12) clears wall at (0,1.5,8, w:8)

    // -------------------------------------------------------------
    // Phase 6: Game Input Sequencing & Playwright MCP Commands
    // -------------------------------------------------------------
    const inputSequence = GameControlsEngine.generateInputs({
      current_position: player.position!,
      current_orientation: player.orientation,
      target_position: chest.position!,
      waypoints,
      control_profile: {
        scheme: 'wasd',
        move_speed: 6.0,
        turn_speed: 120.0,
      },
    });

    expect(inputSequence.actions.length).toBeGreaterThanOrEqual(2); // Turn + Move
    expect(inputSequence.playwright_commands.length).toBe(inputSequence.actions.length);
    expect(inputSequence.playwright_commands.some((c) => c.tool === 'browser_evaluate')).toBe(true);
    expect(inputSequence.playwright_script).toContain('executeGameNavigation');

    // -------------------------------------------------------------
    // Phase 7: Execute Movement & Reconcile Perception
    // -------------------------------------------------------------
    // Update player position in world model
    EntityStore.updateEntity(db, {
      project,
      id: player.id,
      position: chest.position!,
    });

    const updatedPlayer = EntityStore.getEntity(db, { project, id: player.id });
    expect(updatedPlayer!.position).toEqual(chest.position!);

    // Reconcile observation (chest collected, so no longer in detections)
    const afterDetections = [
      {
        label: 'player_drone',
        class_name: 'agent',
        estimated_position: chest.position!,
        confidence: 1.0,
      },
      {
        label: 'obstacle_wall_a',
        class_name: 'obstacle',
        estimated_position: { x: 0, y: 1.5, z: 8 },
        confidence: 1.0,
      },
      {
        label: 'cyan_gem',
        class_name: 'item',
        estimated_position: { x: -8, y: 0.5, z: 12 },
        confidence: 1.0,
      },
    ];

    const reconcileResult = VisionBridge.reconcileObservation(db, {
      project,
      observer_pose: {
        position: camera.position,
        orientation: camera.orientation,
      },
      detections: afterDetections,
    });

    expect(reconcileResult.confirmed.length).toBeGreaterThanOrEqual(2);
    expect(reconcileResult.missing_or_occluded.some((m) => m.name === 'gold_chest')).toBe(true);

    // -------------------------------------------------------------
    // Phase 8: Spatial SDD Physical Constraint Verification
    // -------------------------------------------------------------
    const spec = SpatialSpecEngine.setSpatialSpec(db, {
      project,
      name: 'arena_safety_contract',
      bounds: {
        min: { x: -20, y: 0, z: -20 },
        max: { x: 20, y: 10, z: 20 },
      },
      constraints: [
        {
          type: 'inside_region',
          entity_id: player.id,
          description: 'Player must remain inside arena boundaries',
        },
        {
          type: 'min_clearance',
          entity_id: player.id,
          target_id: wall.id,
          value: 1.0,
          description: 'Player must maintain at least 1.0m clearance from wall',
        },
      ],
    });

    const verifyResult = SpatialSpecEngine.verifySpatialSpec(db, {
      project,
      name: 'arena_safety_contract',
    });

    expect(verifyResult.is_compliant).toBe(true);
    expect(verifyResult.violations).toHaveLength(0);

    // -------------------------------------------------------------
    // Phase 9: Cryptographic Evidence Pack Generation
    // -------------------------------------------------------------
    const evidencePack = EvidenceEngine.createEvidencePack(db, {
      project,
      task_id: 'task-navigate-gold-chest',
      entity_ids: [player.id, chest.id, wall.id],
    });

    expect(evidencePack.payload_hash).toHaveLength(64);
    expect(evidencePack.state_memory_tool_calls?.mcp_tool_call?.tool).toBe('manage_nodes');
    const toolArgs = evidencePack.state_memory_tool_calls?.mcp_tool_call?.arguments as any;
    expect(toolArgs?.metadata?.sha256_hash).toBe(evidencePack.payload_hash);

    const verified = EvidenceEngine.verifyEvidencePack(db, {
      project,
      id: evidencePack.id,
    });
    expect(verified.valid).toBe(true);
  });
});
