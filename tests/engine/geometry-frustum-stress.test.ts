import { describe, it, expect } from 'vitest';
import { getDb } from '../../src/engine/db.js';
import { EntityStore } from '../../src/engine/entity-store.js';
import { FrustumEngine } from '../../src/engine/frustum.js';
import {
  worldToScreen,
  screenToWorldRay,
  computeScreenBoundingBox,
} from '../../src/utils/projection.js';
import { CameraState, ViewportSize } from '../../src/schema/types.js';

describe('3D Geometry, Frustum & Projection Stress Test Suite', () => {
  const project = 'test-geometry-frustum-stress';
  const db = getDb(project);

  const viewport: ViewportSize = {
    width: 1920,
    height: 1080,
  };

  it('correctly calculates multi-tier cascading occlusion', () => {
    // Observer at (0, 0, 0) looking along +Z (yaw: 0)
    // Wall 1 at (0, 0, 10), width: 10, height: 10
    // Wall 2 at (0, 0, 20), width: 10, height: 10
    // Chest at (0, 0, 30)
    const wall1 = EntityStore.addEntity(db, {
      project,
      name: 'Occluder Wall Front',
      type: 'obstacle',
      position: { x: 0, y: 0, z: 10 },
      bounding_box: { width: 10, height: 10, depth: 1 },
    });

    const wall2 = EntityStore.addEntity(db, {
      project,
      name: 'Occluder Wall Behind',
      type: 'obstacle',
      position: { x: 0, y: 0, z: 20 },
      bounding_box: { width: 10, height: 10, depth: 1 },
    });

    const chest = EntityStore.addEntity(db, {
      project,
      name: 'Hidden Chest',
      type: 'item',
      position: { x: 0, y: 0, z: 30 },
      bounding_box: { width: 1, height: 1, depth: 1 },
    });

    const expected = FrustumEngine.getExpectedView(db, {
      project,
      observer_position: { x: 0, y: 0, z: 0 },
      observer_orientation: { yaw: 0, pitch: 0, roll: 0 },
      fov_degrees: 90,
      enable_occlusion: true,
    });

    // Wall 1 is closest and not occluded
    const w1Result = expected.visible_entities.find((v) => v.entity.id === wall1.id);
    expect(w1Result).toBeDefined();
    expect(w1Result!.is_occluded).toBe(false);

    // Wall 2 is behind Wall 1 and occluded by Wall 1
    const w2Result = expected.visible_entities.find((v) => v.entity.id === wall2.id);
    expect(w2Result).toBeDefined();
    expect(w2Result!.is_occluded).toBe(true);
    expect(w2Result!.occluded_by_id).toBe(wall1.id);

    // Chest is behind Wall 1 and occluded by Wall 1
    const chestResult = expected.visible_entities.find((v) => v.entity.id === chest.id);
    expect(chestResult).toBeDefined();
    expect(chestResult!.is_occluded).toBe(true);
    expect(chestResult!.occluded_by_id).toBe(wall1.id);
  });

  it('handles extreme pitch angles (straight down and straight up)', () => {
    const groundPoint = { x: 0, y: 0, z: 0 };

    // Camera directly above looking straight down (pitch: -90)
    const topDownCam: CameraState = {
      position: { x: 0, y: 20, z: 0 },
      orientation: { pitch: -90, yaw: 0, roll: 0 },
      fov_degrees: 60,
    };

    const projDown = worldToScreen(groundPoint, topDownCam, viewport);
    expect(projDown.is_visible).toBe(true);
    expect(projDown.screen_x).toBeCloseTo(960, 0);
    expect(projDown.screen_y).toBeCloseTo(540, 0);

    // Camera on ground looking straight up (pitch: +90)
    const skyPoint = { x: 0, y: 50, z: 0 };
    const lookUpCam: CameraState = {
      position: { x: 0, y: 0, z: 0 },
      orientation: { pitch: 90, yaw: 0, roll: 0 },
      fov_degrees: 60,
    };

    const projUp = worldToScreen(skyPoint, lookUpCam, viewport);
    expect(projUp.is_visible).toBe(true);
    expect(projUp.screen_x).toBeCloseTo(960, 0);
    expect(projUp.screen_y).toBeCloseTo(540, 0);
  });

  it('handles wide fisheye FOV and telephoto zoom FOV', () => {
    const offCenterPoint = { x: 15, y: 0, z: 20 };

    // Telephoto FOV (15 deg) - off-center point should be outside viewport
    const telephotoCam: CameraState = {
      position: { x: 0, y: 0, z: 0 },
      orientation: { pitch: 0, yaw: 0, roll: 0 },
      fov_degrees: 15,
    };
    const projTele = worldToScreen(offCenterPoint, telephotoCam, viewport);
    expect(projTele.is_visible).toBe(false);

    // Fisheye FOV (120 deg) - off-center point should be visible
    const fisheyeCam: CameraState = {
      position: { x: 0, y: 0, z: 0 },
      orientation: { pitch: 0, yaw: 0, roll: 0 },
      fov_degrees: 120,
    };
    const projFish = worldToScreen(offCenterPoint, fisheyeCam, viewport);
    expect(projFish.is_visible).toBe(true);
  });

  it('unprojects rays from all 4 viewport corners', () => {
    const cam: CameraState = {
      position: { x: 0, y: 10, z: 0 },
      orientation: { pitch: -45, yaw: 0, roll: 0 },
      fov_degrees: 60,
    };

    const corners = [
      { x: 0, y: 0 },
      { x: 1920, y: 0 },
      { x: 1920, y: 1080 },
      { x: 0, y: 1080 },
    ];

    for (const c of corners) {
      const ray = screenToWorldRay(c.x, c.y, cam, viewport, 0);
      expect(ray.ray_origin).toEqual(cam.position);
      expect(ray.ray_direction).toBeDefined();
    }
  });

  it('clamps 2D screen bounding box when 3D object extends beyond screen boundary', () => {
    // Large object near the left edge of screen
    const edgeObject = { x: -8, y: 0, z: 10 };
    const largeSize = { width: 10, height: 10, depth: 10 };

    const cam: CameraState = {
      position: { x: 0, y: 0, z: 0 },
      orientation: { pitch: 0, yaw: 0, roll: 0 },
      fov_degrees: 60,
    };

    const bbox = computeScreenBoundingBox(edgeObject, largeSize, cam, viewport);
    expect(bbox).toBeDefined();
    expect(bbox!.x).toBeGreaterThanOrEqual(0);
    expect(bbox!.y).toBeGreaterThanOrEqual(0);
    expect(bbox!.x + bbox!.width).toBeLessThanOrEqual(viewport.width);
  });
});
