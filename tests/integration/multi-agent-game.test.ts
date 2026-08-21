import { describe, it, expect } from 'vitest';
import { getDb } from '../../src/engine/db.js';
import { EntityStore } from '../../src/engine/entity-store.js';
import { SpatialBlackboard } from '../../src/engine/blackboard.js';
import { NavigationEngine } from '../../src/engine/navigation.js';
import { GameControlsEngine } from '../../src/engine/game-controls.js';

describe('Multi-Agent 3D Game Navigation & Coordination Integration Suite', () => {
  const project = 'multi-agent-3d-arena';
  const db = getDb(project);

  it('coordinates multiple agents navigating in shared 3D game arena with resource locks and collision alerts', () => {
    db.prepare('DELETE FROM entities WHERE project = ?').run(project);
    db.prepare('DELETE FROM spatial_relations WHERE project = ?').run(project);
    db.prepare('DELETE FROM blackboard_items WHERE project = ?').run(project);

    // 1. Create Agents and Items

    const agentA = EntityStore.addEntity(db, {
      project,
      name: 'Agent Drone Alpha',
      type: 'agent',
      position: { x: -10, y: 0.5, z: 0 },
      orientation: { yaw: 0 },
      bounding_box: { width: 1.2, height: 0.8, depth: 1.2 },
    });

    const agentB = EntityStore.addEntity(db, {
      project,
      name: 'Agent Drone Beta',
      type: 'agent',
      position: { x: 10, y: 0.5, z: 0 },
      orientation: { yaw: 0 },
      bounding_box: { width: 1.2, height: 0.8, depth: 1.2 },
    });

    const chestGold = EntityStore.addEntity(db, {
      project,
      name: 'Center Gold Chest',
      type: 'item',
      position: { x: 0, y: 0.5, z: 10 },
      bounding_box: { width: 1, height: 1, depth: 1 },
    });

    const chestCyan = EntityStore.addEntity(db, {
      project,
      name: 'Side Cyan Gem',
      type: 'item',
      position: { x: 12, y: 0.5, z: 10 },
      bounding_box: { width: 1, height: 1, depth: 1 },
    });

    // 2. Agent Alpha claims the Center Gold Chest
    const claimA = SpatialBlackboard.claim(db, {
      project,
      resource_id: chestGold.id,
      agent_id: agentA.id,
      duration_seconds: 30,
    });
    expect(claimA.success).toBe(true);

    // 3. Agent Beta attempts to claim the same chest -> fails because already claimed by Alpha
    const claimB = SpatialBlackboard.claim(db, {
      project,
      resource_id: chestGold.id,
      agent_id: agentB.id,
      duration_seconds: 30,
    });
    expect(claimB.success).toBe(false);
    expect(claimB.message).toContain('currently claimed');

    // 4. Agent Alpha posts movement intention to Center Gold Chest
    const postAlpha = SpatialBlackboard.post(db, {
      project,
      topic: 'agent_navigation_intents',
      sender: agentA.id,
      payload: {
        destination: chestGold.position,
        current_pos: agentA.position,
      },
    });
    expect(postAlpha.collision_warnings).toBeUndefined();

    // 5. Agent Beta attempts to move directly to the same spot -> triggers collision warning
    const postBeta = SpatialBlackboard.post(db, {
      project,
      topic: 'agent_navigation_intents',
      sender: agentB.id,
      payload: {
        destination: { x: 0.5, y: 0.5, z: 10.5 }, // 0.7m away from Alpha's destination (< 2.0m threshold)
        current_pos: agentB.position,
      },
    });
    expect(postBeta.collision_warnings).toBeDefined();
    expect(postBeta.collision_warnings!.length).toBeGreaterThan(0);
    expect(postBeta.collision_warnings![0]).toContain('proximity alert');

    // 6. Agent Beta reroutes to Side Cyan Gem and successfully claims it
    const claimBetaGem = SpatialBlackboard.claim(db, {
      project,
      resource_id: chestCyan.id,
      agent_id: agentB.id,
      duration_seconds: 30,
    });
    expect(claimBetaGem.success).toBe(true);

    // 7. Both agents generate valid WASD movement commands to their respective targets
    const navA = NavigationEngine.getNavigationHints(db, {
      project,
      start_entity_id: agentA.id,
      target_entity_id: chestGold.id,
    });
    const inputsA = GameControlsEngine.generateInputs({
      current_position: agentA.position!,
      target_position: chestGold.position!,
      waypoints: navA.hints.map((h) => h.to_position!).filter(Boolean),
      control_profile: { scheme: 'wasd', move_speed: 5.0 },
    });
    expect(inputsA.actions.length).toBeGreaterThan(0);

    const navB = NavigationEngine.getNavigationHints(db, {
      project,
      start_entity_id: agentB.id,
      target_entity_id: chestCyan.id,
    });
    const inputsB = GameControlsEngine.generateInputs({
      current_position: agentB.position!,
      target_position: chestCyan.position!,
      waypoints: navB.hints.map((h) => h.to_position!).filter(Boolean),
      control_profile: { scheme: 'wasd', move_speed: 5.0 },
    });
    expect(inputsB.actions.length).toBeGreaterThan(0);

    // 8. Agent Alpha releases the claim after collection
    const releaseA = SpatialBlackboard.release(db, {
      project,
      resource_id: chestGold.id,
      agent_id: agentA.id,
    });
    expect(releaseA.success).toBe(true);
  });
});
