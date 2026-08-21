import { getDb, getProjectSlug, resolveProjectRoot } from "../../engine/db.js";
import { EntityStore } from "../../engine/entity-store.js";
import { SpatialGraph } from "../../engine/spatial-graph.js";

export async function runInspect(args: string[] = []): Promise<void> {
  const root = resolveProjectRoot();
  const project = getProjectSlug(undefined, root);
  const db = getDb(project, root);

  const entities = EntityStore.listEntities(db, { project, limit: 30 });
  const relations = SpatialGraph.getRelations(db, { project });

  console.log(`\n🌍 World Model Entities for project "${project}" (Showing ${entities.length}):\n`);
  console.log("ID".padEnd(28) + "NAME".padEnd(25) + "TYPE".padEnd(14) + "STATUS".padEnd(10) + "POSITION".padEnd(20) + "CONF");
  console.log("-".repeat(105));

  for (const e of entities) {
    const pos = e.position ? `(${e.position.x},${e.position.y},${e.position.z})` : "None";
    console.log(
      e.id.padEnd(28) +
      e.name.substring(0, 23).padEnd(25) +
      e.type.padEnd(14) +
      e.status.padEnd(10) +
      pos.padEnd(20) +
      e.confidence.toFixed(2)
    );
  }

  console.log(`\n🔗 Spatial Relations (${relations.length}):\n`);
  for (const r of relations.slice(0, 20)) {
    console.log(`  - ${r.source_id} --[${r.relation}]--> ${r.target_id} (dist: ${r.distance?.toFixed(2) ?? "N/A"})`);
  }
  console.log();
}
