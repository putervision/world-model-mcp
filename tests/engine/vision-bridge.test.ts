import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from '../../src/engine/db.js';
import { EntityStore } from '../../src/engine/entity-store.js';
import { VisionBridge } from '../../src/engine/vision-bridge.js';

describe('Vision Bridge Complete', () => {
  const project = 'test-vision-bridge-full';
  const db = getDb(project);

  beforeEach(() => {
    db.prepare('DELETE FROM entities WHERE project = ?').run(project);
    db.prepare('DELETE FROM observations WHERE project = ?').run(project);
  });

  it('ingests detections and re-identifies existing nearby entities', () => {
    const existing = EntityStore.addEntity(db, {
      project,
      name: 'Patrol Guard',
      type: 'npc',
      position: { x: 5, y: 0, z: 5 },
      confidence: 0.6,
    });

    const ingestRes = VisionBridge.ingestObservation(db, {
      project,
      visual_state_id: 'vs-100',
      observer_pose: {
        position: { x: 0, y: 0, z: 0 },
        orientation: { yaw: 0 },
      },
      detections: [
        {
          label: 'Patrol Guard',
          class_name: 'npc',
          confidence: 0.95,
          estimated_position: { x: 5.5, y: 0, z: 5.2 }, // Within 3.0 distance threshold
        },
        {
          label: 'New Dragon',
          class_name: 'npc',
          confidence: 0.9,
          estimated_position: { x: 50, y: 0, z: 50 },
        },
      ],
    });

    expect(ingestRes.updated_entities).toContain(existing.id);
    expect(ingestRes.created_entities.length).toBe(1);

    const guard = EntityStore.getEntity(db, { project, id: existing.id });
    expect(guard?.confidence).toBe(1.0);
  });

  it('ingests direct game engine telemetry with player coordinates and entity bounding boxes', () => {
    const res = VisionBridge.ingestGameTelemetry(db, {
      project,
      player: {
        id: 'player_hero',
        name: 'Player_Hero',
        position: { x: 12, y: 0, z: 18 },
        orientation: { yaw: 90 },
        hp: 85,
        max_hp: 100,
        mana: 50,
      },
      entities: [
        {
          id: 'boss_dragon',
          name: 'Elder Dragon',
          type: 'npc',
          position: { x: 30, y: 5, z: 40 },
          bounding_box: { min: { x: 28, y: 0, z: 38 }, max: { x: 32, y: 10, z: 42 } },
        },
      ],
    });

    expect(res.player_id).toBe('player_hero');
    expect(res.created_entities).toContain('player_hero');
    expect(res.created_entities).toContain('boss_dragon');

    // Update telemetry
    const updateRes = VisionBridge.ingestGameTelemetry(db, {
      project,
      player: {
        id: 'player_hero',
        position: { x: 15, y: 0, z: 20 },
        hp: 70,
      },
      entities: [
        {
          id: 'boss_dragon',
          name: 'Elder Dragon',
          position: { x: 29, y: 5, z: 39 },
        },
      ],
    });

    expect(updateRes.updated_entities).toContain('player_hero');
    expect(updateRes.updated_entities).toContain('boss_dragon');

    const hero = EntityStore.getEntity(db, { project, id: 'player_hero' });
    expect(hero?.properties.hp).toBe(70);
  });
});
