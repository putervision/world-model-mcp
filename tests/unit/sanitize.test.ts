import { describe, it, expect } from 'vitest';
import { sanitizeKeys } from '../../src/utils/sanitize.js';
import { EntityStore } from '../../src/engine/entity-store.js';
import Database from 'better-sqlite3';

describe('Prototype Pollution Sanitization Suite', () => {
  it('strips __proto__, constructor, and prototype from nested objects', () => {
    const maliciousPayload = {
      name: 'SafeEntity',
      __proto__: { isAdmin: true },
      constructor: { name: 'Exploit' },
      prototype: { evil: true },
      nested: {
        valid_prop: 123,
        __proto__: { polluted: true },
      },
    };

    const sanitized: any = sanitizeKeys(maliciousPayload);

    expect(sanitized.name).toBe('SafeEntity');
    expect(Object.prototype.hasOwnProperty.call(sanitized, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(sanitized, 'constructor')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(sanitized, 'prototype')).toBe(false);
    expect(sanitized.nested.valid_prop).toBe(123);
    expect(Object.prototype.hasOwnProperty.call(sanitized.nested, 'polluted')).toBe(false);
  });

  it('safely handles non-object and array payloads', () => {
    expect(sanitizeKeys(null)).toBeNull();
    expect(sanitizeKeys(undefined)).toBeUndefined();
    expect(sanitizeKeys('primitive_string')).toBe('primitive_string');
    expect(sanitizeKeys([1, 'two', { safe: true }])).toEqual([1, 'two', { safe: true }]);
  });
});
