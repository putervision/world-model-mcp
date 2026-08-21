import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { logger } from '../utils/logger.js';
import { DatabaseError, ValidationError } from '../utils/errors.js';
import { loadProjectConfig } from './config.js';
import { validatePath as validatePathCore, loadPathConfig } from '../utils/path-validator.js';
import { runMigrations } from './migrations.js';

export function validatePath(filePath: string, project?: string): string {
  const projectRoot = resolveProjectRoot(project);
  const pathConfig = loadPathConfig(projectRoot);
  return validatePathCore(filePath, pathConfig);
}

const DEFAULT_REGISTRY_PATH = path.join(os.homedir(), '.world-model-mcp', 'projects.json');

export function getRegistryPath(): string {
  return process.env.WORLD_MODEL_REGISTRY_PATH || DEFAULT_REGISTRY_PATH;
}

let registryCache: { registry: Record<string, string>; timestamp: number } | null = null;
const REGISTRY_TTL_MS = 2000;

export function getRegistry(): Record<string, string> {
  const now = Date.now();
  if (registryCache && now - registryCache.timestamp < REGISTRY_TTL_MS) {
    return registryCache.registry;
  }

  const regPath = getRegistryPath();
  try {
    if (fs.existsSync(regPath)) {
      const raw = fs.readFileSync(regPath, 'utf-8');
      const registry = JSON.parse(raw);
      registryCache = { registry, timestamp: now };
      return registry;
    }
  } catch (err: any) {
    logger.warn(`Failed to read registry: ${err.message}`);
  }
  return {};
}

export function registerProject(projectName: string, projectRoot: string): void {
  const regPath = getRegistryPath();
  const dir = path.dirname(regPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const registry = getRegistry();
  const slug = sanitizeSlug(projectName);
  registry[slug] = path.resolve(projectRoot);

  const tmpPath = `${regPath}.tmp.${Math.random().toString(36).substring(2, 8)}`;
  fs.writeFileSync(tmpPath, JSON.stringify(registry, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmpPath, regPath);

  registryCache = { registry, timestamp: Date.now() };
  logger.debug(`Registered project: ${slug} -> ${projectRoot}`);
}

export function unregisterProject(projectName: string): void {
  const regPath = getRegistryPath();
  const registry = getRegistry();
  const slug = sanitizeSlug(projectName);
  if (registry[slug]) {
    delete registry[slug];
    const tmpPath = `${regPath}.tmp.${Math.random().toString(36).substring(2, 8)}`;
    fs.writeFileSync(tmpPath, JSON.stringify(registry, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(tmpPath, regPath);
    registryCache = { registry, timestamp: Date.now() };
  }
}

export function sanitizeSlug(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function resolveProjectRoot(project?: string, cwd = process.cwd()): string {
  if (project) {
    const registry = getRegistry();
    const slug = sanitizeSlug(project);
    if (registry[slug] && fs.existsSync(registry[slug])) {
      return registry[slug];
    }
    if (registry[project] && fs.existsSync(registry[project])) {
      return registry[project];
    }
  }

  // Walk up directory tree to find .git or .world-model-mcp
  let curr = path.resolve(cwd);
  const home = os.homedir();
  while (curr !== path.dirname(curr) && curr !== home) {
    if (
      fs.existsSync(path.join(curr, '.git')) ||
      fs.existsSync(path.join(curr, '.world-model-mcp'))
    ) {
      return curr;
    }
    curr = path.dirname(curr);
  }
  return path.resolve(cwd);
}

export function getProjectSlug(project?: string, cwd = process.cwd()): string {
  if (project && project.trim().length > 0) {
    return sanitizeSlug(project);
  }
  const root = resolveProjectRoot(project, cwd);
  const config = loadProjectConfig(root);
  if (config.projectName) {
    return sanitizeSlug(config.projectName);
  }
  return sanitizeSlug(path.basename(root));
}

export function getBaseDir(projectRoot: string): string {
  const config = loadProjectConfig(projectRoot);
  if (config.storagePath) {
    return path.resolve(projectRoot, config.storagePath);
  }
  if (process.env.WORLD_MODEL_MCP_DIR) {
    return path.resolve(projectRoot, process.env.WORLD_MODEL_MCP_DIR);
  }
  return path.join(projectRoot, '.world-model-mcp');
}

export function getProjectDbDir(project?: string, cwd = process.cwd()): string {
  const root = resolveProjectRoot(project, cwd);
  const slug = getProjectSlug(project, cwd);
  const baseDir = getBaseDir(root);
  return path.join(baseDir, slug);
}

export function getDbPath(project?: string, cwd = process.cwd()): string {
  const dbDir = getProjectDbDir(project, cwd);
  return path.join(dbDir, 'world.db');
}

// Database Connection Cache (LRU)
const dbCache = new Map<string, Database.Database>();
const readOnlyDbCache = new Map<string, Database.Database>();
const MAX_CACHED_DBS = 5;

export function getDb(project?: string, cwd = process.cwd()): Database.Database {
  const dbPath = getDbPath(project, cwd);
  if (dbCache.has(dbPath)) {
    return dbCache.get(dbPath)!;
  }

  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true, mode: 0o700 });
  }

  const root = resolveProjectRoot(project, cwd);
  const config = loadProjectConfig(root);

  try {
    const db = new Database(dbPath, {
      timeout: config.busyTimeoutMs || 5000,
    });

    // SQLite Pragmas
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma(`busy_timeout = ${config.busyTimeoutMs || 5000}`);
    db.pragma('foreign_keys = ON');
    db.pragma('cache_size = -20000'); // 20MB cache
    db.pragma(`mmap_size = ${config.mmapSizeBytes || 134217728}`); // 128MB
    db.pragma('trusted_schema = OFF');

    runMigrations(db);

    if (dbCache.size >= MAX_CACHED_DBS) {
      const firstKey = dbCache.keys().next().value;
      if (firstKey) {
        try {
          dbCache.get(firstKey)?.close();
        } catch {}
        dbCache.delete(firstKey);
      }
    }

    dbCache.set(dbPath, db);
    return db;
  } catch (err: any) {
    throw new DatabaseError(`Failed to open world-model database at ${dbPath}: ${err.message}`);
  }
}

export function getReadOnlyDb(project?: string, cwd = process.cwd()): Database.Database {
  const dbPath = getDbPath(project, cwd);
  if (readOnlyDbCache.has(dbPath)) {
    return readOnlyDbCache.get(dbPath)!;
  }

  if (!fs.existsSync(dbPath)) {
    // Ensure DB exists first
    getDb(project, cwd);
  }

  const root = resolveProjectRoot(project, cwd);
  const config = loadProjectConfig(root);

  try {
    const db = new Database(dbPath, {
      readonly: true,
      timeout: config.busyTimeoutMs || 5000,
    });

    db.pragma('query_only = ON');
    db.pragma(`busy_timeout = ${config.busyTimeoutMs || 5000}`);
    db.pragma('foreign_keys = ON');
    db.pragma('enable_load_extension = 0');
    db.pragma('cache_size = -20000');
    db.pragma(`mmap_size = ${config.mmapSizeBytes || 134217728}`);
    db.pragma('trusted_schema = OFF');

    if (readOnlyDbCache.size >= MAX_CACHED_DBS) {
      const firstKey = readOnlyDbCache.keys().next().value;
      if (firstKey) {
        try {
          readOnlyDbCache.get(firstKey)?.close();
        } catch {}
        readOnlyDbCache.delete(firstKey);
      }
    }

    readOnlyDbCache.set(dbPath, db);
    return db;
  } catch (err: any) {
    throw new DatabaseError(`Failed to open read-only database at ${dbPath}: ${err.message}`);
  }
}

export function closeDb(project?: string, cwd = process.cwd()): void {
  const dbPath = getDbPath(project, cwd);
  if (dbCache.has(dbPath)) {
    try {
      dbCache.get(dbPath)?.close();
    } catch {}
    dbCache.delete(dbPath);
  }
  if (readOnlyDbCache.has(dbPath)) {
    try {
      readOnlyDbCache.get(dbPath)?.close();
    } catch {}
    readOnlyDbCache.delete(dbPath);
  }
}

export function closeAllDbs(): void {
  for (const [key, db] of dbCache.entries()) {
    try {
      db.close();
    } catch {}
  }
  dbCache.clear();

  for (const [key, db] of readOnlyDbCache.entries()) {
    try {
      db.close();
    } catch {}
  }
  readOnlyDbCache.clear();
}
