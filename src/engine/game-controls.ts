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
  output_format?: 'playwright_mcp' | 'playwright_script' | 'raw_actions';
}

export class GameControlsEngine {
  /**
   * Translates 3D coordinates and navigation waypoints into timed keyboard/mouse inputs and Playwright MCP commands.
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
      const lastPoint = path[path.length - 1];
      if (vec3Distance(lastPoint, params.target_position) > 0.05) {
        path.push({ ...params.target_position });
      }
    }

    const actions: GameInputAction[] = [];
    let currentYaw = normalizeAngle(params.current_orientation?.yaw || 0);
    let totalEstimatedMs = 0;
    let requiresJump = false;

    for (let i = 0; i < path.length - 1; i++) {
      const startPt = path[i];
      const endPt = path[i + 1];
      const dist = vec3Distance(startPt, endPt);

      if (dist < 0.05) continue;

      const dx = endPt.x - startPt.x;
      const dy = endPt.y - startPt.y;
      const dz = endPt.z - startPt.z;

      // Desired heading angle (+Z is 0 deg, +X is 90 deg)
      const targetAngleRad = Math.atan2(dx, dz);
      const targetAngleDeg = normalizeAngle((targetAngleRad * 180) / Math.PI);

      let deltaYaw = targetAngleDeg - currentYaw;
      if (deltaYaw > 180) deltaYaw -= 360;
      if (deltaYaw < -180) deltaYaw += 360;

      // 1. Turning Action
      if (Math.abs(deltaYaw) > 2.0) {
        if (profile.use_mouse_look) {
          const deltaX = Math.round(deltaYaw * (profile.mouse_sensitivity || 1.0));
          actions.push({
            type: 'mouse_move',
            delta_x: deltaX,
            delta_y: 0,
            description: `Rotate camera yaw by ${deltaYaw > 0 ? '+' : ''}${Math.round(deltaYaw)}°`,
          });
          totalEstimatedMs += 50;
        } else {
          const turnKey =
            deltaYaw > 0
              ? profile.turn_right_key || 'ArrowRight'
              : profile.turn_left_key || 'ArrowLeft';
          const turnDurationMs = Math.max(
            50,
            Math.round((Math.abs(deltaYaw) / (profile.turn_speed || 90)) * 1000)
          );
          actions.push({
            type: 'key_hold',
            key: turnKey,
            duration_ms: turnDurationMs,
            description: `Turn ${deltaYaw > 0 ? 'right' : 'left'} (${Math.round(deltaYaw)}°) by holding ${turnKey} for ${turnDurationMs}ms`,
          });
          totalEstimatedMs += turnDurationMs;
        }
        currentYaw = targetAngleDeg;
      }

      // 2. Jump Action for vertical step changes
      if (dy > 0.4) {
        requiresJump = true;
        actions.push({
          type: 'key_press',
          key: profile.jump_key || 'Space',
          description: `Jump over ${Math.round(dy * 10) / 10}m vertical elevation change`,
        });
        totalEstimatedMs += 100;
      }

      // 3. Movement Action
      if (profile.scheme === 'click_to_move') {
        let screenX = -1;
        let screenY = -1;
        if (params.camera && params.viewport) {
          const proj = worldToScreen(endPt, params.camera, params.viewport);
          screenX = proj.screen_x;
          screenY = proj.screen_y;
        }
        const moveTimeMs = Math.max(100, Math.round((dist / (profile.move_speed || 5)) * 1000));

        actions.push({
          type: 'mouse_click',
          screen_x: screenX >= 0 ? screenX : undefined,
          screen_y: screenY >= 0 ? screenY : undefined,
          description:
            screenX >= 0
              ? `Click waypoint at screen (${screenX}, ${screenY})`
              : `Click ground waypoint at world (${endPt.x.toFixed(1)}, ${endPt.y.toFixed(1)}, ${endPt.z.toFixed(1)})`,
        });

        actions.push({
          type: 'wait',
          duration_ms: moveTimeMs,
          description: `Wait ${moveTimeMs}ms for agent to reach target waypoint`,
        });
        totalEstimatedMs += moveTimeMs;
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

    // Generate Playwright MCP Commands
    const playwrightCommands = this.buildPlaywrightCommands(actions);
    const playwrightScript = this.buildPlaywrightScript(actions);

    return {
      actions,
      playwright_commands: playwrightCommands,
      estimated_duration_ms: totalEstimatedMs,
      requires_jump: requiresJump,
      playwright_script: playwrightScript,
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
}
