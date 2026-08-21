import { describe, it, expect } from 'vitest';
import {
  worldToScreen,
  screenToWorldRay,
  computeCameraBasis,
  computeScreenBoundingBox,
  TilemapMapper,
} from '../../src/utils/projection.js';
import { CameraState, ViewportSize } from '../../src/schema/types.js';

describe('Projection Utilities (src/utils/projection.ts)', () => {
  const defaultCamera: CameraState = {
    position: { x: 0, y: 10, z: 20 },
    orientation: { pitch: -25, yaw: 0, roll: 0 },
    fov_degrees: 60,
    near: 0.1,
    far: 1000,
  };

  const defaultViewport: ViewportSize = {
    width: 1920,
    height: 1080,
  };

  it('computes camera basis vectors correctly', () => {
    const basis = computeCameraBasis({ yaw: 0, pitch: 0, roll: 0 });
    expect(basis.forward.z).toBeCloseTo(1.0, 2);
    expect(basis.right.x).toBeCloseTo(1.0, 2);
    expect(basis.up.y).toBeCloseTo(1.0, 2);

    // Turned 90 deg right (yaw = 90)
    const basis90 = computeCameraBasis({ yaw: 90, pitch: 0, roll: 0 });
    expect(basis90.forward.x).toBeCloseTo(1.0, 2);
    expect(basis90.right.z).toBeCloseTo(-1.0, 2);

    // Roll angle applied
    const basisRoll = computeCameraBasis({ yaw: 0, pitch: 0, roll: 45 });
    expect(basisRoll.right.y).toBeGreaterThan(0);
    expect(basisRoll.up.x).toBeLessThan(0);
  });

  it('projects world coordinates directly in front of camera to screen center', () => {
    const forwardPoint = { x: 0, y: 10, z: 40 };
    const levelCam: CameraState = {
      position: { x: 0, y: 10, z: 20 },
      orientation: { pitch: 0, yaw: 0, roll: 0 },
      fov_degrees: 60,
      near: 0.1,
      far: 1000,
    };

    const proj = worldToScreen(forwardPoint, levelCam, defaultViewport);
    expect(proj.is_visible).toBe(true);
    expect(proj.is_behind_camera).toBe(false);
    expect(proj.screen_x).toBeCloseTo(960, 1);
    expect(proj.screen_y).toBeCloseTo(540, 1);
    expect(proj.depth).toBeCloseTo(20, 1);
  });

  it('detects points behind camera or outside viewport bounds', () => {
    const behindPoint = { x: 0, y: 10, z: 0 };
    const levelCam: CameraState = {
      position: { x: 0, y: 10, z: 20 },
      orientation: { pitch: 0, yaw: 0, roll: 0 },
      fov_degrees: 60,
      near: 0.1,
      far: 1000,
    };

    const proj = worldToScreen(behindPoint, levelCam, defaultViewport);
    expect(proj.is_behind_camera).toBe(true);
    expect(proj.is_visible).toBe(false);
  });

  it('computes 2D screen bounding box for 3D AABB volume', () => {
    const objPos = { x: 0, y: 0, z: 10 };
    const objSize = { width: 2, height: 2, depth: 2 };
    const levelCam: CameraState = {
      position: { x: 0, y: 0, z: 0 },
      orientation: { pitch: 0, yaw: 0, roll: 0 },
      fov_degrees: 60,
    };

    const bbox = computeScreenBoundingBox(objPos, objSize, levelCam, defaultViewport);
    expect(bbox).toBeDefined();
    expect(bbox!.width).toBeGreaterThan(50);
    expect(bbox!.height).toBeGreaterThan(50);
    expect(bbox!.x).toBeLessThan(960);
  });

  it('unprojects 2D screen pixels to 3D world ray and computes ground intercept', () => {
    const levelCam: CameraState = {
      position: { x: 0, y: 10, z: 0 },
      orientation: { pitch: -45, yaw: 0, roll: 0 },
      fov_degrees: 60,
    };

    const unproj = screenToWorldRay(960, 540, levelCam, defaultViewport, 0);
    expect(unproj.ray_origin).toEqual({ x: 0, y: 10, z: 0 });
    expect(unproj.ray_direction.y).toBeLessThan(0); // pointing downward
    expect(unproj.ground_intercept).toBeDefined();
    expect(unproj.ground_intercept!.y).toBe(0);
    expect(unproj.ground_intercept!.z).toBeGreaterThan(0);
  });

  it('handles 2D orthogonal tilemap conversions correctly', () => {
    const config = {
      tile_width: 32,
      tile_height: 32,
      orientation: 'orthogonal' as const,
      origin_x: 100,
      origin_y: 100,
    };

    const screen = TilemapMapper.tileToScreen(2, 3, config);
    expect(screen.screen_x).toBe(100 + 2 * 32 + 16);
    expect(screen.screen_y).toBe(100 + 3 * 32 + 16);

    const tile = TilemapMapper.screenToTile(screen.screen_x, screen.screen_y, config);
    expect(tile.tile_x).toBe(2);
    expect(tile.tile_y).toBe(3);
  });

  it('handles 2D isometric tilemap conversions correctly', () => {
    const config = {
      tile_width: 64,
      tile_height: 32,
      orientation: 'isometric' as const,
      origin_x: 500,
      origin_y: 200,
    };

    const screen = TilemapMapper.tileToScreen(4, 2, config);
    expect(screen.screen_x).toBe(500 + (4 - 2) * 32);
    expect(screen.screen_y).toBe(200 + (4 + 2) * 16);

    const tile = TilemapMapper.screenToTile(screen.screen_x, screen.screen_y, config);
    expect(tile.tile_x).toBe(4);
    expect(tile.tile_y).toBe(2);
  });
});
