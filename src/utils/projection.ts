import { Vector3D, Orientation3D, BoundingBoxSize, vec3, vec3Normalize } from './math.js';
import {
  CameraState,
  ViewportSize,
  ProjectionResult,
  UnprojectionResult,
  ScreenBoundingBox,
  TilemapConfig,
} from '../schema/types.js';

export interface CameraBasis {
  forward: Vector3D;
  right: Vector3D;
  up: Vector3D;
}

/**
 * Computes forward, right, and up basis vectors from camera Euler orientation.
 * Convention: yaw=0 points towards +Z, yaw=90 towards +X.
 */
export function computeCameraBasis(orientation?: Orientation3D): CameraBasis {
  const yawDeg = orientation?.yaw || 0;
  const pitchDeg = orientation?.pitch || 0;
  const rollDeg = orientation?.roll || 0;

  const yawRad = (yawDeg * Math.PI) / 180;
  const pitchRad = (pitchDeg * Math.PI) / 180;
  const rollRad = (rollDeg * Math.PI) / 180;

  // Forward direction
  const fx = Math.sin(yawRad) * Math.cos(pitchRad);
  const fy = Math.sin(pitchRad);
  const fz = Math.cos(yawRad) * Math.cos(pitchRad);
  const forward = vec3Normalize(vec3(fx, fy, fz));

  // Right direction (perpendicular to forward on horizontal plane)
  let rx = Math.cos(yawRad);
  let ry = 0;
  let rz = -Math.sin(yawRad);

  // Up direction
  let ux = -Math.sin(yawRad) * Math.sin(pitchRad);
  let uy = Math.cos(pitchRad);
  let uz = -Math.cos(yawRad) * Math.sin(pitchRad);

  // Apply roll rotation if present
  if (rollRad !== 0) {
    const cosR = Math.cos(rollRad);
    const sinR = Math.sin(rollRad);
    const newRx = rx * cosR + ux * sinR;
    const newRy = ry * cosR + uy * sinR;
    const newRz = rz * cosR + uz * sinR;
    const newUx = -rx * sinR + ux * cosR;
    const newUy = -ry * sinR + uy * cosR;
    const newUz = -rz * sinR + uz * cosR;
    rx = newRx;
    ry = newRy;
    rz = newRz;
    ux = newUx;
    uy = newUy;
    uz = newUz;
  }

  const right = vec3Normalize(vec3(rx, ry, rz));
  const up = vec3Normalize(vec3(ux, uy, uz));

  return { forward, right, up };
}

/**
 * Projects a single 3D world coordinate into 2D viewport screen coordinates.
 */
export function worldToScreen(
  worldPos: Vector3D,
  camera: CameraState,
  viewport: ViewportSize,
  boundingBox?: BoundingBoxSize
): ProjectionResult {
  const width = Math.max(1, viewport.width || 1920);
  const height = Math.max(1, viewport.height || 1080);
  const fov = camera.fov_degrees || 60;
  const near = camera.near || 0.1;
  const far = camera.far || 1000;
  const aspect = width / height;

  const basis = computeCameraBasis(camera.orientation);

  // Vector from camera to world point
  const vx = worldPos.x - camera.position.x;
  const vy = worldPos.y - camera.position.y;
  const vz = worldPos.z - camera.position.z;

  // Project onto camera local axes
  const camX = vx * basis.right.x + vy * basis.right.y + vz * basis.right.z;
  const camY = vx * basis.up.x + vy * basis.up.y + vz * basis.up.z;
  const camZ = vx * basis.forward.x + vy * basis.forward.y + vz * basis.forward.z;

  const isBehindCamera = camZ <= 0;
  const depth = camZ;

  if (isBehindCamera || camZ < near) {
    return {
      screen_x: -1,
      screen_y: -1,
      depth,
      is_visible: false,
      is_behind_camera: true,
    };
  }

  // Perspective focal length
  const f = 1.0 / Math.tan((fov * Math.PI) / 180 / 2);

  // Normalized Device Coordinates (NDC) [-1, 1]
  const ndcX = (camX * f) / (camZ * aspect);
  const ndcY = (camY * f) / camZ;

  // Screen coordinates (top-left origin)
  const screenX = (ndcX + 1) * 0.5 * width;
  const screenY = (1 - ndcY) * 0.5 * height;

  const isVisible =
    !isBehindCamera &&
    screenX >= 0 &&
    screenX <= width &&
    screenY >= 0 &&
    screenY <= height &&
    camZ >= near &&
    camZ <= far;

  let screenBoundingBox: ScreenBoundingBox | undefined;

  if (boundingBox) {
    screenBoundingBox = computeScreenBoundingBox(worldPos, boundingBox, camera, viewport);
  }

  return {
    screen_x: Math.round(screenX * 10) / 10,
    screen_y: Math.round(screenY * 10) / 10,
    depth: Math.round(depth * 100) / 100,
    is_visible: isVisible,
    is_behind_camera: isBehindCamera,
    screen_bounding_box: screenBoundingBox,
  };
}

/**
 * Computes a 2D screen-space bounding box for a 3D AABB volume.
 */
export function computeScreenBoundingBox(
  center: Vector3D,
  size: BoundingBoxSize,
  camera: CameraState,
  viewport: ViewportSize
): ScreenBoundingBox | undefined {
  const hw = (size.width || 1) / 2;
  const hh = (size.height || 1) / 2;
  const hd = (size.depth || 1) / 2;

  const corners: Vector3D[] = [
    { x: center.x - hw, y: center.y - hh, z: center.z - hd },
    { x: center.x + hw, y: center.y - hh, z: center.z - hd },
    { x: center.x - hw, y: center.y + hh, z: center.z - hd },
    { x: center.x + hw, y: center.y + hh, z: center.z - hd },
    { x: center.x - hw, y: center.y - hh, z: center.z + hd },
    { x: center.x + hw, y: center.y - hh, z: center.z + hd },
    { x: center.x - hw, y: center.y + hh, z: center.z + hd },
    { x: center.x + hw, y: center.y + hh, z: center.z + hd },
  ];

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let anyVisible = false;

  for (const corner of corners) {
    const proj = worldToScreen(corner, camera, viewport);
    if (!proj.is_behind_camera) {
      anyVisible = true;
      if (proj.screen_x < minX) minX = proj.screen_x;
      if (proj.screen_x > maxX) maxX = proj.screen_x;
      if (proj.screen_y < minY) minY = proj.screen_y;
      if (proj.screen_y > maxY) maxY = proj.screen_y;
    }
  }

  if (!anyVisible || minX === Infinity) {
    return undefined;
  }

  // Clamp to viewport
  minX = Math.max(0, minX);
  minY = Math.max(0, minY);
  maxX = Math.min(viewport.width, maxX);
  maxY = Math.min(viewport.height, maxY);

  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);

  return {
    x: Math.round(minX),
    y: Math.round(minY),
    width: Math.round(w),
    height: Math.round(h),
  };
}

/**
 * Unprojects a 2D screen coordinate into a 3D ray in world space.
 */
export function screenToWorldRay(
  screenX: number,
  screenY: number,
  camera: CameraState,
  viewport: ViewportSize,
  groundElevation = 0
): UnprojectionResult {
  const width = Math.max(1, viewport.width || 1920);
  const height = Math.max(1, viewport.height || 1080);
  const fov = camera.fov_degrees || 60;
  const aspect = width / height;

  const basis = computeCameraBasis(camera.orientation);

  // Convert screen coordinates to NDC [-1, 1]
  const ndcX = (screenX / width) * 2 - 1;
  const ndcY = 1 - (screenY / height) * 2;

  // Focal length factor
  const f = 1.0 / Math.tan((fov * Math.PI) / 180 / 2);

  // Camera local ray direction
  const camLocalX = (ndcX * aspect) / f;
  const camLocalY = ndcY / f;
  const camLocalZ = 1.0;

  // Transform ray direction into world space
  const dirX = camLocalX * basis.right.x + camLocalY * basis.up.x + camLocalZ * basis.forward.x;
  const dirY = camLocalX * basis.right.y + camLocalY * basis.up.y + camLocalZ * basis.forward.y;
  const dirZ = camLocalX * basis.right.z + camLocalY * basis.up.z + camLocalZ * basis.forward.z;

  const rayDirection = vec3Normalize(vec3(dirX, dirY, dirZ));
  const rayOrigin = { ...camera.position };

  // Calculate intercept on ground plane (Y = groundElevation)
  let groundIntercept: Vector3D | undefined;

  if (Math.abs(rayDirection.y) > 1e-6) {
    const t = (groundElevation - rayOrigin.y) / rayDirection.y;
    if (t >= 0) {
      groundIntercept = {
        x: Math.round((rayOrigin.x + rayDirection.x * t) * 100) / 100,
        y: groundElevation,
        z: Math.round((rayOrigin.z + rayDirection.z * t) * 100) / 100,
      };
    }
  }

  return {
    ray_origin: rayOrigin,
    ray_direction: rayDirection,
    ground_intercept: groundIntercept,
  };
}

/**
 * 2D Tilemap and Isometric coordinate converter.
 */
export class TilemapMapper {
  static tileToScreen(
    tileX: number,
    tileY: number,
    config: TilemapConfig
  ): { screen_x: number; screen_y: number } {
    const tw = config.tile_width || 32;
    const th = config.tile_height || 32;
    const ox = config.origin_x || 0;
    const oy = config.origin_y || 0;

    if (config.orientation === 'isometric') {
      // 2:1 Isometric diamond projection
      const screenX = ox + (tileX - tileY) * (tw / 2);
      const screenY = oy + (tileX + tileY) * (th / 2);
      return { screen_x: Math.round(screenX), screen_y: Math.round(screenY) };
    }

    // Standard orthogonal top-down
    const screenX = ox + tileX * tw + tw / 2;
    const screenY = oy + tileY * th + th / 2;
    return { screen_x: Math.round(screenX), screen_y: Math.round(screenY) };
  }

  static screenToTile(
    screenX: number,
    screenY: number,
    config: TilemapConfig
  ): { tile_x: number; tile_y: number } {
    const tw = config.tile_width || 32;
    const th = config.tile_height || 32;
    const ox = config.origin_x || 0;
    const oy = config.origin_y || 0;

    const dx = screenX - ox;
    const dy = screenY - oy;

    if (config.orientation === 'isometric') {
      const halfW = tw / 2;
      const halfH = th / 2;
      const tileX = Math.floor((dx / halfW + dy / halfH) / 2);
      const tileY = Math.floor((dy / halfH - dx / halfW) / 2);
      return { tile_x: tileX, tile_y: tileY };
    }

    const tileX = Math.floor(dx / tw);
    const tileY = Math.floor(dy / th);
    return { tile_x: tileX, tile_y: tileY };
  }
}
