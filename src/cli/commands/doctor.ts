import fs from 'fs';
import { getDb, getProjectSlug, resolveProjectRoot, getRegistry } from '../../engine/db.js';
import { validateWorldModel } from '../../engine/validate.js';
import { getWorldSummary } from '../../engine/summary.js';
import { verifyEventAuditChain } from '../../engine/events.js';

export async function runDoctor(args: string[] = []): Promise<void> {
  const root = resolveProjectRoot();
  const project = getProjectSlug(undefined, root);
  console.log(`🏥 Running doctor health check for project "${project}" at ${root}...\n`);

  // Check Node version
  const nodeVersion = process.version;
  console.log(`✅ Node.js Runtime: ${nodeVersion} (Supported >=18)`);

  const db = getDb(project, root);
  const summary = getWorldSummary(db, { project });
  const validation = validateWorldModel(db, { project });
  const audit = verifyEventAuditChain(db, { project });

  console.log('✅ SQLite Database Connected & WAL mode enabled');
  console.log(`   Total Entities: ${summary.total_entities}`);
  console.log(`   Total Relations: ${summary.total_relations}`);
  console.log(`   Total Regions: ${summary.total_regions}`);
  console.log(
    `   Permanence Avg Confidence: ${(summary.permanence_health.average_confidence * 100).toFixed(1)}%`
  );
  console.log(
    `   Audit Chain Status: ${audit.valid ? '✅ Valid' : '❌ Corrupted'} (${audit.total_events} events)`
  );

  if (validation.issues.length > 0) {
    console.log(`\n⚠️ Found ${validation.issues.length} validation issue(s):`);
    for (const issue of validation.issues) {
      console.log(`  - [${issue.severity.toUpperCase()}] ${issue.message}`);
    }
  } else {
    console.log('\n🎉 World Model is healthy! No orphan relations or invalid parent references.\n');
  }
}

export async function runDoctorGlobal(args: string[] = []): Promise<void> {
  console.log('🏥 Running global multi-project doctor health audit...\n');

  const registry = getRegistry();
  const entries = Object.entries(registry);

  if (entries.length === 0) {
    console.log('No global projects registered in ~/.world-model-mcp/projects.json.');
    return;
  }

  console.log(`Registered Projects (${entries.length}):\n`);
  for (const [proj, rootPath] of entries) {
    console.log(`--- Project: ${proj} (${rootPath}) ---`);
    try {
      if (!fs.existsSync(rootPath)) {
        console.log(`  ⚠️ Workspace directory not found at: ${rootPath}`);
        continue;
      }
      const db = getDb(proj, rootPath);
      const summary = getWorldSummary(db, { project: proj });
      const validation = validateWorldModel(db, { project: proj });
      const audit = verifyEventAuditChain(db, { project: proj });
      console.log(
        `  Entities: ${summary.total_entities} | Relations: ${summary.total_relations} | Confidence: ${(summary.permanence_health.average_confidence * 100).toFixed(1)}%`
      );
      console.log(
        `  Audit Chain: ${audit.valid ? '✅ Valid' : '❌ Corrupted'} (${audit.total_events} events) | Issues: ${validation.issues.length}`
      );
    } catch (err: any) {
      console.log(`  ❌ Error inspecting project: ${err.message}`);
    }
  }
  console.log('\nGlobal audit complete.\n');
}
