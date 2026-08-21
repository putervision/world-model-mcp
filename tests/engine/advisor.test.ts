import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/engine/migrations.js';
import { SchemaAdvisor } from '../../src/engine/advisor.js';

describe('SchemaAdvisor', () => {
  let db: Database.Database;
  const project = 'test-advisor';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  it('should resolve tool aliases correctly', () => {
    expect(SchemaAdvisor.resolveAlias('add_entity')).toBe('update_entity');
    expect(SchemaAdvisor.resolveAlias('map')).toBe('get_spatial_map');
    expect(SchemaAdvisor.resolveAlias('spec')).toBe('manage_spatial_spec');
    expect(SchemaAdvisor.resolveAlias('evidence')).toBe('create_evidence_pack');
  });

  it('should generate helpful error remediation messages', () => {
    const advice1 = SchemaAdvisor.getAdvice('add_entity', 'unknown');
    expect(advice1).toContain('Did you mean to call "update_entity"?');

    const advice2 = SchemaAdvisor.getAdvice('update_entity', 'name is required');
    expect(advice2).toContain('Missing parameter in update_entity');
  });

  it('should validate cross-memory references and detect orphans', () => {
    // Insert orphan relation
    db.pragma('foreign_keys = OFF');
    db.prepare(
      `
      INSERT INTO spatial_relations (id, project, source_id, relation, target_id, created_at, updated_at)
      VALUES ('rel_01', 'test-advisor', 'nonexistent_a', 'near', 'nonexistent_b', datetime('now'), datetime('now'))
    `
    ).run();
    db.pragma('foreign_keys = ON');

    const check = SchemaAdvisor.validateCrossMemoryRefs(db, { project });

    expect(check.valid).toBe(false);
    expect(check.issues.length).toBe(1);
    expect(check.stats.orphan_relations).toBe(1);
  });
});
