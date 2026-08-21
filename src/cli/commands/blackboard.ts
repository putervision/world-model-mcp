import { getDb, getProjectSlug, resolveProjectRoot } from '../../engine/db.js';
import { SpatialBlackboard } from '../../engine/blackboard.js';

export async function runBlackboard(args: string[]): Promise<void> {
  const root = resolveProjectRoot();
  const project = getProjectSlug(undefined, root);
  const db = getDb(project, root);

  const action = args[1] || 'list';

  if (action === 'list' || action === 'read') {
    const topic = args[2];
    const items = SpatialBlackboard.read(db, { project, topic, include_expired: false });
    if (items.length === 0) {
      console.log(`No active blackboard items found for project "${project}".`);
      return;
    }
    console.log(`\n📌 Spatial Blackboard Items (${items.length}):\n`);
    items.forEach((item, idx) => {
      console.log(`  ${idx + 1}. [${item.topic}] From: ${item.sender} (Expires: ${item.expires_at || 'never'})`);
      console.log(`     Payload: ${JSON.stringify(item.payload)}`);
    });
    console.log();
  } else if (action === 'post') {
    const topic = args[2];
    const message = args[3];
    if (!topic || !message) {
      console.error('Usage: world-model-mcp blackboard post <topic> <message-json-or-text>');
      process.exit(1);
    }
    let payload: Record<string, any> = { message };
    try {
      payload = JSON.parse(message);
    } catch {
      // plain text string
    }
    const res = SpatialBlackboard.post(db, {
      project,
      topic,
      sender: 'cli',
      payload,
      ttl_seconds: 300,
    });
    console.log(`Posted to blackboard topic "${topic}" (ID: ${res.item.id})`);
    if (res.collision_warnings) {
      res.collision_warnings.forEach((w) => console.warn(`⚠️ ${w}`));
    }
  } else {
    console.log(`Unknown blackboard action "${action}". Available actions: list, post, read`);
  }
}
