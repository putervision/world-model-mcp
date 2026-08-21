import { getDb, getProjectSlug, resolveProjectRoot } from '../../engine/db.js';
import { SpatialSpecEngine } from '../../engine/spatial-spec.js';

export async function runSpec(args: string[]): Promise<void> {
  const root = resolveProjectRoot();
  const project = getProjectSlug(undefined, root);
  const db = getDb(project, root);

  const action = args[1] || 'list';

  if (action === 'list') {
    const specs = SpatialSpecEngine.listSpatialSpecs(db, { project });
    if (specs.length === 0) {
      console.log(`No spatial specs found for project "${project}".`);
      return;
    }
    console.log(`\n📋 Spatial Specifications (${specs.length}):\n`);
    specs.forEach((s, idx) => {
      console.log(`  ${idx + 1}. [${s.name}] - ${s.description || 'No description'} (${s.constraints.length} constraints)`);
    });
    console.log();
  } else if (action === 'verify') {
    const name = args[2];
    if (!name) {
      console.error('Usage: world-model-mcp spec verify <spec-name>');
      process.exit(1);
    }
    const res = SpatialSpecEngine.verifySpatialSpec(db, { project, name });
    console.log(`\n🔍 Verification Result for "${name}":`);
    console.log(`  Status: ${res.is_compliant ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`  Violations: ${res.violations.length}`);
    res.violations.forEach((v, idx) => {
      console.log(`    ${idx + 1}. [${v.severity.toUpperCase()}] ${v.message}`);
    });
    console.log();
  } else {
    console.log(`Unknown spec action "${action}". Available actions: list, verify`);
  }
}
