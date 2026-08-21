import fs from 'fs';
import { getDb, getDbPath, getProjectSlug, resolveProjectRoot } from '../../engine/db.js';
import { SchemaAdvisor } from '../../engine/advisor.js';
import { verifyEventAuditChain, repairEventAuditChain } from '../../engine/events.js';

export async function runAudit(args: string[] = []): Promise<void> {
  const root = resolveProjectRoot();
  const project = getProjectSlug(undefined, root);
  const db = getDb(project, root);

  const shouldRepair = args.includes('--repair') || args.includes('-r');

  console.log(`\n🔍 Auditing World Model Database for project "${project}"...\n`);

  // 1. Cross memory references & relation consistency
  const crossRef = SchemaAdvisor.validateCrossMemoryRefs(db, { project });
  console.log(`  Cross-Memory & Relation Audit: ${crossRef.valid ? '✅ PASSED' : '⚠️ WARNINGS'}`);
  crossRef.issues.forEach((issue) => console.log(`    - ${issue}`));
  console.log(
    `    Stats: ${crossRef.stats.goal_links} goal links, ${crossRef.stats.observations} observations, ${crossRef.stats.orphan_relations} orphan relations.`
  );

  // 2. Cryptographic Event Audit Chain
  let chainAudit = verifyEventAuditChain(db, { project });
  if (!chainAudit.valid && shouldRepair) {
    console.log('\n  🛠️ Attempting cryptographic audit chain re-hash repair...');
    const rep = repairEventAuditChain(db, { project });
    console.log(`    Re-linked and re-hashed ${rep.total_events} events.`);
    chainAudit = verifyEventAuditChain(db, { project });
  }

  console.log(
    `\n  Cryptographic Event Audit Chain: ${chainAudit.valid ? '✅ VALID' : '❌ CORRUPTED'}`
  );
  console.log(`    Verified Events: ${chainAudit.total_events}`);
  if (!chainAudit.valid) {
    console.error(`    Error: ${chainAudit.error}`);
    console.log('    Tip: Run `world-model-mcp audit --repair` to re-hash and re-link the event chain.');
  }

  // 3. Storage Directory Permissions
  const dbPath = getDbPath(project, root);
  if (fs.existsSync(dbPath)) {
    const stats = fs.statSync(dbPath);
    console.log(`\n  Storage Path: ${dbPath} (${(stats.size / 1024).toFixed(1)} KB)`);
  }

  console.log('\nAudit complete.\n');
}
