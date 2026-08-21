import { describe, it, expect } from 'vitest';
import { worldToScreen, screenToWorldRay, computeCameraBasis } from '../../src/utils/projection.js';
import {
  Vector3D,
  vec3Distance,
  vec3Normalize,
  vec3Length,
  aabbFromCenterSize,
  aabbContainsPoint,
  aabbIntersects,
  rayAabbIntersect,
  pointInFrustumCone,
} from '../../src/utils/math.js';
import { CameraState, ViewportSize } from '../../src/schema/types.js';

describe('Spatial & Mathematical Invariants Suite (Property-Based & Invariant Checks)', () => {
  const camera: CameraState = {
    position: { x: 0, y: 5, z: 10 },
    orientation: { pitch: -20, yaw: 180, roll: 0 },
    fov_degrees: 75,
    near: 0.1,
    far: 1000,
  };

  const viewport: ViewportSize = {
    width: 1920,
    height: 1080,
  };

  describe('3D Screen Projection & Ray Unprojection Invariants', () => {
    it('unprojects screen center directly along camera forward gaze vector', () => {
      const centerX = viewport.width / 2;
      const centerY = viewport.height / 2;
      const unproject = screenToWorldRay(centerX, centerY, camera, viewport);

      // Ray origin must equal camera position
      expect(unproject.ray_origin.x).toBeCloseTo(camera.position.x, 3);
      expect(unproject.ray_origin.y).toBeCloseTo(camera.position.y, 3);
      expect(unproject.ray_origin.z).toBeCloseTo(camera.position.z, 3);

      // Forward gaze vector must be normalized (length = 1.0)
      const len = vec3Length(unproject.ray_direction);
      expect(len).toBeCloseTo(1.0, 4);
    });

    it('satisfies camera basis orthogonality (forward, right, up)', () => {
      const basis = computeCameraBasis({ pitch: 15, yaw: 45, roll: 0 });

      const lenF = vec3Length(basis.forward);
      const lenR = vec3Length(basis.right);
      const lenU = vec3Length(basis.up);

      expect(lenF).toBeCloseTo(1.0, 4);
      expect(lenR).toBeCloseTo(1.0, 4);
      expect(lenU).toBeCloseTo(1.0, 4);

      // Dot products must be 0 for orthogonal vectors
      const dotFR =
        basis.forward.x * basis.right.x +
        basis.forward.y * basis.right.y +
        basis.forward.z * basis.right.z;
      const dotFU =
        basis.forward.x * basis.up.x + basis.forward.y * basis.up.y + basis.forward.z * basis.up.z;
      const dotRU =
        basis.right.x * basis.up.x + basis.right.y * basis.up.y + basis.right.z * basis.up.z;

      expect(dotFR).toBeCloseTo(0, 3);
      expect(dotFU).toBeCloseTo(0, 3);
      expect(dotRU).toBeCloseTo(0, 3);
    });

    it('satisfies frustum cone visibility invariance', () => {
      const observerPos: Vector3D = { x: 0, y: 0, z: 0 };
      const observerYaw = 0; // facing +Z

      // Directly ahead within 50m
      const ahead = pointInFrustumCone(observerPos, observerYaw, { x: 0, y: 0, z: 20 }, 90, 50);
      expect(ahead.visible).toBe(true);
      expect(ahead.distance).toBeCloseTo(20, 2);

      // Directly behind
      const behind = pointInFrustumCone(observerPos, observerYaw, { x: 0, y: 0, z: -20 }, 90, 50);
      expect(behind.visible).toBe(false);

      // Outside max distance
      const tooFar = pointInFrustumCone(observerPos, observerYaw, { x: 0, y: 0, z: 100 }, 90, 50);
      expect(tooFar.visible).toBe(false);
    });
  });

  describe('Metric Distance & AABB Collision Invariants', () => {
    it('satisfies Euclidean distance metric axioms (identity, symmetry, triangle inequality)', () => {
      const pA: Vector3D = { x: 1.5, y: 2.0, z: -3.0 };
      const pB: Vector3D = { x: 4.0, y: -1.0, z: 5.5 };
      const pC: Vector3D = { x: -2.0, y: 6.0, z: 1.0 };

      // Identity: d(A, A) == 0
      expect(vec3Distance(pA, pA)).toBe(0);

      // Symmetry: d(A, B) == d(B, A)
      const dAB = vec3Distance(pA, pB);
      const dBA = vec3Distance(pB, pA);
      expect(dAB).toBeCloseTo(dBA, 6);

      // Triangle inequality: d(A, C) <= d(A, B) + d(B, C)
      const dAC = vec3Distance(pA, pC);
      const dBC = vec3Distance(pB, pC);
      expect(dAC).toBeLessThanOrEqual(dAB + dBC + 1e-9);
    });

    it('satisfies AABB intersection symmetry and containment properties', () => {
      const boxA = aabbFromCenterSize({ x: 0, y: 0, z: 0 }, { width: 2, height: 2, depth: 2 });
      const boxB = aabbFromCenterSize({ x: 1, y: 1, z: 1 }, { width: 2, height: 2, depth: 2 });
      const boxC = aabbFromCenterSize({ x: 10, y: 10, z: 10 }, { width: 1, height: 1, depth: 1 });

      // Symmetry: A intersects B <=> B intersects A
      expect(aabbIntersects(boxA, boxB)).toBe(aabbIntersects(boxB, boxA));
      expect(aabbIntersects(boxA, boxB)).toBe(true);

      // Disjoint boxes
      expect(aabbIntersects(boxA, boxC)).toBe(false);
      expect(aabbIntersects(boxB, boxC)).toBe(false);

      // Point containment
      expect(aabbContainsPoint(boxA, { x: 0, y: 0, z: 0 })).toBe(true);
      expect(aabbContainsPoint(boxA, { x: 0.9, y: 0.9, z: 0.9 })).toBe(true);
      expect(aabbContainsPoint(boxA, { x: 5, y: 0, z: 0 })).toBe(false);
    });

    it('verifies Ray-AABB intersection invariants', () => {
      const targetBox = aabbFromCenterSize(
        { x: 0, y: 0, z: 10 },
        { width: 2, height: 2, depth: 2 }
      );

      // Ray pointing directly at box center
      const directOrigin: Vector3D = { x: 0, y: 0, z: 0 };
      const directDir: Vector3D = { x: 0, y: 0, z: 1 };
      const directHit = rayAabbIntersect(directOrigin, directDir, targetBox);
      expect(directHit.hit).toBe(true);
      expect(directHit.t).toBeCloseTo(9.0, 2); // box.min.z is 10 - 1 = 9

      // Ray pointing in opposite direction
      const oppositeDir: Vector3D = { x: 0, y: 0, z: -1 };
      const oppositeHit = rayAabbIntersect(directOrigin, oppositeDir, targetBox);
      expect(oppositeHit.hit).toBe(false);
    });
  });
});
