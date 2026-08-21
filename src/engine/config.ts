import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger.js';

export interface ProjectConfig {
  projectName?: string;
  defaultBranch?: string;
  storagePath?: string;
  allowedExportDirs?: string[];
  busyTimeoutMs?: number;
  mmapSizeBytes?: number;
  confidenceDecayRate?: number;
  confidenceDecayIntervalMs?: number;
  minConfidenceThreshold?: number;
  accessMode?: 'normal' | 'read_only';
}

const cachedConfigs = new Map<string, { config: ProjectConfig; timestamp: number }>();
const CONFIG_TTL_MS = 2000;

export function loadProjectConfig(projectRoot: string): ProjectConfig {
  const now = Date.now();
  const cached = cachedConfigs.get(projectRoot);
  if (cached && now - cached.timestamp < CONFIG_TTL_MS) {
    return cached.config;
  }

  const configPath = path.join(projectRoot, '.world-model-mcp.json');
  let config: ProjectConfig = {};

  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      config = JSON.parse(raw);
    } catch (err: any) {
      logger.warn(`Failed to parse .world-model-mcp.json: ${err.message}`);
    }
  }

  cachedConfigs.set(projectRoot, { config, timestamp: now });
  return config;
}
