import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runDoctor, runDoctorGlobal } from '../../src/cli/commands/doctor.js';
import { runInspect } from '../../src/cli/commands/inspect.js';
import { runMetrics } from '../../src/cli/commands/metrics.js';
import { runMap } from '../../src/cli/commands/map.js';
import { runAudit } from '../../src/cli/commands/audit.js';
import { runBlackboard } from '../../src/cli/commands/blackboard.js';
import { runSpec } from '../../src/cli/commands/spec.js';
import { runUndo } from '../../src/cli/commands/undo.js';
import { runInit, runInitGlobal } from '../../src/cli/init.js';
import {
  getDb,
  registerProject,
  closeAllDbs,
  getProjectSlug,
  resolveProjectRoot,
} from '../../src/engine/db.js';
import { EntityStore } from '../../src/engine/entity-store.js';
import { SpatialSpecEngine } from '../../src/engine/spatial-spec.js';
import { verifyEventAuditChain } from '../../src/engine/events.js';

describe('CLI Commands Comprehensive Suite', () => {
  const root = resolveProjectRoot();
  const project = getProjectSlug(undefined, root);
  let tempRegistryDir: string;
  let tempStorageDir: string;
  let oldRegistryEnv: string | undefined;
  let oldStorageEnv: string | undefined;

  beforeEach(() => {
    tempRegistryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-cli-reg-'));
    tempStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-cli-storage-'));
    oldRegistryEnv = process.env.WORLD_MODEL_REGISTRY_PATH;
    oldStorageEnv = process.env.WORLD_MODEL_MCP_DIR;

    process.env.WORLD_MODEL_REGISTRY_PATH = path.join(tempRegistryDir, 'projects.json');
    process.env.WORLD_MODEL_MCP_DIR = tempStorageDir;

    const db = getDb(project, root);
    EntityStore.addEntity(db, {
      project,
      name: 'CLI Test Entity',
      type: 'object',
      position: { x: 5, y: 10, z: 15 },
    });
  });

  afterEach(() => {
    closeAllDbs();
    if (oldRegistryEnv !== undefined) {
      process.env.WORLD_MODEL_REGISTRY_PATH = oldRegistryEnv;
    } else {
      delete process.env.WORLD_MODEL_REGISTRY_PATH;
    }
    if (oldStorageEnv !== undefined) {
      process.env.WORLD_MODEL_MCP_DIR = oldStorageEnv;
    } else {
      delete process.env.WORLD_MODEL_MCP_DIR;
    }
    fs.rmSync(tempRegistryDir, { recursive: true, force: true });
    fs.rmSync(tempStorageDir, { recursive: true, force: true });
  });

  it('runs doctor and doctor-global without throwing errors', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Register test projects in registry
    registerProject(project, root);

    // 1. Local doctor
    await expect(runDoctor(['doctor'])).resolves.not.toThrow();

    // 2. Global doctor
    await expect(runDoctorGlobal(['doctor-global'])).resolves.not.toThrow();

    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('handles doctor-global with empty or missing registry gracefully', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Point to empty registry file
    const emptyRegDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-cli-empty-'));
    process.env.WORLD_MODEL_REGISTRY_PATH = path.join(emptyRegDir, 'projects.json');

    await expect(runDoctorGlobal(['doctor-global'])).resolves.not.toThrow();

    fs.rmSync(emptyRegDir, { recursive: true, force: true });
    logSpy.mockRestore();
  });

  it('runs init and init-global properly across registered projects', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    registerProject(project, root);

    await expect(runInit(root, { projectSlug: project })).resolves.not.toThrow();
    await expect(runInitGlobal()).resolves.not.toThrow();

    logSpy.mockRestore();
  });

  it('runs inspect, metrics, and map commands', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(runInspect(['inspect'])).resolves.not.toThrow();
    await expect(runMetrics(['metrics'])).resolves.not.toThrow();
    await expect(runMap(['map'])).resolves.not.toThrow();
    await expect(runMap(['map', '--geojson'])).resolves.not.toThrow();

    logSpy.mockRestore();
  });

  it('runs audit command and supports --repair', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(runAudit(['audit'])).resolves.not.toThrow();
    await expect(runAudit(['audit', '--repair'])).resolves.not.toThrow();

    logSpy.mockRestore();
  });

  it('runs blackboard and spec CLI commands', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Blackboard list & post
    await expect(runBlackboard(['blackboard', 'list'])).resolves.not.toThrow();
    await expect(
      runBlackboard(['blackboard', 'post', 'test-topic', '{"msg":"hello"}'])
    ).resolves.not.toThrow();
    await expect(runBlackboard(['blackboard', 'read', 'test-topic'])).resolves.not.toThrow();

    // Spec list & verify
    const db = getDb(project, root);
    SpatialSpecEngine.setSpatialSpec(db, {
      project,
      name: 'test-spec',
      constraints: [],
    });

    await expect(runSpec(['spec', 'list'])).resolves.not.toThrow();
    await expect(runSpec(['spec', 'verify', 'test-spec'])).resolves.not.toThrow();

    logSpy.mockRestore();
  });

  it('runs undo CLI command and preserves cryptographic audit chain validity', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const db = getDb(project, root);
    await expect(runUndo(['undo'])).resolves.not.toThrow();

    const audit = verifyEventAuditChain(db, { project });
    expect(audit.valid).toBe(true);

    logSpy.mockRestore();
  });
});
