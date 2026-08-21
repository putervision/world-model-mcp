import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../utils/logger.js';
import {
  getInstructionsTemplate,
  getGlobalRulesTemplate,
  getMcpConfigCursor,
  getMcpConfigVscode,
  getMcpConfigAntigravity,
  getSkillTemplate,
  getAgentsMdTemplate,
} from './templates.js';
import {
  registerProject,
  getRegistry,
  unregisterProject,
  getDb,
  getProjectSlug,
} from '../engine/db.js';
import { EntityStore } from '../engine/entity-store.js';
import { validateWorldModel } from '../engine/validate.js';

export function upsertInstructionBlock(
  content: string,
  newBlock: string,
  startMarker = '<!-- world-model-mcp:start -->',
  endMarker = '<!-- world-model-mcp:end -->'
): { updatedContent: string; status: 'updated' | 'appended' | 'unchanged' } {
  const startIndex = content.indexOf(startMarker);
  const endIndex = content.indexOf(endMarker);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const before = content.substring(0, startIndex);
    const after = content.substring(endIndex + endMarker.length);
    const existingBlock = content.substring(startIndex, endIndex + endMarker.length);
    if (existingBlock.trim() === newBlock.trim()) {
      return { updatedContent: content, status: 'unchanged' };
    }
    return { updatedContent: `${before}${newBlock.trim()}${after}`, status: 'updated' };
  }

  const separator = content.endsWith('\n') ? '\n' : '\n\n';
  return { updatedContent: `${content}${separator}${newBlock.trim()}\n`, status: 'appended' };
}

function mergeMcpConfig(
  root: string,
  relativePath: string,
  label: string,
  template: Record<string, any>,
  serversKey: string
): void {
  const filePath = path.join(root, relativePath);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const existing = JSON.parse(raw);
      if (existing[serversKey]?.['world-model-mcp']) {
        return;
      }
      if (!existing[serversKey]) existing[serversKey] = {};
      existing[serversKey]['world-model-mcp'] = template[serversKey]['world-model-mcp'];
      fs.writeFileSync(filePath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
    } catch {
      fs.writeFileSync(filePath, JSON.stringify(template, null, 2) + '\n', 'utf-8');
    }
  } else {
    fs.writeFileSync(filePath, JSON.stringify(template, null, 2) + '\n', 'utf-8');
  }
}

export async function runInit(
  targetRoot?: string,
  options?: { projectSlug?: string }
): Promise<void> {
  const root = targetRoot ? path.resolve(targetRoot) : process.cwd();
  const projectName = path.basename(root);
  const projectSlug = options?.projectSlug || getProjectSlug(projectName, root);

  // 1. Register project
  registerProject(projectName, root);

  // 2. Create data directory
  const dataDir = path.join(root, '.world-model-mcp', projectSlug);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  }

  // 3. Update .gitignore
  const gitignorePath = path.join(root, '.gitignore');
  const ignoreEntry = '.world-model-mcp';
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    if (!content.includes(ignoreEntry)) {
      fs.appendFileSync(gitignorePath, `\n${ignoreEntry}\n`, 'utf-8');
    }
  }

  // 4. Scaffold IDE instructions
  const instructions = getInstructionsTemplate(projectSlug);
  const targets = [
    '.gemini/instructions.md',
    '.cursor/rules/world-model-mcp.mdc',
    '.github/copilot-instructions.md',
    '.vscode/instructions.md',
    'CLAUDE.md',
    '.windsurfrules',
    '.agents/AGENTS.md',
  ];

  for (const t of targets) {
    const fullPath = path.join(root, t);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const { updatedContent } = upsertInstructionBlock(content, instructions);
      fs.writeFileSync(fullPath, updatedContent, 'utf-8');
    } else {
      fs.writeFileSync(fullPath, instructions.trim() + '\n', 'utf-8');
    }
  }

  // 5. Scaffold Antigravity Skill
  const skillContent = getSkillTemplate(projectSlug);
  const localSkillDir = path.join(root, '.agents/skills/world-model-mcp');
  if (!fs.existsSync(localSkillDir)) fs.mkdirSync(localSkillDir, { recursive: true });
  fs.writeFileSync(path.join(localSkillDir, 'SKILL.md'), skillContent, 'utf-8');

  const homedir = os.homedir();
  const globalSkillDir = path.join(homedir, '.gemini/config/skills/world-model-mcp');
  try {
    if (!fs.existsSync(globalSkillDir)) fs.mkdirSync(globalSkillDir, { recursive: true });
    fs.writeFileSync(path.join(globalSkillDir, 'SKILL.md'), skillContent, 'utf-8');
  } catch {}

  // 6. Merge MCP Configs
  mergeMcpConfig(root, '.cursor/mcp.json', 'Cursor', getMcpConfigCursor(projectSlug), 'mcpServers');
  mergeMcpConfig(root, '.vscode/mcp.json', 'VS Code', getMcpConfigVscode(projectSlug), 'servers');

  // Global Antigravity Config
  const globalMcpConfig = path.join(homedir, '.gemini/config/mcp_config.json');
  try {
    if (fs.existsSync(path.dirname(globalMcpConfig))) {
      mergeMcpConfig(
        homedir,
        '.gemini/config/mcp_config.json',
        'Antigravity',
        getMcpConfigAntigravity(),
        'mcpServers'
      );
    }
  } catch {}

  // 7. Seed initial origin entity if DB is empty
  const db = getDb(projectSlug, root);
  const count = (
    db.prepare('SELECT count(*) as count FROM entities WHERE project = ?').get(projectSlug) as any
  ).count;
  if (count === 0) {
    EntityStore.addEntity(db, {
      project: projectSlug,
      name: 'World Origin',
      type: 'landmark',
      position: { x: 0, y: 0, z: 0 },
      properties: { description: 'Default world spatial origin' },
      tags: ['origin', 'landmark'],
    });
  }

  validateWorldModel(db, { project: projectSlug });
}

export async function runAutoInit(root: string, projectSlug: string): Promise<void> {
  const originalLog = console.log;
  console.log = (...args) => console.error(...args);
  try {
    await runInit(root, { projectSlug });
  } catch (err: any) {
    logger.warn(`Auto-init skipped: ${err.message}`);
  } finally {
    console.log = originalLog;
  }
}

export async function runInitGlobal(): Promise<void> {
  const registry = getRegistry();
  const entries = Object.entries(registry);
  console.log(`Running global init across ${entries.length} registered project(s)...`);

  for (const [slug, projectRoot] of entries) {
    if (fs.existsSync(projectRoot)) {
      console.log(`  - ${slug}: ${projectRoot}`);
      await runInit(projectRoot, { projectSlug: slug });
    }
  }
  console.log('Global init complete.');
}
