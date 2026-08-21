import Database from 'better-sqlite3';
import { WorldSummary } from '../schema/types.js';
import { getCurrentIsoString } from '../utils/time.js';

export function getWorldSummary(db: Database.Database, params: { project: string }): WorldSummary {
  const entityRows = db
    .prepare('SELECT type, status, confidence, x, y, z FROM entities WHERE project = ?')
    .all(params.project) as any[];

  const entitiesByType: Record<string, number> = {};
  const entitiesByStatus: Record<string, number> = {};
  let totalConf = 0;
  let decayedCount = 0;
  let lostCount = 0;

  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  let hasCoords = false;

  for (const row of entityRows) {
    entitiesByType[row.type] = (entitiesByType[row.type] || 0) + 1;
    entitiesByStatus[row.status] = (entitiesByStatus[row.status] || 0) + 1;
    const c = row.confidence ?? 1.0;
    totalConf += c;
    if (c < 0.5) decayedCount++;
    if (row.status === 'lost') lostCount++;

    if (row.x !== null && row.y !== null && row.z !== null) {
      hasCoords = true;
      minX = Math.min(minX, row.x);
      minY = Math.min(minY, row.y);
      minZ = Math.min(minZ, row.z);
      maxX = Math.max(maxX, row.x);
      maxY = Math.max(maxY, row.y);
      maxZ = Math.max(maxZ, row.z);
    }
  }

  const relationRows = db
    .prepare(
      'SELECT relation, count(*) as count FROM spatial_relations WHERE project = ? GROUP BY relation'
    )
    .all(params.project) as any[];

  const relationsByType: Record<string, number> = {};
  let totalRelations = 0;
  for (const r of relationRows) {
    relationsByType[r.relation] = r.count;
    totalRelations += r.count;
  }

  const regionCount = (
    db.prepare('SELECT count(*) as count FROM regions WHERE project = ?').get(params.project) as any
  ).count;

  const goalLinkCount = (
    db
      .prepare('SELECT count(*) as count FROM goal_links WHERE project = ?')
      .get(params.project) as any
  ).count;

  const obsCount = (
    db
      .prepare('SELECT count(*) as count FROM observations WHERE project = ?')
      .get(params.project) as any
  ).count;

  const totalEntities = entityRows.length;
  const avgConf = totalEntities > 0 ? totalConf / totalEntities : 1.0;

  return {
    project: params.project,
    total_entities: totalEntities,
    entities_by_type: entitiesByType,
    entities_by_status: entitiesByStatus,
    total_relations: totalRelations,
    relations_by_type: relationsByType,
    total_regions: regionCount,
    active_goal_links: goalLinkCount,
    spatial_bounds: hasCoords
      ? { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } }
      : undefined,
    permanence_health: {
      average_confidence: parseFloat(avgConf.toFixed(3)),
      decayed_entities_count: decayedCount,
      lost_entities_count: lostCount,
    },
    recent_observations_count: obsCount,
    updated_at: getCurrentIsoString(),
  };
}
