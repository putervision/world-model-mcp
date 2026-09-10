import { describe, it, expect } from 'vitest';
import { GameControlsEngine } from '../../src/engine/game-controls.js';
import { CameraState, ViewportSize } from '../../src/schema/types.js';

describe('Game Controls Engine (src/engine/game-controls.ts)', () => {
  const camera: CameraState = {
    position: { x: 0, y: 15, z: -20 },
    orientation: { pitch: -30, yaw: 0, roll: 0 },
    fov_degrees: 60,
  };

  const viewport: ViewportSize = {
    width: 1920,
    height: 1080,
  };

  it('generates standard WASD movement and turning actions', () => {
    const res = GameControlsEngine.generateInputs({
      current_position: { x: 0, y: 0, z: 0 },
      current_orientation: { yaw: 0 },
      target_position: { x: 10, y: 0, z: 0 }, // straight right (+X, yaw = 90)
      control_profile: { scheme: 'wasd', move_speed: 5.0, turn_speed: 90.0 },
    });

    expect(res.actions.length).toBeGreaterThan(0);
    // Should have turn action (right) + move forward action
    const turnAct = res.actions.find((a) => a.key === 'ArrowRight');
    expect(turnAct).toBeDefined();
    expect(turnAct!.type).toBe('key_hold');
    expect(turnAct!.duration_ms).toBeCloseTo(1000, -2); // 90 deg / 90 deg/s * 1000 = 1000ms

    const moveAct = res.actions.find((a) => a.key === 'KeyW');
    expect(moveAct).toBeDefined();
    expect(moveAct!.type).toBe('key_hold');
    expect(moveAct!.duration_ms).toBeCloseTo(2000, -2); // 10m / 5m/s * 1000 = 2000ms

    expect(res.playwright_commands.length).toBe(res.actions.length);
    expect(res.playwright_commands[0].tool).toBe('browser_evaluate');
    expect(res.playwright_script).toContain('executeGameNavigation');
  });

  it('handles arrow key control scheme', () => {
    const res = GameControlsEngine.generateInputs({
      current_position: { x: 0, y: 0, z: 0 },
      current_orientation: { yaw: 0 },
      target_position: { x: 0, y: 0, z: 10 }, // straight forward (+Z, yaw = 0)
      control_profile: { scheme: 'arrows', move_speed: 5.0 },
    });

    const moveAct = res.actions.find((a) => a.key === 'ArrowUp');
    expect(moveAct).toBeDefined();
  });

  it('handles mouse look turning mode', () => {
    const res = GameControlsEngine.generateInputs({
      current_position: { x: 0, y: 0, z: 0 },
      current_orientation: { yaw: 0 },
      target_position: { x: 5, y: 0, z: 5 }, // 45 deg right
      control_profile: { scheme: 'wasd', use_mouse_look: true, mouse_sensitivity: 2.0 },
    });

    const mouseAct = res.actions.find((a) => a.type === 'mouse_move');
    expect(mouseAct).toBeDefined();
    expect(mouseAct!.delta_x).toBeGreaterThan(0);
  });

  it('detects elevation changes and generates jump actions', () => {
    const res = GameControlsEngine.generateInputs({
      current_position: { x: 0, y: 0, z: 0 },
      current_orientation: { yaw: 0 },
      target_position: { x: 0, y: 1.0, z: 5 }, // vertical elevation step
      control_profile: { scheme: 'wasd', jump_key: 'Space' },
    });

    expect(res.requires_jump).toBe(true);
    const jumpAct = res.actions.find((a) => a.key === 'Space');
    expect(jumpAct).toBeDefined();
  });

  it('generates click-to-move actions with screen projection coordinates', () => {
    const res = GameControlsEngine.generateInputs({
      current_position: { x: 0, y: 0, z: 0 },
      target_position: { x: 5, y: 0, z: 10 },
      control_profile: { scheme: 'click_to_move', move_speed: 5.0 },
      camera,
      viewport,
    });

    const clickAct = res.actions.find((a) => a.type === 'mouse_click');
    expect(clickAct).toBeDefined();
    expect(clickAct!.screen_x).toBeGreaterThan(0);
    expect(clickAct!.screen_y).toBeGreaterThan(0);

    const waitAct = res.actions.find((a) => a.type === 'wait');
    expect(waitAct).toBeDefined();
  });

  it('generates native desktop automation scripts (xdotool and powershell)', () => {
    const res = GameControlsEngine.generateInputs({
      current_position: { x: 0, y: 0, z: 0 },
      current_orientation: { yaw: 0 },
      target_position: { x: 10, y: 0, z: 10 },
      control_profile: { scheme: 'wasd', move_speed: 5.0 },
    });

    expect(res.xdotool_script).toBeDefined();
    expect(res.xdotool_script).toContain('#!/bin/bash');
    expect(res.xdotool_script).toContain('xdotool');

    expect(res.powershell_script).toBeDefined();
    expect(res.powershell_script).toContain('SendKeys');
  });
});
