import { describe, it, expect } from 'vitest';
import {
  vec3,
  vec3Add,
  vec3Sub,
  vec3Scale,
  vec3Length,
  vec3Normalize,
  vec3Distance,
  vec3DistanceManhattan,
  vec3Lerp,
  aabbFromCenterSize,
  aabbContainsPoint,
  aabbIntersects,
  normalizeAngle,
  pointInFrustumCone,
} from '../../src/utils/math.js';

describe('Math Utilities Complete', () => {
  it('performs vector arithmetic and scaling', () => {
    const a = vec3(1, 2, 3);
    const b = vec3(4, 5, 6);

    expect(vec3Add(a, b)).toEqual({ x: 5, y: 7, z: 9 });
    expect(vec3Sub(b, a)).toEqual({ x: 3, y: 3, z: 3 });
    expect(vec3Scale(a, 2)).toEqual({ x: 2, y: 4, z: 6 });
    expect(vec3Distance(vec3(0, 0, 0), vec3(3, 4, 0))).toBe(5);
    expect(vec3DistanceManhattan(vec3(1, 1, 1), vec3(4, 5, 6))).toBe(3 + 4 + 5);
    expect(vec3Length(vec3(0, 3, 4))).toBe(5);
    expect(vec3Normalize(vec3(0, 0, 0))).toEqual({ x: 0, y: 0, z: 0 });
    expect(vec3Normalize(vec3(0, 10, 0))).toEqual({ x: 0, y: 1, z: 0 });
    expect(vec3Lerp(vec3(0, 0, 0), vec3(10, 10, 10), 0.5)).toEqual({ x: 5, y: 5, z: 5 });
    expect(vec3Lerp(vec3(0, 0, 0), vec3(10, 10, 10), -1)).toEqual({ x: 0, y: 0, z: 0 });
    expect(vec3Lerp(vec3(0, 0, 0), vec3(10, 10, 10), 2)).toEqual({ x: 10, y: 10, z: 10 });
  });

  it('handles angle normalization', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(450)).toBe(90);
    expect(normalizeAngle(-90)).toBe(270);
  });

  it('handles AABB bounding boxes and collisions', () => {
    const boxA = aabbFromCenterSize(vec3(0, 0, 0), { width: 2, height: 2, depth: 2 });
    expect(boxA).toEqual({
      min: { x: -1, y: -1, z: -1 },
      max: { x: 1, y: 1, z: 1 },
    });

    expect(aabbContainsPoint(boxA, vec3(0.5, 0.5, 0.5))).toBe(true);
    expect(aabbContainsPoint(boxA, vec3(2, 0, 0))).toBe(false);

    const boxB = aabbFromCenterSize(vec3(1.5, 0, 0), { width: 2, height: 2, depth: 2 });
    expect(aabbIntersects(boxA, boxB)).toBe(true);

    const boxC = aabbFromCenterSize(vec3(5, 0, 0), { width: 2, height: 2, depth: 2 });
    expect(aabbIntersects(boxA, boxC)).toBe(false);
  });

  it('calculates frustum visibility correctly', () => {
    const obsPos = vec3(0, 0, 0);
    const obsYaw = 0;

    const inFront = pointInFrustumCone(obsPos, obsYaw, vec3(0, 0, 10), 90, 50);
    expect(inFront.visible).toBe(true);
    expect(inFront.distance).toBe(10);

    const atObserver = pointInFrustumCone(obsPos, obsYaw, vec3(0, 0, 0), 90, 50);
    expect(atObserver.visible).toBe(true);
    expect(atObserver.distance).toBe(0);

    const behind = pointInFrustumCone(obsPos, obsYaw, vec3(0, 0, -10), 90, 50);
    expect(behind.visible).toBe(false);

    const farAway = pointInFrustumCone(obsPos, obsYaw, vec3(0, 0, 100), 90, 50);
    expect(farAway.visible).toBe(false);
  });
});
