export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface Orientation3D {
  pitch?: number;
  yaw?: number;
  roll?: number;
}

export interface BoundingBox3D {
  min: Vector3D;
  max: Vector3D;
}

export interface BoundingBoxSize {
  width: number;
  height: number;
  depth: number;
}

export function vec3(x = 0, y = 0, z = 0): Vector3D {
  return { x, y, z };
}

export function vec3Add(a: Vector3D, b: Vector3D): Vector3D {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function vec3Sub(a: Vector3D, b: Vector3D): Vector3D {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function vec3Scale(a: Vector3D, scale: number): Vector3D {
  return { x: a.x * scale, y: a.y * scale, z: a.z * scale };
}

export function vec3Distance(a: Vector3D, b: Vector3D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function vec3DistanceManhattan(a: Vector3D, b: Vector3D): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
}

export function vec3Length(a: Vector3D): number {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

export function vec3Normalize(a: Vector3D): Vector3D {
  const len = vec3Length(a);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return { x: a.x / len, y: a.y / len, z: a.z / len };
}

export function vec3Lerp(a: Vector3D, b: Vector3D, t: number): Vector3D {
  const clampedT = Math.max(0, Math.min(1, t));
  return {
    x: a.x + (b.x - a.x) * clampedT,
    y: a.y + (b.y - a.y) * clampedT,
    z: a.z + (b.z - a.z) * clampedT,
  };
}

export function aabbFromCenterSize(center: Vector3D, size: BoundingBoxSize): BoundingBox3D {
  const hw = (size.width || 1) / 2;
  const hh = (size.height || 1) / 2;
  const hd = (size.depth || 1) / 2;
  return {
    min: { x: center.x - hw, y: center.y - hh, z: center.z - hd },
    max: { x: center.x + hw, y: center.y + hh, z: center.z + hd },
  };
}

export function aabbContainsPoint(box: BoundingBox3D, pt: Vector3D): boolean {
  return (
    pt.x >= box.min.x &&
    pt.x <= box.max.x &&
    pt.y >= box.min.y &&
    pt.y <= box.max.y &&
    pt.z >= box.min.z &&
    pt.z <= box.max.z
  );
}

export function aabbIntersects(a: BoundingBox3D, b: BoundingBox3D): boolean {
  return (
    a.min.x <= b.max.x &&
    a.max.x >= b.min.x &&
    a.min.y <= b.max.y &&
    a.max.y >= b.min.y &&
    a.min.z <= b.max.z &&
    a.max.z >= b.min.z
  );
}

export function normalizeAngle(angleDegrees: number): number {
  let angle = angleDegrees % 360;
  if (angle < 0) angle += 360;
  return angle;
}

/**
 * Checks if a target position falls inside an observer field of view cone.
 */
export function pointInFrustumCone(
  observerPos: Vector3D,
  observerYaw: number,
  targetPos: Vector3D,
  fovDegrees = 90,
  maxDistance = 50
): { visible: boolean; distance: number; angleOffset: number } {
  const dist = vec3Distance(observerPos, targetPos);
  if (dist > maxDistance) {
    return { visible: false, distance: dist, angleOffset: 180 };
  }
  if (dist === 0) {
    return { visible: true, distance: 0, angleOffset: 0 };
  }

  // 2D horizontal angle calculation
  const dx = targetPos.x - observerPos.x;
  const dz = targetPos.z - observerPos.z;
  const targetAngleRad = Math.atan2(dx, dz);
  const targetAngleDeg = normalizeAngle((targetAngleRad * 180) / Math.PI);
  const obsYawNorm = normalizeAngle(observerYaw);

  let diff = Math.abs(targetAngleDeg - obsYawNorm);
  if (diff > 180) diff = 360 - diff;

  const halfFov = fovDegrees / 2;
  const visible = diff <= halfFov;

  return { visible, distance: dist, angleOffset: diff };
}

/**
 * Tests if a 3D ray intersects an AABB bounding box within max distance t.
 */
export function rayAabbIntersect(
  origin: Vector3D,
  direction: Vector3D,
  box: BoundingBox3D,
  maxT = Infinity
): { hit: boolean; t: number } {
  let tmin = 0;
  let tmax = maxT;

  const dims: (keyof Vector3D)[] = ['x', 'y', 'z'];
  for (const d of dims) {
    if (Math.abs(direction[d]) < 1e-8) {
      if (origin[d] < box.min[d] || origin[d] > box.max[d]) {
        return { hit: false, t: Infinity };
      }
    } else {
      const invD = 1.0 / direction[d];
      let t1 = (box.min[d] - origin[d]) * invD;
      let t2 = (box.max[d] - origin[d]) * invD;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) {
        return { hit: false, t: Infinity };
      }
    }
  }

  const hit = tmin <= tmax && tmax >= 0 && tmin <= maxT;
  return { hit, t: tmin };
}
