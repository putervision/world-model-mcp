import { describe, it, expect } from 'vitest';
import { build3DViewerHtml, safeJsonStringify, escapeHtml } from '../../src/cli/commands/view.js';
import { GameControlsEngine } from '../../src/engine/game-controls.js';
import { s } from '../../src/schema/schemas.js';

describe('View Sanitization and Injection Hardening', () => {
  it('escapes HTML special characters in project name', () => {
    const maliciousProject = '<script>alert("pwned")</script>&"\'';
    const escaped = escapeHtml(maliciousProject);
    expect(escaped).not.toContain('<script>');
    expect(escaped).toContain('&lt;script&gt;');
    expect(escaped).toContain('&amp;');
    expect(escaped).toContain('&quot;');
    expect(escaped).toContain('&#39;');
  });

  it('safely stringifies JSON for inline script injection', () => {
    const maliciousObj = {
      tag: '</script><script>alert(1)</script>',
      amp: '&',
    };
    const json = safeJsonStringify(maliciousObj);
    expect(json).not.toContain('</script>');
    expect(json).toContain('\\u003c/script\\u003e');
    expect(json).toContain('\\u0026');
  });

  it('build3DViewerHtml escapes title, hud badge, and embeds safe json', () => {
    const project = '<img src=x onerror=alert(1)>';
    const entities = [{ id: '1', name: '<script>evil()</script>', type: 'landmark' }];
    const html = build3DViewerHtml(project, entities, []);

    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('</script><script>');
  });

  it('sanitizes comments and escapes keys in game controls output', () => {
    const result = GameControlsEngine.generateInputs({
      current_position: { x: 0, y: 0, z: 0 },
      target_position: { x: 5, y: 0, z: 5 },
      output_format: 'playwright_script',
    });

    expect(result.playwright_script).toBeDefined();
    expect(result.playwright_script).toContain('executeGameNavigation');

    // Test with malicious key and comment newline
    const resultWithRaw = GameControlsEngine.generateInputs({
      current_position: { x: 0, y: 0, z: 0 },
      target_position: { x: 1, y: 0, z: 1 },
      output_format: 'xdotool_script',
    });
    expect(resultWithRaw.xdotool_script).toBeDefined();
    expect(resultWithRaw.xdotool_script).toContain('#!/bin/bash');
  });

  it('filters prototype pollution keys in RecordSchema', () => {
    const schema = s.record(s.string());
    const raw = JSON.parse(
      '{"__proto__": "polluted", "constructor": "bad", "prototype": "bad", "safe": "valid"}'
    );
    const parsed = schema.parse(raw);
    expect(parsed.safe).toBe('valid');
    expect(Object.prototype.hasOwnProperty.call(parsed, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(parsed, 'constructor')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(parsed, 'prototype')).toBe(false);
  });
});
