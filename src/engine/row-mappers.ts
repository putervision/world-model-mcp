import {
  Entity,
  EntityRow,
  SpatialRelation,
  RelationRow,
  Region,
  RegionRow,
} from '../schema/types.js';
import { safeJsonParse } from '../utils/json-validator.js';

export function parseEntityRow(row: EntityRow): Entity {
  return {
    id: row.id,
    project: row.project,
    name: row.name,
    type: row.type as any,
    status: row.status as any,
    position:
      row.x !== null && row.y !== null && row.z !== null
        ? { x: row.x, y: row.y, z: row.z }
        : undefined,
    orientation:
      row.pitch !== null || row.yaw !== null || row.roll !== null
        ? { pitch: row.pitch ?? undefined, yaw: row.yaw ?? undefined, roll: row.roll ?? undefined }
        : undefined,
    bounding_box:
      row.bbox_width !== null && row.bbox_height !== null && row.bbox_depth !== null
        ? { width: row.bbox_width, height: row.bbox_height, depth: row.bbox_depth }
        : undefined,
    confidence: row.confidence ?? 1.0,
    parent_id: row.parent_id ?? undefined,
    region_id: row.region_id ?? undefined,
    properties: safeJsonParse<Record<string, any>>(row.properties_json || '{}', {}),
    tags: safeJsonParse<string[]>(row.tags_json || '[]', []),
    last_seen_at: row.last_seen_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    version: row.version ?? 1,
  };
}

export function parseRelationRow(row: RelationRow): SpatialRelation {
  return {
    id: row.id,
    project: row.project,
    source_id: row.source_id,
    relation: row.relation as any,
    target_id: row.target_id,
    offset:
      row.offset_x !== null && row.offset_y !== null && row.offset_z !== null
        ? { x: row.offset_x, y: row.offset_y, z: row.offset_z }
        : undefined,
    distance: row.distance ?? undefined,
    metadata: safeJsonParse<Record<string, any>>(row.metadata_json || '{}', {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function parseRegionRow(row: RegionRow): Region {
  return {
    id: row.id,
    project: row.project,
    name: row.name,
    parent_region_id: row.parent_region_id ?? undefined,
    bounds:
      row.min_x !== null &&
      row.min_y !== null &&
      row.min_z !== null &&
      row.max_x !== null &&
      row.max_y !== null &&
      row.max_z !== null
        ? {
            min: { x: row.min_x, y: row.min_y, z: row.min_z },
            max: { x: row.max_x, y: row.max_y, z: row.max_z },
          }
        : undefined,
    properties: safeJsonParse<Record<string, any>>(row.properties_json || '{}', {}),
    created_at: row.created_at,
  };
}
