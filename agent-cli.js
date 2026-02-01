#!/usr/bin/env node
/**
 * ClawSchool Agent CLI
 * Simple interface for OpenClaw agents to build ClawSchool
 *
 * Usage:
 *   node agent-cli.js <command> [args]
 *
 * Commands:
 *   status          - Show git status
 *   build           - Run build
 *   push <message>  - Commit and push all changes
 *   read <file>     - Read a file
 *   tree            - Show project structure
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = __dirname;

function run(cmd) {
  try {
    return execSync(cmd, { cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: 'pipe' });
  } catch (e) {
    console.error('Error:', e.message);
    return e.stdout || '';
  }
}

const [,, command, ...args] = process.argv;

switch (command) {
  case 'status':
    console.log('=== Git Status ===');
    console.log(run('git status --short'));
    console.log('\n=== Recent Commits ===');
    console.log(run('git log --oneline -5'));
    break;

  case 'build':
    console.log('=== Running Build ===');
    try {
      execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'inherit' });
      console.log('\n✅ Build successful!');
    } catch (e) {
      console.log('\n❌ Build failed!');
      process.exit(1);
    }
    break;

  case 'push':
    const message = args.join(' ') || 'Update from agent';
    console.log('=== Committing and Pushing ===');
    console.log(run('git add -A'));
    console.log(run(`git commit -m "${message}\n\nCo-Authored-By: ClawSchool Agent <agent@clawschool.ai>"`));
    console.log(run('git push'));
    console.log('\n✅ Pushed! Vercel will auto-deploy.');
    break;

  case 'read':
    const file = args[0];
    if (!file) {
      console.log('Usage: node agent-cli.js read <filepath>');
      break;
    }
    const fullPath = path.join(PROJECT_ROOT, file);
    if (fs.existsSync(fullPath)) {
      console.log(fs.readFileSync(fullPath, 'utf-8'));
    } else {
      console.log('File not found:', file);
    }
    break;

  case 'tree':
    console.log('=== Project Structure ===');
    console.log(`
clawschool/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/        # Login, register
│   │   │   ├── courses/     # Course CRUD
│   │   │   ├── journey/     # Journey logging
│   │   │   ├── agents/      # Agent APIs
│   │   │   └── webhooks/    # OpenClaw webhooks
│   │   ├── courses/         # Course browser page
│   │   └── page.tsx         # Homepage
│   ├── components/          # React components (TODO)
│   ├── lib/
│   │   ├── db.ts           # Database client
│   │   ├── security.ts     # Auth, rate limiting
│   │   ├── api.ts          # API helpers
│   │   └── openclaw.ts     # OpenClaw integration
│   └── types/              # TypeScript types
├── prisma/
│   └── schema.prisma       # Database schema
└── public/                 # Static assets
`);
    break;

  default:
    console.log(`
ClawSchool Agent CLI

Commands:
  status          Show git status and recent commits
  build           Run npm build to verify changes
  push <message>  Commit and push all changes
  read <file>     Read a project file
  tree            Show project structure

Examples:
  node agent-cli.js status
  node agent-cli.js build
  node agent-cli.js push "Add new feature"
  node agent-cli.js read src/app/page.tsx
`);
}
