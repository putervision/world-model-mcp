import { describe, it, expect } from 'vitest';
import { getBridgeScript } from '../../src/browser/threejs-bridge.js';

describe('Three.js Browser Bridge (src/browser/threejs-bridge.ts)', () => {
  it('generates a valid, self-executing bridge script string', () => {
    const script = getBridgeScript();
    expect(script).toBeDefined();
    expect(typeof script).toBe('string');
    expect(script).toContain('window.__WORLD_MODEL_BRIDGE');
    expect(script).toContain('extractScene');
    expect(script).toContain('extractCamera');
    expect(script).toContain('simulateKeyHold');
  });

  it('script defines valid JSON-compatible methods', () => {
    const script = getBridgeScript();
    expect(script).toContain("version: '0.3.0'");
    expect(script).toContain('observer_pose:');
    expect(script).toContain('detections:');
  });
});
