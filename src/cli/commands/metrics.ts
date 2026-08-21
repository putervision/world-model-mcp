import { getDb, getProjectSlug, resolveProjectRoot } from '../../engine/db.js';
import { getWorldSummary } from '../../engine/summary.js';
import { PermanenceEngine } from '../../engine/permanence.js';

export async function runMetrics(args: string[] = []): Promise<void> {
  const root = resolveProjectRoot();
  const project = getProjectSlug(undefined, root);
  const db = getDb(project, root);

  const summary = getWorldSummary(db, { project });
  const decayStats = PermanenceEngine.getDecayStats(db, { project });

  console.log(`\n📊 Spatial World Model Metrics — Project: ${project}\n`);
  console.log(`  Total Entities:             ${summary.total_entities}`);
  console.log(`  Total Spatial Relations:    ${summary.total_relations}`);
  console.log(`  Total Regions:              ${summary.total_regions}`);
  console.log(`  Active Goal Links:          ${summary.active_goal_links}`);
  console.log(`  Recent Observations:        ${summary.recent_observations_count}`);
  console.log(`  Average Confidence:         ${(decayStats.avg_confidence * 100).toFixed(1)}%`);
  console.log(`  Hidden Entities:            ${decayStats.hidden_count}`);
  console.log(`  Lost Entities:              ${decayStats.lost_count}`);

  if (summary.spatial_bounds) {
    const { min, max } = summary.spatial_bounds;
    console.log(`  Spatial Extents:            [${min.x}, ${min.y}, ${min.z}] to [${max.x}, ${max.y}, ${max.z}]`);
  }
  console.log();
}
