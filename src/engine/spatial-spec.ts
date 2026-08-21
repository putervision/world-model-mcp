import Database from 'better-sqlite3';
import {
  SpatialSpec,
  SpatialConstraint,
  SpatialSpecResult,
  SpatialSpecViolation,
  SpatialSpecRow,
} from '../schema/types.js';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';
import { safeJsonParse } from '../utils/json-validator.js';
import { vec3Distance, aabbFromCenterSize, aabbIntersects, Vector3D } from '../utils/math.js';

import { EntityStore } from './entity-store.js';
import { parseRegionRow } from './row-mappers.js';

export class SpatialSpecEngine {
  static setSpatialSpec(
    db: Database.Database,
    params: {
      project: string;
      name: string;
      description?: string;
      bounds?: { min: Vector3D; max: Vector3D };
      constraints: SpatialConstraint[];
      sdd_requirement_id?: string;
    }
  ): SpatialSpec {
    const now = getCurrentIsoString();
    const existing = db
      .prepare('SELECT id, created_at FROM spatial_specs WHERE project = ? AND name = ?')
      .get(params.project, params.name) as { id: string; created_at: string } | undefined;

    const id = existing?.id || generateId();
    const createdAt = existing?.created_at || now;

    db.prepare(
      `
      INSERT INTO spatial_specs (
        id, project, name, description, bounds_json, constraints_json, sdd_requirement_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project, name) DO UPDATE SET
        description = excluded.description,
        bounds_json = excluded.bounds_json,
        constraints_json = excluded.constraints_json,
        sdd_requirement_id = excluded.sdd_requirement_id,
        updated_at = excluded.updated_at
    `
    ).run(
      id,
      params.project,
      params.name,
      params.description || null,
      params.bounds ? JSON.stringify(params.bounds) : null,
      JSON.stringify(params.constraints),
      params.sdd_requirement_id || null,
      createdAt,
      now
    );

    return {
      id,
      project: params.project,
      name: params.name,
      description: params.description,
      bounds: params.bounds,
      constraints: params.constraints,
      sdd_requirement_id: params.sdd_requirement_id,
      created_at: createdAt,
      updated_at: now,
    };
  }

  static getSpatialSpec(
    db: Database.Database,
    params: { project: string; name: string }
  ): SpatialSpec | null {
    const row = db
      .prepare('SELECT * FROM spatial_specs WHERE project = ? AND name = ?')
      .get(params.project, params.name) as SpatialSpecRow | undefined;

    if (!row) return null;

    return {
      id: row.id,
      project: row.project,
      name: row.name,
      description: row.description || undefined,
      bounds: row.bounds_json ? safeJsonParse(row.bounds_json, undefined) : undefined,
      constraints: safeJsonParse(row.constraints_json || '[]', []),
      sdd_requirement_id: row.sdd_requirement_id || undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  static listSpatialSpecs(db: Database.Database, params: { project: string }): SpatialSpec[] {
    const rows = db
      .prepare('SELECT * FROM spatial_specs WHERE project = ? ORDER BY name ASC')
      .all(params.project) as SpatialSpecRow[];

    return rows.map((row) => ({
      id: row.id,
      project: row.project,
      name: row.name,
      description: row.description || undefined,
      bounds: row.bounds_json ? safeJsonParse(row.bounds_json, undefined) : undefined,
      constraints: safeJsonParse(row.constraints_json || '[]', []),
      sdd_requirement_id: row.sdd_requirement_id || undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  static deleteSpatialSpec(
    db: Database.Database,
    params: { project: string; name: string }
  ): boolean {
    const res = db
      .prepare('DELETE FROM spatial_specs WHERE project = ? AND name = ?')
      .run(params.project, params.name);
    return res.changes > 0;
  }

  static verifySpatialSpec(
    db: Database.Database,
    params: {
      project: string;
      name: string;
      tolerance?: number;
    }
  ): SpatialSpecResult {
    const spec = this.getSpatialSpec(db, { project: params.project, name: params.name });
    if (!spec) {
      throw new Error(`Spatial spec "${params.name}" not found for project "${params.project}".`);
    }

    const tolerance = params.tolerance ?? 0.05;
    const violations: SpatialSpecViolation[] = [];

    for (const constraint of spec.constraints) {
      switch (constraint.type) {
        case 'min_clearance': {
          const minClearance = constraint.value ?? 1.0;
          const effectiveThreshold = minClearance * (1.0 - tolerance);

          if (constraint.entity_id && constraint.target_id) {
            const entA = EntityStore.getEntity(db, {
              project: params.project,
              id: constraint.entity_id,
            });
            const entB = EntityStore.getEntity(db, {
              project: params.project,
              id: constraint.target_id,
            });

            if (!entA || !entB) {
              violations.push({
                constraint_type: 'min_clearance',
                message: `Referenced entity not found: ${!entA ? constraint.entity_id : constraint.target_id}`,
                severity: 'error',
                entity_ids: [constraint.entity_id, constraint.target_id],
              });
            } else if (entA.position && entB.position) {
              const dist = vec3Distance(entA.position, entB.position);
              if (dist < effectiveThreshold) {
                violations.push({
                  constraint_type: 'min_clearance',
                  message: `Clearance violation between ${entA.name} and ${entB.name}: actual distance ${dist.toFixed(2)}m < min required ${minClearance}m`,
                  severity: 'error',
                  entity_ids: [entA.id, entB.id],
                  actual_value: dist,
                  expected_value: minClearance,
                });
              }
            }
          }
          break;
        }

        case 'max_distance': {
          const maxDistance = constraint.value ?? 10.0;
          const effectiveThreshold = maxDistance * (1.0 + tolerance);

          if (constraint.entity_id && constraint.target_id) {
            const entA = EntityStore.getEntity(db, {
              project: params.project,
              id: constraint.entity_id,
            });
            const entB = EntityStore.getEntity(db, {
              project: params.project,
              id: constraint.target_id,
            });

            if (!entA || !entB) {
              violations.push({
                constraint_type: 'max_distance',
                message: `Referenced entity not found: ${!entA ? constraint.entity_id : constraint.target_id}`,
                severity: 'error',
                entity_ids: [constraint.entity_id, constraint.target_id],
              });
            } else if (entA.position && entB.position) {
              const dist = vec3Distance(entA.position, entB.position);
              if (dist > effectiveThreshold) {
                violations.push({
                  constraint_type: 'max_distance',
                  message: `Max distance violation between ${entA.name} and ${entB.name}: actual distance ${dist.toFixed(2)}m > max allowed ${maxDistance}m`,
                  severity: 'error',
                  entity_ids: [entA.id, entB.id],
                  actual_value: dist,
                  expected_value: maxDistance,
                });
              }
            }
          }
          break;
        }

        case 'inside_region': {
          if (constraint.entity_id && constraint.region_id) {
            const ent = EntityStore.getEntity(db, {
              project: params.project,
              id: constraint.entity_id,
            });
            const regionRow = db
              .prepare('SELECT * FROM regions WHERE project = ? AND id = ?')
              .get(params.project, constraint.region_id) as any;
            const region = regionRow ? parseRegionRow(regionRow) : null;

            if (!ent) {
              violations.push({
                constraint_type: 'inside_region',
                message: `Entity ${constraint.entity_id} not found`,
                severity: 'error',
                entity_ids: [constraint.entity_id],
              });
            } else if (!region) {
              violations.push({
                constraint_type: 'inside_region',
                message: `Region ${constraint.region_id} not found`,
                severity: 'error',
                entity_ids: [constraint.entity_id],
              });
            } else if (ent.position && region.bounds) {
              const { min, max } = region.bounds;
              const p = ent.position;
              const isInside =
                p.x >= min.x - tolerance &&
                p.x <= max.x + tolerance &&
                p.y >= min.y - tolerance &&
                p.y <= max.y + tolerance &&
                p.z >= min.z - tolerance &&
                p.z <= max.z + tolerance;

              if (!isInside) {
                violations.push({
                  constraint_type: 'inside_region',
                  message: `Entity ${ent.name} is outside region ${region.name}`,
                  severity: 'error',
                  entity_ids: [ent.id],
                });
              }
            }
          }
          break;
        }

        case 'contains_entity': {
          if (constraint.entity_id && constraint.target_id) {
            const rel = db
              .prepare(
                "SELECT * FROM spatial_relations WHERE project = ? AND source_id = ? AND relation = 'contains' AND target_id = ?"
              )
              .get(params.project, constraint.entity_id, constraint.target_id);

            if (!rel) {
              violations.push({
                constraint_type: 'contains_entity',
                message: `Container ${constraint.entity_id} does not contain required entity ${constraint.target_id}`,
                severity: 'error',
                entity_ids: [constraint.entity_id, constraint.target_id],
              });
            }
          }
          break;
        }

        case 'no_overlap': {
          if (constraint.entity_id && constraint.target_id) {
            const entA = EntityStore.getEntity(db, {
              project: params.project,
              id: constraint.entity_id,
            });
            const entB = EntityStore.getEntity(db, {
              project: params.project,
              id: constraint.target_id,
            });

            if (entA?.position && entB?.position && entA.bounding_box && entB.bounding_box) {
              const boxA = aabbFromCenterSize(entA.position, entA.bounding_box);
              const boxB = aabbFromCenterSize(entB.position, entB.bounding_box);
              const overlap = aabbIntersects(boxA, boxB);
              if (overlap) {
                violations.push({
                  constraint_type: 'no_overlap',
                  message: `Physical overlap detected between solid entities ${entA.name} and ${entB.name}`,
                  severity: 'error',
                  entity_ids: [entA.id, entB.id],
                });
              }
            }
          }
          break;
        }
      }
    }

    const isCompliant = violations.length === 0;

    let stateMemoryToolCalls: SpatialSpecResult['state_memory_tool_calls'] | undefined;
    if (spec.sdd_requirement_id) {
      stateMemoryToolCalls = {
        instruction: isCompliant
          ? `Spatial specification "${spec.name}" passed verification. Call state-memory-mcp to update requirement compliance.`
          : `Spatial specification "${spec.name}" failed verification with ${violations.length} violations.`,
        mcp_tool_call: {
          server: 'state-memory-mcp',
          tool: 'manage_specs',
          arguments: {
            action: 'verify',
            spec_id: spec.sdd_requirement_id,
            status: isCompliant ? 'passed' : 'failed',
            notes: `Spatial SDD verification for spec "${spec.name}": ${violations.length} violations.`,
          },
        },
        link_tool_call: {
          server: 'state-memory-mcp',
          tool: 'manage_edges',
          arguments: {
            action: 'create',
            type: 'verifies_visual_state',
            source_id: spec.id,
            target_id: spec.sdd_requirement_id,
          },
        },
      };
    }

    return {
      spec_name: spec.name,
      is_compliant: isCompliant,
      violations,
      tolerance_threshold: tolerance,
      sdd_requirement_id: spec.sdd_requirement_id,
      state_memory_tool_calls: stateMemoryToolCalls,
    };
  }
}
