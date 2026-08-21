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
});
