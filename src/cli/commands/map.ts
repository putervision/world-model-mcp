import { getDb, getProjectSlug, resolveProjectRoot } from "../../engine/db.js";
import { exportWorldModel } from "../../engine/export.js";

export async function runMap(args: string[] = []): Promise<void> {
  const root = resolveProjectRoot();
  const project = getProjectSlug(undefined, root);
  const db = getDb(project, root);

  const format = args.includes("--geojson") ? "geojson" : "json";
  const data = exportWorldModel(db, { project, format });
  console.log(JSON.stringify(data, null, 2));
}
