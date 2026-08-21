import Database from 'better-sqlite3';
import { Entity } from '../schema/types.js';
import { EntityStore } from './entity-store.js';
import { parseRegionRow } from './row-mappers.js';

export async function waitForSpatialState(
  db: Database.Database,
  params: {
    project: string;
    entity_id: string;
    condition: 'exists' | 'confidence_above' | 'in_region' | 'active';
    threshold?: number;
    region_id?: string;
    timeout_ms?: number;
    poll_interval_ms?: number;
  }
): Promise<{ satisfied: boolean; entity?: Entity; message: string; elapsed_ms: number }> {
  const timeoutMs = params.timeout_ms || 10000;
  const intervalMs = params.poll_interval_ms || 250;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const entity = EntityStore.getEntity(db, { project: params.project, id: params.entity_id });

    if (params.condition === 'exists' && entity) {
      return {
        satisfied: true,
        entity,
        message: `Entity "${params.entity_id}" exists.`,
        elapsed_ms: Date.now() - startTime,
      };
    }

    if (params.condition === 'active' && entity && entity.status === 'active') {
      return {
        satisfied: true,
        entity,
        message: `Entity "${params.entity_id}" is active.`,
        elapsed_ms: Date.now() - startTime,
      };
    }

    if (
      params.condition === 'confidence_above' &&
      entity &&
      entity.confidence >= (params.threshold ?? 0.8)
    ) {
      return {
        satisfied: true,
        entity,
        message: `Entity "${params.entity_id}" confidence (${entity.confidence}) >= threshold (${params.threshold ?? 0.8}).`,
        elapsed_ms: Date.now() - startTime,
      };
    }

    if (params.condition === 'in_region' && entity?.position && params.region_id) {
      const regionRow = db
        .prepare('SELECT * FROM regions WHERE project = ? AND id = ?')
        .get(params.project, params.region_id) as any;
      if (regionRow) {
        const region = parseRegionRow(regionRow);
        if (region.bounds) {
          const { min, max } = region.bounds;
          const p = entity.position;
          const inside =
            p.x >= min.x &&
            p.x <= max.x &&
            p.y >= min.y &&
            p.y <= max.y &&
            p.z >= min.z &&
            p.z <= max.z;

          if (inside) {
            return {
              satisfied: true,
              entity,
              message: `Entity "${params.entity_id}" is inside region "${params.region_id}".`,
              elapsed_ms: Date.now() - startTime,
            };
          }
        }
      }
    }

    // Non-blocking sleep
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return {
    satisfied: false,
    message: `Timed out waiting for condition "${params.condition}" on entity "${params.entity_id}" after ${timeoutMs}ms.`,
    elapsed_ms: Date.now() - startTime,
  };
}
