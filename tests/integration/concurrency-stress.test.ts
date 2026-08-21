import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/engine/migrations.js';
import { EntityStore } from '../../src/engine/entity-store.js';
import { SpatialGraph } from '../../src/engine/spatial-graph.js';
import { SpatialBlackboard } from '../../src/engine/blackboard.js';
import { VisionBridge } from '../../src/engine/vision-bridge.js';

describe('Concurrency & Multi-Agent SQLite Stress Suite', () => {
  let db: Database.Database;
  const project = 'concurrency-stress-project';

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('handles 20 concurrent agent tasks performing parallel entity updates, graph linking, and blackboard operations', async () => {
    const NUM_AGENTS = 20;

    // Concurrently launch NUM_AGENTS tasks
    const tasks = Array.from({ length: NUM_AGENTS }, async (_, i) => {
      const agentId = `agent_${String(i).padStart(2, '0')}`;

      // 1. Add agent entity
      const agentEnt = EntityStore.addEntity(db, {
        project,
        name: `Agent_${i}`,
        type: 'agent',
        position: { x: i * 2, y: 0, z: i * 2 },
      });

      // 2. Add an objective entity
      const targetEnt = EntityStore.addEntity(db, {
        project,
        name: `Target_${i}`,
        type: 'object',
        position: { x: i * 2 + 1, y: 0, z: i * 2 + 1 },
      });

      // 3. Link relation
      SpatialGraph.setRelation(db, {
        project,
        source_id: agentEnt.id,
        relation: 'near',
        target_id: targetEnt.id,
        distance: 1.414,
      });

      // 4. Ingest vision observation
      VisionBridge.ingestObservation(db, {
        project,
        visual_state_id: `vs_${agentId}`,
        observer_pose: {
          position: { x: i * 2, y: 0, z: i * 2 },
          orientation: { pitch: 0, yaw: 0, roll: 0 },
        },
        field_of_view: { fov_horizontal: 75, fov_vertical: 50 },
        detections: [
          {
            label: 'object',
            class_name: 'object',
            confidence: 0.95,
            bounding_box_3d: {
              center: { x: i * 2 + 1, y: 0, z: i * 2 + 1 },
              size: { width: 1, height: 1, depth: 1 },
            },
          },
        ],
      });

      // 5. Post to blackboard
      SpatialBlackboard.post(db, {
        project,
        sender: agentId,
        topic: 'zone_assignment',
        payload: { assigned_zone: `zone_${i}`, status: 'patrolling' },
      });

      return { agentId, agentEnt, targetEnt };
    });

    const results = await Promise.all(tasks);
    expect(results.length).toBe(NUM_AGENTS);

    // Verify entity total count: 20 agents + 20 targets = at least 40
    const allEntities = EntityStore.listEntities(db, { project, limit: 1000 });
    expect(allEntities.length).toBeGreaterThanOrEqual(40);

    // Verify relations count
    const allRelations = SpatialGraph.getRelations(db, { project });
    expect(allRelations.length).toBe(NUM_AGENTS);

    // Verify blackboard messages
    const messages = SpatialBlackboard.read(db, { project, topic: 'zone_assignment' });
    expect(messages.length).toBe(NUM_AGENTS);
  });

  it('handles concurrent lock claim/release on shared resource without lock corruption', () => {
    const resourceTopic = 'nav_waypoint_alpha';

    // Agent A claims lock
    const claimA = SpatialBlackboard.claim(db, {
      project,
      agent_id: 'agent_alpha',
      resource_id: resourceTopic,
      duration_seconds: 10,
    });
    expect(claimA.success).toBe(true);

    // Agent B attempts to claim same resource (should fail)
    const claimB = SpatialBlackboard.claim(db, {
      project,
      agent_id: 'agent_bravo',
      resource_id: resourceTopic,
      duration_seconds: 10,
    });
    expect(claimB.success).toBe(false);
    expect(claimB.message).toContain('currently claimed by agent "agent_alpha"');

    // Agent A releases lock
    const release = SpatialBlackboard.release(db, {
      project,
      agent_id: 'agent_alpha',
      resource_id: resourceTopic,
    });
    expect(release.success).toBe(true);

    // Agent B now claims lock successfully
    const claimBRetry = SpatialBlackboard.claim(db, {
      project,
      agent_id: 'agent_bravo',
      resource_id: resourceTopic,
      duration_seconds: 10,
    });
    expect(claimBRetry.success).toBe(true);
  });

  it('prunes expired blackboard items accurately', () => {
    // Post expired item (backdated timestamp)
    SpatialBlackboard.post(db, {
      project,
      sender: 'agent_old',
      topic: 'ephemeral',
      payload: { data: 'stale' },
      ttl_seconds: 1, // 1s ttl
    });

    // Manually backdate expires_at
    const past = new Date(Date.now() - 5000).toISOString();
    db.prepare("UPDATE blackboard_items SET expires_at = ? WHERE topic = 'ephemeral'").run(past);

    const pruned = SpatialBlackboard.pruneExpired(db, { project });
    expect(pruned).toBe(1);

    const remaining = SpatialBlackboard.read(db, { project, topic: 'ephemeral' });
    expect(remaining.length).toBe(0);
  });
});
