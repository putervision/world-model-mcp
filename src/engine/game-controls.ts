import { Vector3D, Orientation3D, vec3Distance, normalizeAngle } from '../utils/math.js';
import {
  GameControlProfile,
  GameInputAction,
  PlaywrightCommand,
  GameInputSequence,
  CameraState,
  ViewportSize,
} from '../schema/types.js';
import { worldToScreen } from '../utils/projection.js';

export interface GenerateGameInputsParams {
  current_position: Vector3D;
  current_orientation?: Orientation3D;
  target_position?: Vector3D;
  waypoints?: Vector3D[];
  control_profile?: Partial<GameControlProfile>;
  camera?: CameraState;
  viewport?: ViewportSize;
  output_format?:
    'playwright_mcp' | 'playwright_script' | 'raw_actions' | 'xdotool_script' | 'powershell_script';
}

export class GameControlsEngine {
  /**
   * Translates 3D coordinates and navigation waypoints into timed keyboard/mouse inputs,
   * Playwright MCP commands, and native desktop automation scripts (Linux xdotool & Windows PowerShell).
   */
  static generateInputs(params: GenerateGameInputsParams): GameInputSequence {
    const profile: GameControlProfile = {
      scheme: params.control_profile?.scheme || 'wasd',
      move_speed: params.control_profile?.move_speed || 5.0,
      turn_speed: params.control_profile?.turn_speed || 90.0,
      forward_key:
        params.control_profile?.forward_key ||
        (params.control_profile?.scheme === 'arrows' ? 'ArrowUp' : 'KeyW'),
      backward_key:
        params.control_profile?.backward_key ||
        (params.control_profile?.scheme === 'arrows' ? 'ArrowDown' : 'KeyS'),
      strafe_left_key:
        params.control_profile?.strafe_left_key ||
        (params.control_profile?.scheme === 'arrows' ? 'ArrowLeft' : 'KeyA'),
      strafe_right_key:
        params.control_profile?.strafe_right_key ||
        (params.control_profile?.scheme === 'arrows' ? 'ArrowRight' : 'KeyD'),
      jump_key: params.control_profile?.jump_key || 'Space',
      turn_left_key: params.control_profile?.turn_left_key || 'ArrowLeft',
      turn_right_key: params.control_profile?.turn_right_key || 'ArrowRight',
      use_mouse_look: params.control_profile?.use_mouse_look ?? false,
      mouse_sensitivity: params.control_profile?.mouse_sensitivity || 1.0,
    };

    const path: Vector3D[] = [];
    path.push({ ...params.current_position });

    if (params.waypoints && params.waypoints.length > 0) {
      for (const wp of params.waypoints) {
        path.push({ ...wp });
      }
    }

    if (params.target_position) {
      const last = path[path.length - 1];
      if (vec3Distance(last, params.target_position) > 0.05) {
        path.push({ ...params.target_position });
      }
    }

    const actions: GameInputAction[] = [];
    let currentYaw = params.current_orientation?.yaw || 0;
    let totalEstimatedMs = 0;
    let requiresJump = false;

    for (let i = 0; i < path.length - 1; i++) {
      const p1 = path[i];
      const p2 = path[i + 1];

      const dx = p2.x - p1.x;
      const dy = p2.y !== undefined && p1.y !== undefined ? p2.y - p1.y : 0;
      const dz = p2.z !== undefined && p1.z !== undefined ? p2.z - p1.z : 0;
      const dist = vec3Distance(p1, p2);

      if (dist < 0.05) continue;

      // Check elevation difference for jump requirement
      if (dy > 0.5 || (dz > 0.5 && p2.y === undefined)) {
        requiresJump = true;
        actions.push({
          type: 'key_press',
          key: profile.jump_key || 'Space',
          duration_ms: 100,
          description: `Jump over elevation step (${Math.round(dy * 10) / 10}m)`,
        });
        totalEstimatedMs += 100;
      }

      // Calculate target yaw (horizontal angle on XZ plane: +Z = 0 deg, +X = 90 deg)
      const targetYaw = Math.atan2(dx, dz) * (180 / Math.PI);
      let angleDiff = (targetYaw - currentYaw) % 360;
      if (angleDiff > 180) angleDiff -= 360;
      if (angleDiff < -180) angleDiff += 360;

      // Turning / Aiming action
      if (Math.abs(angleDiff) > 5) {
        const turnDurationMs = Math.round(
          (Math.abs(angleDiff) / (profile.turn_speed || 90)) * 1000
        );

        if (profile.use_mouse_look) {
          const deltaX = Math.round(angleDiff * (profile.mouse_sensitivity || 1.0) * 10);
          actions.push({
            type: 'mouse_move',
            delta_x: deltaX,
            delta_y: 0,
            duration_ms: turnDurationMs,
            description: `Look ${angleDiff > 0 ? 'right' : 'left'} by ${Math.round(Math.abs(angleDiff))}° (deltaX: ${deltaX}px)`,
          });
        } else {
          const turnKey = angleDiff > 0 ? profile.turn_right_key : profile.turn_left_key;
          actions.push({
            type: 'key_hold',
            key: turnKey,
            duration_ms: turnDurationMs,
            description: `Turn ${angleDiff > 0 ? 'right' : 'left'} by holding ${turnKey} for ${turnDurationMs}ms`,
          });
        }

        totalEstimatedMs += turnDurationMs;
        currentYaw = targetYaw;
      }

      // Translation / Move action
      if (profile.scheme === 'click_to_move') {
        let screenCoords: { x: number; y: number } | null = null;
        if (params.camera && params.viewport) {
          const projected = worldToScreen(p2, params.camera, params.viewport);
          if (projected && projected.screen_x >= 0 && projected.screen_y >= 0) {
            screenCoords = { x: projected.screen_x, y: projected.screen_y };
          }
        }

        if (screenCoords) {
          actions.push({
            type: 'mouse_click',
            screen_x: screenCoords.x,
            screen_y: screenCoords.y,
            description: `Click at screen coordinates (${screenCoords.x}, ${screenCoords.y}) to move to target`,
          });
        } else {
          actions.push({
            type: 'mouse_click',
            description: `Click in game viewport towards position (${p2.x.toFixed(1)}, ${p2.y?.toFixed(1) ?? 0}, ${p2.z?.toFixed(1) ?? 0})`,
          });
        }
        const clickMoveDurationMs = Math.round((dist / (profile.move_speed || 5)) * 1000);
        actions.push({
          type: 'wait',
          duration_ms: clickMoveDurationMs,
          description: `Wait ${clickMoveDurationMs}ms while moving to destination`,
        });
        totalEstimatedMs += clickMoveDurationMs;
      } else {
        // WASD / Arrows
        const forwardKey = profile.forward_key || 'KeyW';
        const moveDurationMs = Math.max(50, Math.round((dist / (profile.move_speed || 5)) * 1000));

        actions.push({
          type: 'key_hold',
          key: forwardKey,
          duration_ms: moveDurationMs,
          description: `Move forward ${Math.round(dist * 10) / 10}m by holding ${forwardKey} for ${moveDurationMs}ms`,
        });
        totalEstimatedMs += moveDurationMs;
      }
    }

    // Generate Playwright MCP Commands and Native Desktop Scripts
    const playwrightCommands = this.buildPlaywrightCommands(actions);
    const playwrightScript = this.buildPlaywrightScript(actions);
    const xdotoolScript = this.buildXdotoolScript(actions);
    const powershellScript = this.buildPowershellScript(actions);

    return {
      actions,
      playwright_commands: playwrightCommands,
      estimated_duration_ms: totalEstimatedMs,
      requires_jump: requiresJump,
      playwright_script: playwrightScript,
      xdotool_script: xdotoolScript,
      powershell_script: powershellScript,
    };
  }

  /**
   * Converts actions into ready-to-execute Playwright MCP tool calls.
   */
  private static buildPlaywrightCommands(actions: GameInputAction[]): PlaywrightCommand[] {
    const commands: PlaywrightCommand[] = [];

    for (const act of actions) {
      if (act.type === 'key_hold' && act.key) {
        const key = act.key;
        const dur = act.duration_ms || 100;
        commands.push({
          tool: 'browser_evaluate',
          args: {
            function: `async () => {
  if (window.__WORLD_MODEL_BRIDGE && window.__WORLD_MODEL_BRIDGE.simulateKeyHold) {
    await window.__WORLD_MODEL_BRIDGE.simulateKeyHold('${key}', ${dur});
  } else {
    document.dispatchEvent(new KeyboardEvent('keydown', { code: '${key}', key: '${key}', bubbles: true }));
    await new Promise(r => setTimeout(r, ${dur}));
    document.dispatchEvent(new KeyboardEvent('keyup', { code: '${key}', key: '${key}', bubbles: true }));
  }
}`,
          },
          description: act.description,
        });
      } else if (act.type === 'key_press' && act.key) {
        commands.push({
          tool: 'browser_press_key',
          args: { key: act.key },
          description: act.description,
        });
      } else if (act.type === 'mouse_move' && act.delta_x !== undefined) {
        const dx = act.delta_x;
        const dy = act.delta_y || 0;
        commands.push({
          tool: 'browser_evaluate',
          args: {
            function: `() => {
  document.dispatchEvent(new MouseEvent('mousemove', { movementX: ${dx}, movementY: ${dy}, bubbles: true }));
}`,
          },
          description: act.description,
        });
      } else if (act.type === 'mouse_click') {
        if (act.screen_x !== undefined && act.screen_y !== undefined) {
          commands.push({
            tool: 'browser_evaluate',
            args: {
              function: `() => {
  const el = document.elementFromPoint(${act.screen_x}, ${act.screen_y}) || document.querySelector('canvas');
  if (el) {
    const evt = new MouseEvent('click', { clientX: ${act.screen_x}, clientY: ${act.screen_y}, bubbles: true });
    el.dispatchEvent(evt);
  }
}`,
            },
            description: act.description,
          });
        } else {
          commands.push({
            tool: 'browser_click',
            args: { target: 'canvas', button: 'left' },
            description: act.description,
          });
        }
      } else if (act.type === 'wait' && act.duration_ms) {
        commands.push({
          tool: 'browser_wait_for',
          args: { time: act.duration_ms / 1000 },
          description: act.description,
        });
      }
    }

    return commands;
  }

  /**
   * Generates a complete Playwright test/automation script.
   */
  private static buildPlaywrightScript(actions: GameInputAction[]): string {
    const lines: string[] = [];

    for (const act of actions) {
      if (act.type === 'key_hold' && act.key) {
        lines.push(`  // ${act.description}`);
        lines.push(`  await page.keyboard.down('${act.key}');`);
        lines.push(`  await page.waitForTimeout(${act.duration_ms || 100});`);
        lines.push(`  await page.keyboard.up('${act.key}');`);
      } else if (act.type === 'key_press' && act.key) {
        lines.push(`  // ${act.description}`);
        lines.push(`  await page.keyboard.press('${act.key}');`);
      } else if (act.type === 'mouse_move' && act.delta_x !== undefined) {
        lines.push(`  // ${act.description}`);
        lines.push(`  await page.evaluate(({ dx, dy }) => {`);
        lines.push(
          `    document.dispatchEvent(new MouseEvent('mousemove', { movementX: dx, movementY: dy, bubbles: true }));`
        );
        lines.push(`  }, { dx: ${act.delta_x}, dy: ${act.delta_y || 0} });`);
      } else if (act.type === 'mouse_click') {
        lines.push(`  // ${act.description}`);
        if (act.screen_x !== undefined && act.screen_y !== undefined) {
          lines.push(`  await page.mouse.click(${act.screen_x}, ${act.screen_y});`);
        } else {
          lines.push(`  await page.click('canvas');`);
        }
      } else if (act.type === 'wait' && act.duration_ms) {
        lines.push(`  // ${act.description}`);
        lines.push(`  await page.waitForTimeout(${act.duration_ms});`);
      }
    }

    return `import { Page } from '@playwright/test';

export async function executeGameNavigation(page: Page): Promise<void> {
${lines.join('\n')}
}
`;
  }

  /**
   * Generates a Linux native desktop automation bash script using xdotool.
   */
  private static buildXdotoolScript(actions: GameInputAction[]): string {
    const lines: string[] = [
      '#!/bin/bash',
      '# PuterVision Native Desktop Input Sequence (Linux xdotool)',
    ];
    for (const act of actions) {
      if (act.type === 'key_hold' && act.key) {
        const keySym = this.mapToXdotoolKey(act.key);
        const sec = ((act.duration_ms || 100) / 1000).toFixed(3);
        lines.push(`# ${act.description}`);
        lines.push(`xdotool keydown ${keySym}`);
        lines.push(`sleep ${sec}`);
        lines.push(`xdotool keyup ${keySym}`);
      } else if (act.type === 'key_press' && act.key) {
        const keySym = this.mapToXdotoolKey(act.key);
        lines.push(`# ${act.description}`);
        lines.push(`xdotool key ${keySym}`);
      } else if (act.type === 'mouse_move' && act.delta_x !== undefined) {
        lines.push(`# ${act.description}`);
        lines.push(`xdotool mousemove_relative -- ${act.delta_x} ${act.delta_y || 0}`);
      } else if (act.type === 'mouse_click') {
        lines.push(`# ${act.description}`);
        if (act.screen_x !== undefined && act.screen_y !== undefined) {
          lines.push(`xdotool mousemove ${act.screen_x} ${act.screen_y} click 1`);
        } else {
          lines.push(`xdotool click 1`);
        }
      } else if (act.type === 'wait' && act.duration_ms) {
        const sec = (act.duration_ms / 1000).toFixed(3);
        lines.push(`sleep ${sec}`);
      }
    }
    return lines.join('\n') + '\n';
  }

  /**
   * Generates a Windows native desktop automation script using PowerShell SendKeys.
   */
  private static buildPowershellScript(actions: GameInputAction[]): string {
    const lines: string[] = [
      '# PuterVision Native Desktop Input Sequence (Windows PowerShell)',
      'Add-Type -AssemblyName System.Windows.Forms',
    ];
    for (const act of actions) {
      if (act.type === 'key_hold' && act.key) {
        const keyStr = this.mapToSendKeys(act.key);
        lines.push(`# ${act.description}`);
        lines.push(`[System.Windows.Forms.SendKeys]::SendWait("${keyStr}")`);
        lines.push(`Start-Sleep -Milliseconds ${act.duration_ms || 100}`);
      } else if (act.type === 'key_press' && act.key) {
        const keyStr = this.mapToSendKeys(act.key);
        lines.push(`# ${act.description}`);
        lines.push(`[System.Windows.Forms.SendKeys]::SendWait("${keyStr}")`);
      } else if (act.type === 'wait' && act.duration_ms) {
        lines.push(`Start-Sleep -Milliseconds ${act.duration_ms}`);
      }
    }
    return lines.join('\r\n') + '\r\n';
  }

  private static mapToXdotoolKey(key: string): string {
    const map: Record<string, string> = {
      KeyW: 'w',
      KeyA: 'a',
      KeyS: 's',
      KeyD: 'd',
      ArrowUp: 'Up',
      ArrowDown: 'Down',
      ArrowLeft: 'Left',
      ArrowRight: 'Right',
      Space: 'space',
    };
    return map[key] || key.toLowerCase();
  }

  private static mapToSendKeys(key: string): string {
    const map: Record<string, string> = {
      KeyW: 'w',
      KeyA: 'a',
      KeyS: 's',
      KeyD: 'd',
      ArrowUp: '{UP}',
      ArrowDown: '{DOWN}',
      ArrowLeft: '{LEFT}',
      ArrowRight: '{RIGHT}',
      Space: ' ',
    };
    return map[key] || key.toLowerCase();
  }
}
