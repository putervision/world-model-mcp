import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/engine/migrations.js';
import { SchemaAdvisor } from '../../src/engine/advisor.js';

describe('SchemaAdvisor Validation Suite', () => {
  let db: Database.Database;
  const project = 'advisor-validation-project';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('resolves tool aliases accurately to 15 consolidated tools', () => {
    expect(SchemaAdvisor.resolveAlias('add_entity')).toBe('update_entity');
    expect(SchemaAdvisor.resolveAlias('create_entity')).toBe('update_entity');
    expect(SchemaAdvisor.resolveAlias('find_entities')).toBe('query_entities');
    expect(SchemaAdvisor.resolveAlias('get_entity')).toBe('query_entities');
    expect(SchemaAdvisor.resolveAlias('get_location')).toBe('query_entities');
    expect(SchemaAdvisor.resolveAlias('get_entity_location')).toBe('query_entities');
    expect(SchemaAdvisor.resolveAlias('simulate')).toBe('simulate_movement');
    expect(SchemaAdvisor.resolveAlias('navigate')).toBe('simulate_movement');
    expect(SchemaAdvisor.resolveAlias('get_navigation_hints')).toBe('simulate_movement');
    expect(SchemaAdvisor.resolveAlias('reconcile')).toBe('ingest_observation');
    expect(SchemaAdvisor.resolveAlias('reconcile_observation')).toBe('ingest_observation');
    expect(SchemaAdvisor.resolveAlias('summary')).toBe('get_spatial_map');
    expect(SchemaAdvisor.resolveAlias('get_world_summary')).toBe('get_spatial_map');
    expect(SchemaAdvisor.resolveAlias('undo')).toBe('manage_snapshot');
    expect(SchemaAdvisor.resolveAlias('undo_mutation')).toBe('manage_snapshot');
    expect(SchemaAdvisor.resolveAlias('context')).toBe('link_to_goal');
    expect(SchemaAdvisor.resolveAlias('get_relevant_context')).toBe('link_to_goal');
    expect(SchemaAdvisor.resolveAlias('project')).toBe('generate_game_inputs');
    expect(SchemaAdvisor.resolveAlias('project_to_screen')).toBe('generate_game_inputs');
    expect(SchemaAdvisor.resolveAlias('unknown_tool')).toBeUndefined();
  });

  it('provides structured advice for unknown tools, aliases, and errors', () => {
    // 1. Alias advice
    const aliasAdvice = SchemaAdvisor.getAdvice('create_entity', 'Some error');
    expect(aliasAdvice).toContain('is an alias. Did you mean to call "update_entity"?');

    // 2. Missing parameter advice
    const missingParamAdvice = SchemaAdvisor.getAdvice('update_entity', 'field "name" is required');
    expect(missingParamAdvice).toContain('Missing parameter in update_entity');

    // 3. Enum error advice
    const enumAdvice = SchemaAdvisor.getAdvice('set_relation', 'must be one of: on, inside, near');
    expect(enumAdvice).toContain('Invalid enum argument in set_relation');

    // 4. Closest tool suggestion for typo
    const typoAdvice = SchemaAdvisor.getAdvice('upd_entity', 'Not found');
    expect(typoAdvice).toContain('update_entity');
  });

  it('validates cross-memory references detecting orphan relations and goal links', () => {
    // Clean state
    const cleanCheck = SchemaAdvisor.validateCrossMemoryRefs(db, { project });
    expect(cleanCheck.valid).toBe(true);
    expect(cleanCheck.issues.length).toBe(0);

    // Disable FK temporarily to simulate legacy/orphan data
    db.pragma('foreign_keys = OFF');

    // Create an orphan relation directly in SQL
    db.prepare(
      `
      INSERT INTO spatial_relations (id, project, source_id, relation, target_id, created_at, updated_at)
      VALUES ('rel_orphan_1', ?, 'ghost_source', 'on', 'ghost_target', datetime('now'), datetime('now'))
    `
    ).run(project);

    // Create an orphan goal link directly in SQL
    db.prepare(
      `
      INSERT INTO goal_links (id, project, task_id, entity_id, relationship, created_at)
      VALUES ('goal_orphan_1', ?, 'task_123', 'ghost_entity', 'target_destination', datetime('now'))
    `
    ).run(project);

    const corruptCheck = SchemaAdvisor.validateCrossMemoryRefs(db, { project });
    expect(corruptCheck.valid).toBe(false);
    expect(corruptCheck.issues.length).toBe(2);
    expect(corruptCheck.issues[0]).toContain('orphan spatial relations');
    expect(corruptCheck.issues[1]).toContain('goal links referencing nonexistent entity IDs');
    expect(corruptCheck.stats.orphan_relations).toBe(1);
    expect(corruptCheck.stats.goal_links).toBe(1);
  });
});
