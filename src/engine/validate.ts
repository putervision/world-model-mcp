import Database from 'better-sqlite3';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  type: string;
  message: string;
  entity_id?: string;
}

export function validateWorldModel(
  db: Database.Database,
  params: { project: string }
): { valid: boolean; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];

  // Check 1: Orphan relations (source or target entity deleted or nonexistent)
  const orphanRelations = db
    .prepare(
      `
      SELECT r.id, r.source_id, r.target_id, r.relation
      FROM spatial_relations r
      LEFT JOIN entities s ON r.source_id = s.id
      LEFT JOIN entities t ON r.target_id = t.id
      WHERE r.project = ? AND (s.id IS NULL OR t.id IS NULL)
    `
    )
    .all(params.project) as any[];

  for (const o of orphanRelations) {
    issues.push({
      severity: 'error',
      type: 'orphan_relation',
      message: `Relation "${o.id}" references missing entity (source: ${o.source_id}, target: ${o.target_id})`,
    });
  }

  // Check 2: Entities referencing nonexistent parent entities
  const invalidParents = db
    .prepare(
      `
      SELECT e.id, e.name, e.parent_id
      FROM entities e
      LEFT JOIN entities p ON e.parent_id = p.id
      WHERE e.project = ? AND e.parent_id IS NOT NULL AND p.id IS NULL
    `
    )
    .all(params.project) as any[];

  for (const ip of invalidParents) {
    issues.push({
      severity: 'warning',
      type: 'invalid_parent',
      message: `Entity "${ip.name}" (${ip.id}) has nonexistent parent_id "${ip.parent_id}"`,
      entity_id: ip.id,
    });
  }

  return {
    valid: issues.filter((i) => i.severity === 'error').length === 0,
    issues,
  };
}
