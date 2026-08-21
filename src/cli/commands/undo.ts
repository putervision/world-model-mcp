import { getDb, getProjectSlug, resolveProjectRoot } from '../../engine/db.js';
import { TimeTravelEngine } from '../../engine/time-travel.js';

export async function runUndo(args: string[] = []): Promise<void> {
  const root = resolveProjectRoot();
  const project = getProjectSlug(undefined, root);
  const db = getDb(project, root);

  const entityId = args[1];
  const res = TimeTravelEngine.undoMutation(db, { project, entity_id: entityId });

  if (res.success) {
    console.log(`\n✅ ${res.message}\n`);
  } else {
    console.error(`\n❌ ${res.message}\n`);
    process.exit(1);
  }
}
