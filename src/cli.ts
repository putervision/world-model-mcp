#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

declare const __APP_VERSION__: string | undefined;
const pkgVersion = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.3.0";

function showHelp() {
  console.log(`
world-model-mcp CLI Tool v${pkgVersion}

Usage:
  world-model-mcp <command> [options]

Commands:
  run                Start the MCP server on stdio transport (Default)
  init [-y|--yes]    Scaffold the workspace, .gitignore, .env, and IDE agent rules
  init-global        Re-initialize across all projects registered in ~/.world-model-mcp/projects.json
  doctor             Run environment and graph consistency health checks
  doctor-global      Run global health checks across all registered projects
  view               Open interactive 3D WebGL spatial visualizer in browser
  inspect            Display an ASCII table of stored entities and relations
  metrics            Display permanence decay, confidence, and spatial extents
  stats              Alias for metrics command
  map                Output the full spatial map (JSON, GeoJSON, glTF, OBJ)
  summary            Output high-level world summary statistics
  tools              List all consolidated MCP tools and descriptions
  export             Export world model to JSON, glTF, or OBJ file
  import <file>      Import world model from JSON file
  backup             Create a physical SQLite backup file
  restore <file>     Restore database from SQLite backup file
  snapshot <action>  Manage snapshots (save [name], list, restore <name>, diff <nameA> <nameB>)
  spec <action>      Manage spatial SDD specifications (list, verify <name>)
  blackboard <act>   Manage multi-agent spatial blackboard (list, read, post)
  undo [entity_id]   Revert the latest entity modification
  audit              Audit cross-memory references and cryptographic event chain
  update             Check npm registry and update @putervision/world-model-mcp globally

Options:
  -p, --project      Target specific project slug (default: auto-detected from workspace)
  -o, --out          Output file path for export or backup
  -v, --version      Show version number
  -h, --help         Show this help menu
`);
}

async function runCli() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.includes("--help") || rawArgs.includes("-h")) {
    showHelp();
    process.exit(0);
  }

  if (rawArgs.includes("--version") || rawArgs.includes("-v") || rawArgs[0] === "version") {
    console.log(pkgVersion);
    process.exit(0);
  }

  // Parse project flag
  let projectOverride: string | undefined;
  const pIdx = rawArgs.findIndex((a) => a === '-p' || a === '--project');
  if (pIdx !== -1 && rawArgs[pIdx + 1]) {
    projectOverride = rawArgs[pIdx + 1];
  }

  // Filter out options for command determination
  const positional = rawArgs.filter((a, idx) => {
    if (a.startsWith('-')) return false;
    if (idx > 0 && (rawArgs[idx - 1] === '-p' || rawArgs[idx - 1] === '--project' || rawArgs[idx - 1] === '-o' || rawArgs[idx - 1] === '--out')) {
      return false;
    }
    return true;
  });

  const command = positional[0] || "run";

  switch (command) {
    case "run":
      await import("./index.js");
      break;

    case "init": {
      const { runInit } = await import("./cli/init.js");
      await runInit();
      console.log("Initialization complete.");
      break;
    }

    case "init-global": {
      const { runInitGlobal } = await import("./cli/init.js");
      await runInitGlobal();
      break;
    }

    case "doctor": {
      const { runDoctor } = await import("./cli/commands/doctor.js");
      await runDoctor(rawArgs);
      break;
    }

    case "doctor-global": {
      const { runDoctorGlobal } = await import("./cli/commands/doctor.js");
      await runDoctorGlobal(rawArgs);
      break;
    }

    case "view": {
      const { runView } = await import("./cli/commands/view.js");
      await runView(rawArgs);
      break;
    }

    case "inspect": {
      const { runInspect } = await import("./cli/commands/inspect.js");
      await runInspect(rawArgs);
      break;
    }

    case "stats":
    case "metrics": {
      const { runMetrics } = await import("./cli/commands/metrics.js");
      await runMetrics(rawArgs);
      break;
    }

    case "map": {
      const { runMap } = await import("./cli/commands/map.js");
      await runMap(rawArgs);
      break;
    }

    case "summary": {
      const { getDb, getProjectSlug, resolveProjectRoot } = await import("./engine/db.js");
      const { getWorldSummary } = await import("./engine/summary.js");
      const root = resolveProjectRoot();
      const project = getProjectSlug(projectOverride, root);
      const db = getDb(project, root);
      console.log(JSON.stringify(getWorldSummary(db, { project }), null, 2));
      break;
    }

    case "export": {
      const { getDb, getProjectSlug, resolveProjectRoot } = await import("./engine/db.js");
      const { exportWorldModel } = await import("./engine/export.js");
      const root = resolveProjectRoot();
      const project = getProjectSlug(projectOverride, root);
      const db = getDb(project, root);
      const format = positional[1] === "geojson" ? "geojson" : positional[1] === "gltf" ? "gltf" : positional[1] === "obj" ? "obj" : "json";
      const exported = exportWorldModel(db, { project, format: format as any });
      
      const outIdx = rawArgs.findIndex((a) => a === '-o' || a === '--out');
      if (outIdx !== -1 && rawArgs[outIdx + 1]) {
        const outFile = rawArgs[outIdx + 1];
        const content = typeof exported === 'string' ? exported : JSON.stringify(exported, null, 2);
        fs.writeFileSync(outFile, content, 'utf-8');
        console.log(`Exported world model to: ${outFile}`);
      } else {
        console.log(typeof exported === 'string' ? exported : JSON.stringify(exported, null, 2));
      }
      break;
    }

    case "import": {
      const filePath = positional[1];
      if (!filePath) {
        console.error("File path is required for import: world-model-mcp import <file.json>");
        process.exit(1);
      }
      if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
      }
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const { getDb, getProjectSlug, resolveProjectRoot } = await import("./engine/db.js");
      const { EntityStore } = await import("./engine/entity-store.js");
      const { SpatialGraph } = await import("./engine/spatial-graph.js");
      const root = resolveProjectRoot();
      const project = getProjectSlug(projectOverride, root);
      const db = getDb(project, root);

      let importedEntities = 0;
      let importedRelations = 0;

      if (data.entities && Array.isArray(data.entities)) {
        for (const e of data.entities) {
          EntityStore.addEntity(db, {
            project,
            name: e.name,
            type: e.type,
            status: e.status || "active",
            position: e.position,
            orientation: e.orientation,
            bounding_box: e.bounding_box,
            confidence: e.confidence ?? 1.0,
            properties: e.properties || {},
            tags: e.tags || [],
          });
          importedEntities++;
        }
      }

      if (data.relations && Array.isArray(data.relations)) {
        for (const r of data.relations) {
          try {
            SpatialGraph.setRelation(db, {
              project,
              source_id: r.source_id,
              relation: r.relation,
              target_id: r.target_id,
              offset: r.offset,
              distance: r.distance,
              metadata: r.metadata || {},
            });
            importedRelations++;
          } catch {
            // ignore duplicate/dangling relations
          }
        }
      }

      console.log(`Imported ${importedEntities} entities and ${importedRelations} relations into "${project}".`);
      break;
    }

    case "backup": {
      const { getDb, getProjectSlug, resolveProjectRoot } = await import("./engine/db.js");
      const root = resolveProjectRoot();
      const project = getProjectSlug(projectOverride, root);
      const db = getDb(project, root);
      const outIdx = rawArgs.findIndex((a) => a === '-o' || a === '--out');
      const backupPath = outIdx !== -1 && rawArgs[outIdx + 1] ? rawArgs[outIdx + 1] : path.join(root, `${project}_backup_${Date.now()}.db`);
      db.backup(backupPath);
      console.log(`Database backed up to: ${backupPath}`);
      break;
    }

    case "restore": {
      const backupPath = positional[1];
      if (!backupPath) {
        console.error("Backup file path required: world-model-mcp restore <file.db>");
        process.exit(1);
      }
      if (!fs.existsSync(backupPath)) {
        console.error(`Backup file not found: ${backupPath}`);
        process.exit(1);
      }
      const { getDb, getProjectSlug, resolveProjectRoot, closeDb } = await import("./engine/db.js");
      const root = resolveProjectRoot();
      const project = getProjectSlug(projectOverride, root);
      const targetPath = path.join(root, ".world-model-mcp", `${project}.db`);
      closeDb(project);
      fs.copyFileSync(backupPath, targetPath);
      console.log(`Database restored from ${backupPath} to ${targetPath}`);
      break;
    }

    case "snapshot": {
      const { getDb, getProjectSlug, resolveProjectRoot } = await import("./engine/db.js");
      const { SnapshotEngine } = await import("./engine/snapshots.js");
      const root = resolveProjectRoot();
      const project = getProjectSlug(projectOverride, root);
      const db = getDb(project, root);
      const subAction = positional[1] || "list";

      if (subAction === "save") {
        const name = positional[2] || `snap_${Date.now()}`;
        const res = SnapshotEngine.saveSnapshot(db, { project, name });
        console.log(`Snapshot saved: ${res.name} (ID: ${res.snapshot_id})`);
      } else if (subAction === "restore") {
        const name = positional[2];
        if (!name) {
          console.error("Snapshot name is required for restore.");
          process.exit(1);
        }
        const res = SnapshotEngine.restoreSnapshot(db, { project, name });
        console.log(`Snapshot restored: ${res.restored_entities} entities, ${res.restored_relations} relations.`);
      } else if (subAction === "diff") {
        const nameA = positional[2];
        const nameB = positional[3];
        if (!nameA || !nameB) {
          console.error("Usage: world-model-mcp snapshot diff <snapshotA> <snapshotB>");
          process.exit(1);
        }
        const diff = SnapshotEngine.diffSnapshots(db, { project, snapshot_a: nameA, snapshot_b: nameB });
        console.log(`\n🔍 Snapshot Diff: "${nameA}" vs "${nameB}"\n`);
        console.log(`  Added Entities:     ${diff.added_entities.length}`);
        console.log(`  Removed Entities:   ${diff.removed_entities.length}`);
        console.log(`  Displaced Entities: ${diff.displaced_entities.length}`);
        diff.displaced_entities.forEach((d: { name: string; id: string; distance: number }) => console.log(`    - ${d.name} (${d.id}): moved ${d.distance.toFixed(2)}m`));

        console.log(`  Added Relations:    ${diff.added_relations.length}`);
        console.log(`  Removed Relations:  ${diff.removed_relations.length}\n`);
      } else {
        const list = SnapshotEngine.listSnapshots(db, { project });
        console.log(JSON.stringify(list, null, 2));
      }
      break;
    }

    case "spec": {
      const { runSpec } = await import("./cli/commands/spec.js");
      await runSpec(rawArgs);
      break;
    }

    case "blackboard": {
      const { runBlackboard } = await import("./cli/commands/blackboard.js");
      await runBlackboard(rawArgs);
      break;
    }

    case "undo": {
      const { runUndo } = await import("./cli/commands/undo.js");
      await runUndo(rawArgs);
      break;
    }

    case "audit": {
      const { runAudit } = await import("./cli/commands/audit.js");
      await runAudit(rawArgs);
      break;
    }

    case "update":
    case "upgrade": {
      const { runUpdate } = await import("./cli/commands/update.js");
      await runUpdate(pkgVersion);
      break;
    }

    case "tools":
    case "list-tools": {
      const { toolDefinitions } = await import("./tools/definitions.js");
      console.log(`\n📦 @putervision/world-model-mcp v${pkgVersion} — ${toolDefinitions.length} Consolidated MCP Tools:\n`);
      toolDefinitions.forEach((tool, i) => {
        console.log(`  ${String(i + 1).padStart(2, " ")}. ${tool.name.padEnd(25, " ")} : ${tool.description}`);
      });
      console.log();
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

runCli().catch((err) => {
  console.error("Fatal CLI Error:", err);
  process.exit(1);
});
