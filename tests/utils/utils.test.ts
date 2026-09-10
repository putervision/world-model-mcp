import * as os from 'os';
import { describe, it, expect, vi } from 'vitest';
import * as path from 'path';
import { WorldModelError, DatabaseError, ValidationError } from '../../src/utils/errors.js';
import { generateId } from '../../src/utils/id.js';
import { getCurrentIsoString } from '../../src/utils/time.js';
import { safeJsonParse, isValidJson } from '../../src/utils/json-validator.js';
import { logger } from '../../src/utils/logger.js';
import { VERSION } from '../../src/utils/version.js';
import { getCurrentBranch } from '../../src/utils/git.js';
import { redactText, redactData } from '../../src/utils/redact.js';
import {
  getDefaultAllowedDirs,
  loadPathConfig,
  validatePath,
} from '../../src/utils/path-validator.js';

describe('Utility Modules', () => {
  describe('errors.ts', () => {
    it('instantiates custom error classes properly', () => {
      const err = new WorldModelError('Generic error', 'GENERIC_ERR', { foo: 'bar' });
      expect(err.message).toBe('Generic error');
      expect(err.code).toBe('GENERIC_ERR');
      expect(err.details).toEqual({ foo: 'bar' });
      expect(err.name).toBe('WorldModelError');

      const dbErr = new DatabaseError('DB failure', { table: 'entities' });
      expect(dbErr.code).toBe('DATABASE_ERROR');
      expect(dbErr.name).toBe('DatabaseError');

      const valErr = new ValidationError('Invalid field');
      expect(valErr.code).toBe('VALIDATION_ERROR');
      expect(valErr.name).toBe('ValidationError');
    });
  });

  describe('id.ts & time.ts & version.ts', () => {
    it('generates 26-char Crockford Base32 ULIDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).toHaveLength(26);
      expect(id2).toHaveLength(26);
      expect(id1).not.toBe(id2);
    });

    it('returns valid ISO timestamp', () => {
      const iso = getCurrentIsoString();
      expect(new Date(iso).toISOString()).toBe(iso);
    });

    it('exports version string', () => {
      expect(VERSION).toBe('0.3.1');
    });
  });

  describe('json-validator.ts', () => {
    it('safely parses JSON with fallback', () => {
      expect(safeJsonParse(JSON.stringify({ a: 1 }), {})).toEqual({ a: 1 });
      expect(safeJsonParse('invalid json', { fallback: true })).toEqual({ fallback: true });
      expect(safeJsonParse(null as any, 'default')).toBe('default');
    });

    it('checks JSON validity', () => {
      expect(isValidJson(JSON.stringify({ valid: true }))).toBe(true);
      expect(isValidJson('{invalid}')).toBe(false);
      expect(isValidJson(123 as any)).toBe(false);
    });
  });

  describe('logger.ts', () => {
    it('logs at various levels to stderr', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('git.ts extra', () => {
    it('handles non-git directories gracefully', () => {
      const nonGitBranch = getCurrentBranch(os.tmpdir());
      expect(nonGitBranch).toBe('main');
    });
  });

  describe('git.ts', () => {
    it('returns current branch name', () => {
      const branch = getCurrentBranch(process.cwd());
      expect(typeof branch).toBe('string');
      expect(branch.length).toBeGreaterThan(0);
    });
  });

  describe('redact.ts', () => {
    it('redacts sensitive tokens, keys, and emails', () => {
      expect(redactText('Bearer secret1234567890abcdef')).toContain('[REDACTED]');
      expect(redactText('sk-123456789012345678901234')).toBe('[REDACTED_API_KEY]');
      expect(redactText('Contact me at test@example.com')).toBe('Contact me at [REDACTED_EMAIL]');
    });

    it('redacts sensitive fields in data structures', () => {
      const data = {
        username: 'agent',
        password: 'supersecretpassword',
        nested: { api_key: 'key12345' },
        list: ['plain', 'secret_token: mytoken123'],
      };

      const redacted = redactData(data) as any;
      expect(redacted.username).toBe('agent');
      expect(redacted.password).toBe('[REDACTED]');
      expect(redacted.nested.api_key).toBe('[REDACTED]');
      expect(redactData(null)).toBeNull();
      expect(redactData('sk-123456789012345678901234')).toBe('[REDACTED_API_KEY]');
    });
  });

  describe('path-validator.ts', () => {
    it('validates safe relative and absolute paths', () => {
      const rootDir = process.cwd();
      const config = loadPathConfig(rootDir);
      expect(getDefaultAllowedDirs(rootDir)).toContain(path.resolve(rootDir));

      const safePath = validatePath('sub/file.json', config);
      expect(safePath).toBe(path.join(path.resolve(rootDir), 'sub/file.json'));
    });

    it('throws on path traversal attacks or invalid inputs', () => {
      const config = loadPathConfig(process.cwd());
      expect(() => validatePath('../../../etc/passwd', config)).toThrow(ValidationError);
      expect(() => validatePath('', config)).toThrow(ValidationError);
    });
  });
});
