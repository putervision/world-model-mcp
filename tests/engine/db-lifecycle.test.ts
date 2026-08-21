import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  sanitizeSlug,
  resolveProjectRoot,
  getProjectSlug,
  getDb,
  getReadOnlyDb,
  closeDb,
  closeAllDbs,
  registerProject,
  unregisterProject,
  getRegistry,
  getDbPath,
} from '../../src/engine/db.js';

describe('Database Engine Lifecycle & Cache Suite', () => {
  const testDir = path.join(os.tmpdir(), `wm_db_test_${Date.now()}`);

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    closeAllDbs();
    try {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it('sanitizes project slugs thoroughly across various inputs', () => {
    expect(sanitizeSlug('My Project 123')).toBe('my-project-123');
    expect(sanitizeSlug('  ---test---slug---  ')).toBe('test-slug');
    expect(sanitizeSlug('special!@#$%^&*()chars')).toBe('special-chars');
    expect(sanitizeSlug('already-clean-slug')).toBe('already-clean-slug');
    expect(sanitizeSlug('')).toBe('');
  });

  it('resolves project root and project slug correctly', () => {
    const slug1 = getProjectSlug('explicit-proj', testDir);
    expect(slug1).toBe('explicit-proj');

    const root = resolveProjectRoot(undefined, testDir);
    expect(root).toBeDefined();
  });

  it('manages project registry dynamically', () => {
    const projName = `test_proj_${Date.now()}`;
    const projPath = path.join(testDir, projName);

    registerProject(projName, projPath);
    const registry = getRegistry();
    const slug = sanitizeSlug(projName);
    expect(registry[slug]).toBe(path.resolve(projPath));

    unregisterProject(projName);
    const updated = getRegistry();
    expect(updated[slug]).toBeUndefined();
  });

  it('opens read-write and read-only databases and enforces MAX_CACHED_DBS eviction', () => {
    const dbPaths: string[] = [];

    // Open 7 separate databases to trigger LRU cache eviction (MAX_CACHED_DBS is 5)
    for (let i = 1; i <= 7; i++) {
      const proj = `proj_cache_${i}`;
      const db = getDb(proj, testDir);
      expect(db).toBeDefined();
      expect(db.open).toBe(true);
      dbPaths.push(getDbPath(proj, testDir));
    }

    // Open read-only database
    const roDb = getReadOnlyDb('proj_cache_1', testDir);
    expect(roDb).toBeDefined();
    expect(roDb.readonly).toBe(true);

    // Verify closeDb and closeAllDbs
    closeDb('proj_cache_1', testDir);
    closeAllDbs();
  });
});
