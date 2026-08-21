#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { readFileSync, existsSync, unlinkSync } from 'fs';
import { resolve } from 'path';

// ANSI color helpers
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  bgGreen: '\x1b[42m\x1b[30m\x1b[1m',
  bgRed: '\x1b[41m\x1b[37m\x1b[1m',
};

const startTime = Date.now();
const resultsPath = resolve(process.cwd(), '.vitest-results.json');
const coverageSummaryPath = resolve(process.cwd(), 'coverage/coverage-summary.json');

// Clean previous run artifact
if (existsSync(resultsPath)) {
  try { unlinkSync(resultsPath); } catch {}
}

console.log(`\n${c.bold}${c.cyan}======================================================================${c.reset}`);
console.log(`${c.bold}${c.cyan}       @putervision/world-model-mcp Comprehensive Test Pipeline       ${c.reset}`);
console.log(`${c.bold}${c.cyan}======================================================================${c.reset}\n`);

const steps = [];

function runStep(name, cmd, args) {
  const stepIndex = steps.length + 1;
  process.stdout.write(`${c.bold}[${stepIndex}/5] ${name}...${c.reset} `);
  const stepStart = Date.now();
  const res = spawnSync(cmd, args, { stdio: 'pipe', encoding: 'utf-8', shell: true });
  const duration = ((Date.now() - stepStart) / 1000).toFixed(2);

  if (res.status === 0) {
    console.log(`${c.green}✓ PASSED${c.reset} ${c.dim}(${duration}s)${c.reset}`);
    steps.push({ name, passed: true, duration, output: res.stdout, error: null });
    return true;
  } else {
    console.log(`${c.red}✗ FAILED${c.reset} ${c.dim}(${duration}s)${c.reset}`);
    steps.push({
      name,
      passed: false,
      duration,
      output: res.stdout,
      error: res.stderr || res.stdout,
    });
    return false;
  }
}

// 1. Prettier format check
runStep('Prettier Format Check', 'npx', ['prettier', '--check', 'src/**/*.ts', 'tests/**/*.ts']);

// 2. ESLint
runStep('ESLint Code Quality Check', 'npx', ['eslint', 'src/**/*.ts']);

// 3. TypeScript type check
runStep('TypeScript Type Check', 'npx', ['tsc', '--noEmit']);

// 4. Vitest with coverage and json reporter
runStep('Full Test Suites & Code Coverage', 'npx', [
  'vitest',
  'run',
  '--coverage',
  '--reporter=default',
  '--reporter=json',
  `--outputFile=${resultsPath}`,
]);

// 5. Tsup build
runStep('Bundle & Type Definition Build', 'npx', ['tsup']);

const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
const allStepsPassed = steps.every((s) => s.passed);

// Parse Vitest JSON results
let vitestData = null;
if (existsSync(resultsPath)) {
  try {
    vitestData = JSON.parse(readFileSync(resultsPath, 'utf-8'));
  } catch {}
}

// Parse Coverage Summary
let coverageData = null;
if (existsSync(coverageSummaryPath)) {
  try {
    coverageData = JSON.parse(readFileSync(coverageSummaryPath, 'utf-8'));
  } catch {}
}

// Categorize Tests
const categories = {
  '🎮 3D Engine & Game Loops': { passed: 0, failed: 0, total: 0, files: [] },
  '🤖 Multi-Agent Coordination': { passed: 0, failed: 0, total: 0, files: [] },
  '🧠 Spatial State & Engine': { passed: 0, failed: 0, total: 0, files: [] },
  '🛠️ Tools, MCP Server & CLI': { passed: 0, failed: 0, total: 0, files: [] },
  '🔍 Math, Schemas & Utils': { passed: 0, failed: 0, total: 0, files: [] },
};

const failedTestsList = [];

if (vitestData && vitestData.testResults) {
  for (const fileResult of vitestData.testResults) {
    const filePath = fileResult.name;
    let catKey = '🧠 Spatial State & Engine';

    if (/game|projection|frustum|stress|threejs|export-3d/i.test(filePath)) {
      catKey = '🎮 3D Engine & Game Loops';
    } else if (/multi-agent|blackboard/i.test(filePath)) {
      catKey = '🤖 Multi-Agent Coordination';
    } else if (/tools|mcp-server/i.test(filePath)) {
      catKey = '🛠️ Tools, MCP Server & CLI';
    } else if (/math|schemas|utils/i.test(filePath)) {
      catKey = '🔍 Math, Schemas & Utils';
    }

    const cat = categories[catKey];
    cat.files.push(filePath.split('/').pop());

    for (const test of fileResult.assertionResults || []) {
      cat.total++;
      if (test.status === 'passed') {
        cat.passed++;
      } else {
        cat.failed++;
        failedTestsList.push({
          file: filePath.split('/').pop(),
          ancestor: test.ancestorTitles?.join(' > ') || '',
          title: test.title,
          messages: test.failureMessages || [],
        });
      }
    }
  }
}

// Render Progress Bar Helper
function renderBar(pct) {
  const totalSlots = 16;
  const filled = Math.min(totalSlots, Math.max(0, Math.round((pct / 100) * totalSlots)));
  const empty = totalSlots - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const color = pct >= 90 ? c.green : pct >= 75 ? c.yellow : c.red;
  return `${color}[${bar}] ${pct.toFixed(1)}%${c.reset}`;
}

// -------------------------------------------------------------
// Print Metrics Dashboard
// -------------------------------------------------------------
console.log(`\n${c.bold}╔════════════════════════════════════════════════════════════════════════════════════════════╗${c.reset}`);
console.log(`${c.bold}║                             TEST & METRICS EXECUTION DASHBOARD                             ║${c.reset}`);
console.log(`${c.bold}╚════════════════════════════════════════════════════════════════════════════════════════════╝${c.reset}`);

// Overall Outcome
if (allStepsPassed) {
  console.log(`\n  ${c.bgGreen} OVERALL STATUS: ALL 5 STEPS PASSED ${c.reset}  ${c.dim}(Total Duration: ${totalDuration}s)${c.reset}\n`);
} else {
  console.log(`\n  ${c.bgRed} OVERALL STATUS: PIPELINE FAILURES DETECTED ${c.reset}  ${c.dim}(Total Duration: ${totalDuration}s)${c.reset}\n`);
}

// Step Status Table
console.log(`${c.bold}  Step Execution Breakdown:${c.reset}`);
for (const step of steps) {
  const statusIcon = step.passed ? `${c.green}✓ PASS${c.reset}` : `${c.red}✗ FAIL${c.reset}`;
  console.log(`    ${statusIcon}  ${step.name.padEnd(38)} ${c.dim}${step.duration}s${c.reset}`);
}

// Test Metrics Table
if (vitestData) {
  const totalSuites = vitestData.testResults?.length || 0;
  const passedSuites = vitestData.testResults?.filter((r) => r.status === 'passed').length || 0;
  const failedSuites = totalSuites - passedSuites;
  const totalTests = vitestData.numTotalTests || 0;
  const passedTests = vitestData.numPassedTests || 0;
  const failedTests = vitestData.numFailedTests || 0;

  console.log(`\n${c.bold}  Test Suite Metrics:${c.reset}`);
  console.log(`    • Test Suites Run:       ${c.bold}${totalSuites}${c.reset} (${c.green}${passedSuites} passed${c.reset}${failedSuites > 0 ? `, ${c.red}${failedSuites} failed${c.reset}` : ''})`);
  console.log(`    • Individual Tests Run:  ${c.bold}${totalTests}${c.reset} (${c.green}${passedTests} passed${c.reset}${failedTests > 0 ? `, ${c.red}${failedTests} failed${c.reset}` : ''})`);

  console.log(`\n${c.bold}  Test Category Breakdown:${c.reset}`);
  for (const [catName, data] of Object.entries(categories)) {
    if (data.total > 0) {
      const statusColor = data.failed === 0 ? c.green : c.red;
      const countStr = `${data.passed}/${data.total} passed`;
      console.log(`    ${catName.padEnd(32)} ${statusColor}${countStr.padEnd(16)}${c.reset} ${c.dim}(${data.files.length} suites)${c.reset}`);
    }
  }
}

// Coverage Metrics
if (coverageData && coverageData.total) {
  const t = coverageData.total;
  console.log(`\n${c.bold}  Code Coverage Summary:${c.reset}`);
  console.log(`    • Statements:  ${renderBar(t.statements.pct)}  (${t.statements.covered}/${t.statements.total})`);
  console.log(`    • Branches:    ${renderBar(t.branches.pct)}  (${t.branches.covered}/${t.branches.total})`);
  console.log(`    • Functions:   ${renderBar(t.functions.pct)}  (${t.functions.covered}/${t.functions.total})`);
  console.log(`    • Lines:       ${renderBar(t.lines.pct)}  (${t.lines.covered}/${t.lines.total})`);
}

// Failure Diagnostics Section
if (failedTestsList.length > 0 || !allStepsPassed) {
  console.log(`\n${c.bold}${c.red}╔════════════════════════════════════════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.red}║                                  FAILURE DIAGNOSTICS                                       ║${c.reset}`);
  console.log(`${c.bold}${c.red}╚════════════════════════════════════════════════════════════════════════════════════════════╝${c.reset}`);

  if (failedTestsList.length > 0) {
    console.log(`\n${c.bold}${c.red}  Failed Tests (${failedTestsList.length}):${c.reset}`);
    for (const fail of failedTestsList) {
      console.log(`\n  ${c.red}✖ [${fail.file}]${c.reset} ${c.bold}${fail.ancestor ? fail.ancestor + ' > ' : ''}${fail.title}${c.reset}`);
      for (const msg of fail.messages) {
        console.log(`    ${c.dim}${msg.trim().split('\n').slice(0, 5).join('\n    ')}${c.reset}`);
      }
    }
  }

  for (const step of steps) {
    if (!step.passed && step.error) {
      console.log(`\n${c.bold}${c.red}  Step Failure Details [${step.name}]:${c.reset}`);
      console.log(`    ${c.dim}${step.error.trim().split('\n').slice(0, 10).join('\n    ')}${c.reset}`);
    }
  }
}

console.log(`\n${c.bold}${c.cyan}======================================================================${c.reset}\n`);

// Clean up temporary results file
if (existsSync(resultsPath)) {
  try { unlinkSync(resultsPath); } catch {}
}

if (!allStepsPassed) {
  process.exit(1);
} else {
  process.exit(0);
}
