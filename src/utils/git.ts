import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export function getCurrentBranch(cwd: string = process.cwd()): string {
  try {
    const headPath = path.join(cwd, '.git', 'HEAD');
    if (fs.existsSync(headPath)) {
      const content = fs.readFileSync(headPath, 'utf-8').trim();
      if (content.startsWith('ref: refs/heads/')) {
        return content.substring(16);
      }
      if (/^[0-9a-f]{40}$/i.test(content)) {
        return 'HEAD';
      }
    }
  } catch {
    // Ignore
  }

  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return branch || 'main';
  } catch {
    return 'main';
  }
}
