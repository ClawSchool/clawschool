#!/usr/bin/env npx ts-node
/**
 * ClawSchool Agent Builder Script
 *
 * This script is called by OpenClaw when your agent needs to modify ClawSchool.
 * It provides a safe interface for code modifications with git integration.
 *
 * Usage:
 *   npx ts-node scripts/agent-build.ts <action> [args...]
 *
 * Actions:
 *   read <filepath>              - Read a file
 *   write <filepath> <content>   - Write/create a file
 *   status                       - Show git status
 *   commit <message>             - Commit and push changes
 *   build                        - Run build to verify changes
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join, normalize } from 'path';

const PROJECT_ROOT = join(__dirname, '..');

// Security: Allowed directories for modification
const ALLOWED_DIRS = [
  'src/app',
  'src/components',
  'src/lib',
  'src/types',
  'prisma',
  'public',
];

// Security: Forbidden patterns
const FORBIDDEN_PATTERNS = [
  /\.env/,
  /node_modules/,
  /\.git\//,
  /secret/i,
  /password/i,
  /\.key$/,
  /\.pem$/,
];

function isPathSafe(filepath: string): boolean {
  const normalized = normalize(filepath).replace(/\\/g, '/');

  // Check forbidden patterns
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(normalized)) {
      return false;
    }
  }

  // Check if in allowed directory
  return ALLOWED_DIRS.some(dir => normalized.startsWith(dir + '/') || normalized === dir);
}

function logAction(action: string, details: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  console.log(JSON.stringify({ timestamp, action, ...details }));
}

function readFile(filepath: string): void {
  if (!isPathSafe(filepath)) {
    console.error(`Error: Path not allowed: ${filepath}`);
    process.exit(1);
  }

  const fullPath = join(PROJECT_ROOT, filepath);

  if (!existsSync(fullPath)) {
    console.error(`Error: File not found: ${filepath}`);
    process.exit(1);
  }

  const content = readFileSync(fullPath, 'utf-8');
  console.log(content);
  logAction('read', { filepath, size: content.length });
}

function writeFile(filepath: string, content: string): void {
  if (!isPathSafe(filepath)) {
    console.error(`Error: Path not allowed: ${filepath}`);
    process.exit(1);
  }

  const fullPath = join(PROJECT_ROOT, filepath);
  const dir = dirname(fullPath);

  // Create directory if needed
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(fullPath, content, 'utf-8');
  console.log(`Written: ${filepath} (${content.length} bytes)`);
  logAction('write', { filepath, size: content.length });
}

function gitStatus(): void {
  try {
    const status = execSync('git status --short', {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8'
    });
    console.log(status || 'No changes');
    logAction('status', { changes: status.split('\n').filter(Boolean).length });
  } catch (error) {
    console.error('Git status failed:', error);
    process.exit(1);
  }
}

function commitAndPush(message: string): void {
  try {
    // Stage all changes
    execSync('git add -A', { cwd: PROJECT_ROOT });

    // Commit with agent attribution
    const fullMessage = `${message}\n\nCo-Authored-By: ClawSchool Agent <agent@clawschool.ai>`;
    execSync(`git commit -m "${fullMessage.replace(/"/g, '\\"')}"`, {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8'
    });

    // Push to remote
    execSync('git push', { cwd: PROJECT_ROOT });

    console.log('✅ Changes committed and pushed');
    logAction('commit', { message });
  } catch (error) {
    console.error('Commit/push failed:', error);
    process.exit(1);
  }
}

function runBuild(): void {
  try {
    console.log('Running build...');
    execSync('npm run build', {
      cwd: PROJECT_ROOT,
      stdio: 'inherit'
    });
    console.log('✅ Build successful');
    logAction('build', { success: true });
  } catch (error) {
    console.error('❌ Build failed');
    logAction('build', { success: false });
    process.exit(1);
  }
}

// Main CLI
const [,, action, ...args] = process.argv;

switch (action) {
  case 'read':
    if (!args[0]) {
      console.error('Usage: agent-build.ts read <filepath>');
      process.exit(1);
    }
    readFile(args[0]);
    break;

  case 'write':
    if (!args[0] || !args[1]) {
      console.error('Usage: agent-build.ts write <filepath> <content>');
      process.exit(1);
    }
    // Content might be passed as base64 to handle special characters
    const content = args[1].startsWith('base64:')
      ? Buffer.from(args[1].slice(7), 'base64').toString('utf-8')
      : args[1];
    writeFile(args[0], content);
    break;

  case 'status':
    gitStatus();
    break;

  case 'commit':
    if (!args[0]) {
      console.error('Usage: agent-build.ts commit <message>');
      process.exit(1);
    }
    commitAndPush(args.join(' '));
    break;

  case 'build':
    runBuild();
    break;

  default:
    console.log(`
ClawSchool Agent Builder

Usage:
  npx ts-node scripts/agent-build.ts <action> [args...]

Actions:
  read <filepath>              Read a file
  write <filepath> <content>   Write/create a file
  status                       Show git status
  commit <message>             Commit and push changes
  build                        Run build to verify changes
    `);
}
