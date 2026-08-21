import Database from 'better-sqlite3';
import { NavigationHint } from '../schema/types.js';
import { EntityStore } from './entity-store.js';
import { SpatialGraph } from './spatial-graph.js';
import { Vector3D, vec3Distance } from '../utils/math.js';
import { ValidationError } from '../utils/errors.js';

export class NavigationEngine {
  static getNavigationHints(
    db: Database.Database,
    params: {
      project: string;
      start_entity_id?: string;
      start_position?: Vector3D;
      target_entity_id?: string;
      target_position?: Vector3D;
    }
  ): { path_found: boolean; total_distance: number; hints: NavigationHint[] } {
    let startPos: Vector3D | undefined = params.start_position;
    let targetPos: Vector3D | undefined = params.target_position;

    if (params.start_entity_id) {
      const s = EntityStore.getEntity(db, { project: params.project, id: params.start_entity_id });
      if (!s) throw new ValidationError(`Start entity "${params.start_entity_id}" not found.`);
      startPos = s.position || startPos;
    }

    if (params.target_entity_id) {
      const t = EntityStore.getEntity(db, { project: params.project, id: params.target_entity_id });
      if (!t) throw new ValidationError(`Target entity "${params.target_entity_id}" not found.`);
      targetPos = t.position || targetPos;
    }

    // 1. If start and target entities are connected in topological graph, use topological BFS
    if (params.start_entity_id && params.target_entity_id) {
      const topologicalPath = NavigationEngine.findTopologicalPath(
        db,
        params.project,
        params.start_entity_id,
        params.target_entity_id
      );

      if (topologicalPath.length > 0) {
        let totalDist = 0;
        const hints: NavigationHint[] = topologicalPath.map((step, idx) => {
          totalDist += step.distance;
          return {
            step: idx + 1,
            from_entity_id: step.from_id,
            to_entity_id: step.to_id,
            relation: step.relation,
            action_description: `Navigate ${step.relation} towards "${step.to_name}"`,
            distance: step.distance,
          };
        });

        return { path_found: true, total_distance: totalDist, hints };
      }
    }

    // 2. Direct vector navigation fallback
    if (startPos && targetPos) {
      const dist = vec3Distance(startPos, targetPos);
      const hints: NavigationHint[] = [
        {
          step: 1,
          from_position: startPos,
          to_position: targetPos,
          action_description: `Proceed directly towards target (${dist.toFixed(2)} units)`,
          distance: dist,
        },
      ];
      return { path_found: true, total_distance: dist, hints };
    }

    return { path_found: false, total_distance: 0, hints: [] };
  }

  private static findTopologicalPath(
    db: Database.Database,
    project: string,
    startId: string,
    targetId: string
  ): Array<{ from_id: string; to_id: string; to_name: string; relation: any; distance: number }> {
    const queue: Array<{
      id: string;
      path: Array<{
        from_id: string;
        to_id: string;
        to_name: string;
        relation: any;
        distance: number;
      }>;
    }> = [{ id: startId, path: [] }];
    const visited = new Set<string>([startId]);

    while (queue.length > 0) {
      const { id, path } = queue.shift()!;
      if (id === targetId) return path;

      const relations = SpatialGraph.getRelations(db, { project, entity_id: id });
      for (const rel of relations) {
        if (!visited.has(rel.target_id)) {
          visited.add(rel.target_id);
          const targetEntity = EntityStore.getEntity(db, { project, id: rel.target_id });
          const step = {
            from_id: id,
            to_id: rel.target_id,
            to_name: targetEntity ? targetEntity.name : rel.target_id,
            relation: rel.relation,
            distance: rel.distance || 1,
          };
          queue.push({ id: rel.target_id, path: [...path, step] });
        }
      }
    }

    return [];
  }
}
