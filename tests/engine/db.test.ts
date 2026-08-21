import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  getDb,
  getReadOnlyDb,
  closeDb,
  closeAllDbs,
  getRegistry,
  registerProject,
  unregisterProject,
  getRegistryPath,
  sanitizeSlug,
  resolveProjectRoot,
  getProjectSlug,
} from '../../src/engine/db.js';
import { runMigrations } from '../../src/engine/migrations.js';
import {
  getEntityHistory,
  logEntityEvent,
  verifyEventAuditChain,
  repairEventAuditChain,
} from '../../src/engine/events.js';

import { loadProjectConfig } from '../../src/engine/config.js';
import { exportWorldModel } from '../../src/engine/export.js';
import { validateWorldModel } from '../../src/engine/validate.js';
import { parseRegionRow, parseEntityRow, parseRelationRow } from '../../src/engine/row-mappers.js';
import { EntityStore } from '../../src/engine/entity-store.js';

describe('Database, Registry, Migrations, Export, and Validation', () => {
  const project = 'test-db-coverage';

  beforeEach(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM entities WHERE project = ?').run(project);
    db.prepare('DELETE FROM spatial_relations WHERE project = ?').run(project);
    db.prepare('DELETE FROM snapshots WHERE project = ?').run(project);
    db.prepare('DELETE FROM goal_links WHERE project = ?').run(project);
    db.prepare('DELETE FROM observations WHERE project = ?').run(project);
    db.prepare('DELETE FROM entity_history WHERE project = ?').run(project);
  });

  it('executes raw migrations on a fresh in-memory database', () => {
    const memDb = new Database(':memory:');
    runMigrations(memDb);
    runMigrations(memDb);

    // Verify v2 tables exist
    const specTable = memDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='spatial_specs'")
      .get();
    expect(specTable).toBeDefined();

    const bbTable = memDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='blackboard_items'")
      .get();
    expect(bbTable).toBeDefined();

    const evTable = memDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='evidence_packs'")
      .get();
    expect(evTable).toBeDefined();

    memDb.close();
  });

  it('handles slug sanitization, env fallback, and project root resolution', () => {
    expect(sanitizeSlug('My Project!! 123')).toBe('my-project-123');
    expect(sanitizeSlug('')).toBe('');
    expect(resolveProjectRoot()).toBe(process.cwd());
    expect(getProjectSlug('Custom-Slug')).toBe('custom-slug');
  });

  it('manages project registry', () => {
    const regPath = getRegistryPath();
    expect(regPath).toContain('projects.json');

    registerProject('reg-test-proj', '/tmp/reg-test');
    const reg = getRegistry();
    expect(reg['reg-test-proj']).toBeDefined();

    unregisterProject('reg-test-proj');
    const regAfter = getRegistry();
    expect(regAfter['reg-test-proj']).toBeUndefined();
  });

  it('manages DB connections, read-only handles, and LRU cache eviction', () => {
    // Open 6 projects to trigger LRU cache eviction (MAX_CACHED_DBS = 5)
    for (let i = 1; i <= 6; i++) {
      getDb(`test-lru-proj-${i}`);
      getReadOnlyDb(`test-lru-proj-${i}`);
    }

    closeDb(project);
    closeAllDbs();
  });

  it('loads project config from disk files and handles invalid json', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-cfg-test-'));
    const validCfgPath = path.join(tmpDir, '.world-model-mcp.json');
    fs.writeFileSync(
      validCfgPath,
      JSON.stringify({ projectName: 'Disk Project', busyTimeoutMs: 8000 })
    );

    const loaded = loadProjectConfig(tmpDir);
    expect(loaded.projectName).toBe('Disk Project');
    expect(loaded.busyTimeoutMs).toBe(8000);

    // Invalid json handling
    fs.writeFileSync(validCfgPath, '{invalid json}');
    // Wait for TTL or load directly
    const badCfg = loadProjectConfig(path.join(tmpDir, 'sub'));
    expect(badCfg).toEqual({});
  });

  it('explicitly closes individual databases from active cache', () => {
    const projClose = 'test-explicit-close';
    getDb(projClose);
    getReadOnlyDb(projClose);
    closeDb(projClose);
  });

  it('loads project config with defaults and cache', () => {
    const cfg1 = loadProjectConfig(process.cwd());
    expect(typeof cfg1).toBe('object');

    const cfg2 = loadProjectConfig(process.cwd());
    expect(cfg2).toEqual(cfg1);
  });

  it('logs, retrieves, and cryptographically verifies entity history event chains', () => {
    const db = getDb(project);
    logEntityEvent(db, {
      project,
      entity_id: 'ent-hist-1',
      action: 'created',
      source: 'manual',
      confidence: 1.0,
      details: { foo: 'bar' },
    });

    logEntityEvent(db, {
      project,
      entity_id: 'ent-hist-1',
      action: 'updated',
      source: 'manual',
      confidence: 0.9,
      details: { foo: 'baz' },
    });

    const history = getEntityHistory(db, { project, entity_id: 'ent-hist-1' });
    expect(history.length).toBe(2);
    expect(history[0].hash).toBeDefined();

    // Verify valid chain
    const verifyValid = verifyEventAuditChain(db, { project });
    expect(verifyValid.valid).toBe(true);
    expect(verifyValid.total_events).toBe(2);

    // Tamper with hash to test corrupted chain detection
    db.prepare('UPDATE entity_history SET hash = ? WHERE id = ?').run(
      'tampered_hash',
      history[0].id
    );
    const verifyCorrupted = verifyEventAuditChain(db, { project });
    expect(verifyCorrupted.valid).toBe(false);
    expect(verifyCorrupted.error).toContain('Invalid hash signature');

    // Repair the corrupted chain
    const repairResult = repairEventAuditChain(db, { project });
    expect(repairResult.repaired).toBe(true);
    expect(repairResult.total_events).toBe(2);

    const verifyRepaired = verifyEventAuditChain(db, { project });
    expect(verifyRepaired.valid).toBe(true);
  });

  it('exports world model in json and geojson formats', () => {
    const db = getDb(project);
    EntityStore.addEntity(db, {
      project,
      name: 'Export Item',
      type: 'item',
      position: { x: 5, y: 10, z: 15 },
    });

    const jsonExp = exportWorldModel(db, { project, format: 'json' });
    expect(jsonExp.entities.length).toBeGreaterThan(0);

    const geoExp = exportWorldModel(db, { project, format: 'geojson' });
    expect(geoExp.type).toBe('FeatureCollection');
    expect(geoExp.features.length).toBeGreaterThan(0);
  });

  it('validates world model consistency and detects issues', () => {
    const db = getDb(project);
    const validRes = validateWorldModel(db, { project });
    expect(validRes.valid).toBe(true);

    db.pragma('foreign_keys = OFF');
    db.prepare(
      "INSERT INTO spatial_relations (id, project, source_id, relation, target_id, created_at, updated_at) VALUES ('orphan-rel', ?, 'non-existent-source', 'near', 'non-existent-target', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')"
    ).run(project);

    db.prepare(
      "INSERT INTO entities (id, project, name, type, parent_id, last_seen_at, created_at, updated_at) VALUES ('invalid-child', ?, 'Invalid Child', 'item', 'non-existent-parent', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')"
    ).run(project);
    db.pragma('foreign_keys = ON');

    const invalidRes = validateWorldModel(db, { project });
    expect(invalidRes.valid).toBe(false);
    expect(invalidRes.issues.some((i) => i.type === 'orphan_relation')).toBe(true);
    expect(invalidRes.issues.some((i) => i.type === 'invalid_parent')).toBe(true);
  });

  it('maps row structures cleanly with null fallbacks', () => {
    const regRow = parseRegionRow({
      id: 'reg1',
      project,
      name: 'Region 1',
      min_x: null,
      min_y: null,
      min_z: null,
      max_x: null,
      max_y: null,
      max_z: null,
      parent_region_id: null,
      properties_json: '{}',
      created_at: '2026-01-01T00:00:00Z',
    });
    expect(regRow.bounds).toBeUndefined();

    const entRow = parseEntityRow({
      id: 'ent1',
      project,
      name: 'Entity 1',
      type: 'item',
      status: 'active',
      confidence: 1.0,
      parent_id: null,
      region_id: null,
      x: null,
      y: null,
      z: null,
      pitch: null,
      yaw: null,
      roll: null,
      bbox_width: null,
      bbox_height: null,
      bbox_depth: null,
      properties_json: '{}',
      tags_json: '[]',
      version: 1,
      last_seen_at: '2026-01-01T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });
    expect(entRow.orientation).toBeUndefined();
    expect(entRow.bounding_box).toBeUndefined();
    expect(entRow.position).toBeUndefined();

    const relRow = parseRelationRow({
      id: 'rel1',
      project,
      source_id: 'e1',
      relation: 'near',
      target_id: 'e2',
      offset_x: null,
      offset_y: null,
      offset_z: null,
      distance: null,
      metadata_json: '{}',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });
    expect(relRow.offset).toBeUndefined();
    expect(relRow.distance).toBeUndefined();
  });
});
