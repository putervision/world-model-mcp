import Database from 'better-sqlite3';
import { toolDefinitions } from '../tools/definitions.js';

export const TOOL_ALIASES: Record<string, string> = {
  add_entity: 'update_entity',
  create_entity: 'update_entity',
  edit_entity: 'update_entity',
  delete_entity: 'update_entity',
  search_entities: 'query_entities',
  find_entities: 'query_entities',
  get_entity: 'query_entities',
  get_location: 'query_entities',
  get_entity_location: 'query_entities',
  add_relation: 'set_relation',
  link_relation: 'set_relation',
  map: 'get_spatial_map',
  export_map: 'get_spatial_map',
  summary: 'get_spatial_map',
  get_world_summary: 'get_spatial_map',
  simulate: 'simulate_movement',
  navigate: 'simulate_movement',
  path: 'simulate_movement',
  get_navigation_hints: 'simulate_movement',
  observe: 'ingest_observation',
  reconcile: 'ingest_observation',
  reconcile_observation: 'ingest_observation',
  frustum: 'get_expected_view',
  view: 'get_expected_view',
  goal: 'link_to_goal',
  context: 'link_to_goal',
  get_relevant_context: 'link_to_goal',
  spec: 'manage_spatial_spec',
  evidence: 'create_evidence_pack',
  blackboard: 'use_spatial_blackboard',
  snapshot: 'manage_snapshot',
  snapshots: 'manage_snapshot',
  undo: 'manage_snapshot',
  undo_mutation: 'manage_snapshot',
  time_travel: 'manage_snapshot',
  history: 'manage_snapshot',
  project: 'generate_game_inputs',
  project_to_screen: 'generate_game_inputs',
  game_inputs: 'generate_game_inputs',
  inputs: 'generate_game_inputs',
  wait: 'wait_for_spatial_state',
};

export class SchemaAdvisor {
  static resolveAlias(toolName: string): string | undefined {
    return TOOL_ALIASES[toolName.toLowerCase()];
  }

  static getAdvice(toolName: string, error: string, params?: Record<string, any>): string {
    const alias = this.resolveAlias(toolName);
    if (alias) {
      return `Tool "${toolName}" is an alias. Did you mean to call "${alias}"?`;
    }

    const availableTool = toolDefinitions.find((t) => t.name === toolName);
    if (!availableTool) {
      const closest = toolDefinitions
        .map((t) => t.name)
        .filter((n) => n.includes(toolName.slice(0, 3)))[0];
      return `Tool "${toolName}" not found.${closest ? ` Did you mean "${closest}"?` : ''}`;
    }

    if (error.includes('is required')) {
      return `Missing parameter in ${toolName}: ${error}. Check tool schema definition.`;
    }

    if (error.includes('must be one of:')) {
      return `Invalid enum argument in ${toolName}: ${error}.`;
    }

    return `Error calling tool ${toolName}: ${error}`;
  }

  static validateCrossMemoryRefs(
    db: Database.Database,
    params: { project: string }
  ): {
    valid: boolean;
    issues: string[];
    stats: { goal_links: number; observations: number; orphan_relations: number };
  } {
    const issues: string[] = [];

    // 1. Check orphan spatial relations
    const orphanRelations = db
      .prepare(
        `
        SELECT r.id, r.source_id, r.target_id
        FROM spatial_relations r
        LEFT JOIN entities s ON r.source_id = s.id
        LEFT JOIN entities t ON r.target_id = t.id
        WHERE r.project = ? AND (s.id IS NULL OR t.id IS NULL)
      `
      )
      .all(params.project) as any[];

    if (orphanRelations.length > 0) {
      issues.push(
        `Found ${orphanRelations.length} orphan spatial relations referencing nonexistent entities.`
      );
    }

    // 2. Check goal links with nonexistent entities
    const orphanGoalLinks = db
      .prepare(
        `
        SELECT g.id, g.task_id, g.entity_id
        FROM goal_links g
        LEFT JOIN entities e ON g.entity_id = e.id
        WHERE g.project = ? AND g.entity_id IS NOT NULL AND e.id IS NULL
      `
      )
      .all(params.project) as any[];

    if (orphanGoalLinks.length > 0) {
      issues.push(`Found ${orphanGoalLinks.length} goal links referencing nonexistent entity IDs.`);
    }

    const totalGoals = (
      db
        .prepare('SELECT COUNT(*) as c FROM goal_links WHERE project = ?')
        .get(params.project) as any
    ).c;
    const totalObs = (
      db
        .prepare('SELECT COUNT(*) as c FROM observations WHERE project = ?')
        .get(params.project) as any
    ).c;

    return {
      valid: issues.length === 0,
      issues,
      stats: {
        goal_links: totalGoals,
        observations: totalObs,
        orphan_relations: orphanRelations.length,
      },
    };
  }
}
