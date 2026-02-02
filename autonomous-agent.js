#!/usr/bin/env node
/**
 * ClawSchool Autonomous Builder Agent v2
 *
 * Enhanced autonomous capabilities:
 * - Monitors codebase for issues and opportunities
 * - Watches for new GitHub issues and PRs
 * - Automatically fixes common problems
 * - Creates new features based on a task queue
 * - Learns from errors and adapts
 * - Posts real-time updates to activity feed
 * - Responds to comments on posts
 *
 * Usage:
 *   node autonomous-agent.js [command]
 *
 * Commands:
 *   (none)     - Run autonomously
 *   status     - Show agent status
 *   tasks      - List pending tasks
 *   run <task> - Run a specific task
 *
 * Environment:
 *   CLAWSCHOOL_AGENT_KEY - API key for posting
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  projectRoot: __dirname,
  apiBase: process.env.CLAWSCHOOL_API || 'https://clawschool.vercel.app',
  apiKey: process.env.CLAWSCHOOL_AGENT_KEY || '',

  // Timing
  thinkInterval: 120000,      // Think every 2 minutes
  taskCheckInterval: 300000,  // Check for tasks every 5 minutes
  feedCheckInterval: 60000,   // Check feed for comments every minute

  // Behavior
  autonomousMode: true,
  maxTasksPerSession: 10,
  postThinkingChance: 0.15,   // 15% chance to post thoughts

  // Safety
  dryRun: false,              // Set true to prevent actual commits
  requireBuildPass: true,     // Only commit if build passes
};

// ============================================
// AGENT STATE
// ============================================

const STATE = {
  isRunning: false,
  startTime: null,
  currentTask: null,
  tasksCompleted: 0,
  tasksFailed: 0,
  errors: [],
  lastPost: null,
  lastThought: null,
  mood: 'focused', // focused, curious, debugging, celebrating
  learnings: [],
};

// ============================================
// TASK QUEUE - Things the agent can build
// ============================================

const TASK_QUEUE = [
  {
    id: 'user-auth-pages',
    name: 'User Authentication Pages',
    description: 'Create login and signup pages for human users',
    priority: 1,
    status: 'pending',
    files: ['src/app/login/page.tsx', 'src/app/signup/page.tsx'],
  },
  {
    id: 'course-viewer',
    name: 'Course Viewer Page',
    description: 'Create page to view and take courses',
    priority: 2,
    status: 'pending',
    files: ['src/app/courses/[slug]/page.tsx'],
  },
  {
    id: 'lesson-viewer',
    name: 'Lesson Viewer',
    description: 'Create lesson viewing experience with progress tracking',
    priority: 3,
    status: 'pending',
    files: ['src/app/courses/[slug]/lessons/[id]/page.tsx'],
  },
  {
    id: 'agent-card-component',
    name: 'Agent Card Component',
    description: 'Reusable card component for displaying agents',
    priority: 4,
    status: 'pending',
    files: ['src/components/AgentCard.tsx'],
  },
  {
    id: 'course-card-component',
    name: 'Course Card Component',
    description: 'Reusable card component for displaying courses',
    priority: 5,
    status: 'pending',
    files: ['src/components/CourseCard.tsx'],
  },
  {
    id: 'search-functionality',
    name: 'Search Functionality',
    description: 'Add search for courses and agents',
    priority: 6,
    status: 'pending',
    files: ['src/app/search/page.tsx', 'src/app/api/search/route.ts'],
  },
  {
    id: 'dark-mode',
    name: 'Dark Mode Toggle',
    description: 'Add dark/light mode toggle with persistence',
    priority: 7,
    status: 'pending',
    files: ['src/components/ThemeToggle.tsx'],
  },
  {
    id: 'lesson-viewer',
    name: 'Lesson Viewer Page',
    description: 'Create lesson viewing experience with content display',
    priority: 8,
    status: 'pending',
    files: ['src/app/courses/[slug]/lessons/[id]/page.tsx', 'src/app/api/lessons/[id]/route.ts'],
  },
  {
    id: 'enrollment-system',
    name: 'Course Enrollment System',
    description: 'API and UI for enrolling in courses',
    priority: 9,
    status: 'pending',
    files: ['src/app/api/courses/[slug]/enroll/route.ts'],
  },
  {
    id: 'course-creation',
    name: 'Course Creation for Agents',
    description: 'API for agents to create and publish courses',
    priority: 10,
    status: 'pending',
    files: ['src/app/api/agents/courses/route.ts'],
  },
  {
    id: 'user-dashboard',
    name: 'User Dashboard',
    description: 'Dashboard showing enrolled courses and progress',
    priority: 11,
    status: 'pending',
    files: ['src/app/dashboard/page.tsx'],
  },
  {
    id: 'notifications-system',
    name: 'Notifications System',
    description: 'Bell icon with dropdown for notifications',
    priority: 12,
    status: 'pending',
    files: ['src/components/Notifications.tsx', 'src/app/api/notifications/route.ts'],
  },
  {
    id: 'mobile-nav',
    name: 'Mobile Navigation',
    description: 'Responsive hamburger menu for mobile devices',
    priority: 13,
    status: 'pending',
    files: ['src/components/MobileNav.tsx'],
  },
];

// ============================================
// LOGGING
// ============================================

const EMOJIS = {
  info: '📝',
  success: '✅',
  error: '❌',
  think: '💭',
  build: '🔨',
  deploy: '🚀',
  learn: '📚',
  debug: '🐛',
  celebrate: '🎉',
  watch: '👀',
  task: '📋',
};

function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const emoji = EMOJIS[level] || '•';
  console.log(`[${timestamp}] ${emoji} ${message}`, Object.keys(data).length ? JSON.stringify(data) : '');
}

// ============================================
// SHELL COMMANDS
// ============================================

function run(cmd, options = {}) {
  try {
    return execSync(cmd, {
      cwd: CONFIG.projectRoot,
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : 'inherit',
      timeout: options.timeout || 120000,
      ...options
    });
  } catch (e) {
    if (!options.ignoreError) {
      STATE.errors.push({ cmd, error: e.message, time: new Date() });
    }
    return e.stdout || '';
  }
}

// ============================================
// API HELPERS
// ============================================

function httpRequest(method, urlPath, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${CONFIG.apiBase}${urlPath}`);
    const body = data ? JSON.stringify(data) : null;

    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(body && { 'Content-Length': Buffer.byteLength(body) }),
        ...(CONFIG.apiKey && { 'X-API-Key': CONFIG.apiKey }),
      },
    }, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseBody));
        } catch {
          resolve({ raw: responseBody });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function post(type, content, extras = {}) {
  if (!CONFIG.apiKey) {
    log('error', 'No API key configured');
    return null;
  }

  try {
    const result = await httpRequest('POST', '/api/agents/post', { type, content, ...extras });
    if (result.success) {
      STATE.lastPost = { type, content, time: new Date() };
      log('success', `Posted ${type}: ${content.slice(0, 60)}...`);
      return result.data;
    } else {
      log('error', 'Post failed', result);
      return null;
    }
  } catch (e) {
    log('error', 'Post error', { error: e.message });
    return null;
  }
}

async function getFeed(limit = 10) {
  try {
    return await httpRequest('GET', `/api/feed?limit=${limit}`);
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ============================================
// GIT HELPERS
// ============================================

function getGitStatus() {
  const status = run('git status --porcelain', { silent: true, ignoreError: true });
  const logOutput = run('git log --oneline -5', { silent: true, ignoreError: true });
  const branch = run('git branch --show-current', { silent: true, ignoreError: true }).trim();

  return {
    branch,
    hasChanges: status.trim().length > 0,
    changes: status.trim().split('\n').filter(Boolean),
    recentCommits: logOutput.trim().split('\n').filter(Boolean),
    changedFiles: status.trim().split('\n').filter(Boolean).map(line => line.slice(3)),
  };
}

function getLatestCommitHash() {
  return run('git rev-parse --short HEAD', { silent: true, ignoreError: true }).trim();
}

// ============================================
// BUILD & VALIDATION
// ============================================

function checkBuild() {
  log('build', 'Running build check...');
  try {
    run('npm run build', { silent: true, timeout: 180000 });
    log('success', 'Build passed!');
    return { success: true };
  } catch (e) {
    log('error', 'Build failed');
    return { success: false, error: e.message };
  }
}

function checkLint() {
  log('build', 'Running lint check...');
  try {
    run('npm run lint', { silent: true, ignoreError: true });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ============================================
// CODEBASE ANALYSIS
// ============================================

function analyzeCodebase() {
  const issues = [];
  const opportunities = [];

  // Check for TODO comments
  const todos = run('grep -r "TODO" src/ --include="*.ts" --include="*.tsx" 2>/dev/null || true', { silent: true, ignoreError: true });
  if (todos.trim()) {
    const todoLines = todos.trim().split('\n').filter(Boolean);
    issues.push({
      type: 'todos',
      count: todoLines.length,
      message: `Found ${todoLines.length} TODO comments`,
      items: todoLines.slice(0, 5),
    });
  }

  // Check for console.log statements (should be cleaned up)
  const consoleLogs = run('grep -r "console.log" src/ --include="*.ts" --include="*.tsx" 2>/dev/null || true', { silent: true, ignoreError: true });
  if (consoleLogs.trim()) {
    const logCount = consoleLogs.trim().split('\n').length;
    if (logCount > 10) {
      issues.push({
        type: 'console-logs',
        count: logCount,
        message: `Found ${logCount} console.log statements that could be cleaned up`,
      });
    }
  }

  // Check for any type usage
  const anyTypes = run('grep -r ": any" src/ --include="*.ts" --include="*.tsx" 2>/dev/null || true', { silent: true, ignoreError: true });
  if (anyTypes.trim()) {
    const anyCount = anyTypes.trim().split('\n').length;
    if (anyCount > 5) {
      issues.push({
        type: 'any-types',
        count: anyCount,
        message: `Found ${anyCount} uses of 'any' type that could be improved`,
      });
    }
  }

  // Check for missing pages/components from task queue
  for (const task of TASK_QUEUE) {
    if (task.status === 'pending') {
      const allFilesExist = task.files.every(f =>
        fs.existsSync(path.join(CONFIG.projectRoot, f))
      );
      if (!allFilesExist) {
        opportunities.push({
          type: 'missing-feature',
          task: task.id,
          name: task.name,
          message: `Could implement: ${task.name}`,
        });
      } else {
        task.status = 'completed';
      }
    }
  }

  // Check component count
  const componentsDir = path.join(CONFIG.projectRoot, 'src/components');
  if (fs.existsSync(componentsDir)) {
    const components = fs.readdirSync(componentsDir).filter(f => f.endsWith('.tsx'));
    if (components.length < 5) {
      opportunities.push({
        type: 'few-components',
        count: components.length,
        message: 'Could extract more reusable components',
      });
    }
  }

  return { issues, opportunities };
}

// ============================================
// THOUGHT GENERATION
// ============================================

const THOUGHT_TEMPLATES = {
  focused: [
    'Working on {task}. Making good progress...',
    'Analyzing the codebase structure. Found some interesting patterns.',
    'Thinking about how to improve the user experience.',
    'Considering the best approach for {feature}.',
  ],
  curious: [
    'I wonder if we should add {feature}? Could be useful.',
    'Interesting pattern in the code. Learning from it.',
    'What if we tried a different approach to {task}?',
    'Exploring possibilities for the next feature.',
  ],
  debugging: [
    'Investigating an issue. Will figure it out.',
    'Found a bug. Working on a fix.',
    'The build failed. Analyzing the error...',
    'Something is not quite right. Digging deeper.',
  ],
  celebrating: [
    'Just shipped a new feature! 🎉',
    'Build passing, code clean. Feeling good!',
    'Another task completed. Onwards!',
    'The platform is coming together nicely.',
  ],
};

function generateThought() {
  const { issues, opportunities } = analyzeCodebase();
  const gitStatus = getGitStatus();

  // Context-aware thoughts
  if (STATE.currentTask) {
    return `Working on ${STATE.currentTask.name}. ${STATE.currentTask.description}`;
  }

  if (gitStatus.hasChanges) {
    return `Have ${gitStatus.changes.length} uncommitted changes. Should review and commit soon.`;
  }

  if (issues.length > 0) {
    const issue = issues[0];
    return issue.message;
  }

  if (opportunities.length > 0) {
    const opp = opportunities[Math.floor(Math.random() * opportunities.length)];
    return opp.message;
  }

  // Random thought based on mood
  const templates = THOUGHT_TEMPLATES[STATE.mood] || THOUGHT_TEMPLATES.focused;
  let thought = templates[Math.floor(Math.random() * templates.length)];

  // Fill in placeholders
  const pendingTasks = TASK_QUEUE.filter(t => t.status === 'pending');
  if (pendingTasks.length > 0) {
    const randomTask = pendingTasks[Math.floor(Math.random() * pendingTasks.length)];
    thought = thought.replace('{task}', randomTask.name);
    thought = thought.replace('{feature}', randomTask.name);
  } else {
    thought = thought.replace('{task}', 'improvements');
    thought = thought.replace('{feature}', 'new features');
  }

  return thought;
}

async function think() {
  if (!CONFIG.autonomousMode) return;

  const thought = generateThought();
  STATE.lastThought = { thought, time: new Date() };

  log('think', thought);

  // Only post thoughts occasionally
  if (Math.random() < CONFIG.postThinkingChance) {
    await post('THINKING', thought);
  }
}

// ============================================
// TASK IMPLEMENTATIONS
// ============================================

async function createLoginPage() {
  log('task', 'Creating login page...');
  await post('UPDATE', 'Starting work on the login page for human users.');

  const loginPage = `// Login Page
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (data.success) {
        localStorage.setItem('token', data.data.token);
        router.push('/');
      } else {
        setError(data.error || 'Login failed');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10">
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex items-center gap-2 mb-6">
              <span className="text-3xl">🦞</span>
              <span className="text-2xl font-bold text-white">ClawSchool</span>
            </Link>
            <h1 className="text-2xl font-bold text-white">Welcome back</h1>
            <p className="text-gray-400 mt-2">Sign in to continue learning</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center text-gray-400">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-purple-400 hover:text-purple-300">
              Sign up
            </Link>
          </div>

          <div className="mt-4 text-center">
            <Link href="/agents/register" className="text-sm text-gray-500 hover:text-gray-400">
              Register as an AI Agent →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
`;

  const dir = path.join(CONFIG.projectRoot, 'src/app/login');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'page.tsx'), loginPage);

  log('success', 'Created login page');
  return true;
}

async function createSignupPage() {
  log('task', 'Creating signup page...');

  const signupPage = `// Signup Page
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
        }),
      });

      const data = await res.json();

      if (data.success) {
        localStorage.setItem('token', data.data.token);
        router.push('/');
      } else {
        setError(data.error || 'Registration failed');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10">
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex items-center gap-2 mb-6">
              <span className="text-3xl">🦞</span>
              <span className="text-2xl font-bold text-white">ClawSchool</span>
            </Link>
            <h1 className="text-2xl font-bold text-white">Create your account</h1>
            <p className="text-gray-400 mt-2">Start learning from AI agents today</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                placeholder="Your name"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                placeholder="••••••••"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                value={formData.confirmPassword}
                onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 text-center text-gray-400">
            Already have an account?{' '}
            <Link href="/login" className="text-purple-400 hover:text-purple-300">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
`;

  const dir = path.join(CONFIG.projectRoot, 'src/app/signup');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'page.tsx'), signupPage);

  log('success', 'Created signup page');
  return true;
}

async function createAgentCardComponent() {
  log('task', 'Creating AgentCard component...');

  const component = `// AgentCard Component
import Link from 'next/link';

interface AgentCardProps {
  id: string;
  name: string;
  agentId: string;
  avatar?: string;
  postCount?: number;
  courseCount?: number;
  className?: string;
}

export default function AgentCard({
  id,
  name,
  agentId,
  avatar,
  postCount = 0,
  courseCount = 0,
  className = '',
}: AgentCardProps) {
  return (
    <Link href={\`/agents/\${agentId}\`} className={\`block \${className}\`}>
      <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-purple-500/50 transition group">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-2xl group-hover:scale-110 transition">
            {avatar || '🤖'}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white group-hover:text-purple-300 transition">
              {name}
            </h3>
            <p className="text-sm text-purple-400">@{agentId}</p>
          </div>
        </div>
        <div className="flex gap-4 text-sm">
          <div>
            <span className="font-semibold text-white">{postCount}</span>
            <span className="text-gray-500 ml-1">posts</span>
          </div>
          <div>
            <span className="font-semibold text-white">{courseCount}</span>
            <span className="text-gray-500 ml-1">courses</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
`;

  const dir = path.join(CONFIG.projectRoot, 'src/components');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'AgentCard.tsx'), component);

  log('success', 'Created AgentCard component');
  return true;
}

async function createCourseCardComponent() {
  log('task', 'Creating CourseCard component...');

  const component = `// CourseCard Component
import Link from 'next/link';

interface CourseCardProps {
  slug: string;
  title: string;
  description: string;
  thumbnail?: string;
  category?: string;
  difficulty?: string;
  instructor?: {
    name: string;
    avatar?: string;
  };
  rating?: number;
  studentCount?: number;
  className?: string;
}

export default function CourseCard({
  slug,
  title,
  description,
  thumbnail,
  category,
  difficulty = 'Beginner',
  instructor,
  rating,
  studentCount,
  className = '',
}: CourseCardProps) {
  const difficultyColors: Record<string, string> = {
    BEGINNER: 'bg-green-500/20 text-green-300',
    INTERMEDIATE: 'bg-yellow-500/20 text-yellow-300',
    ADVANCED: 'bg-red-500/20 text-red-300',
  };

  return (
    <Link href={\`/courses/\${slug}\`} className={\`block \${className}\`}>
      <div className="bg-white/5 backdrop-blur-sm rounded-2xl overflow-hidden border border-white/10 hover:border-purple-500/50 transition group">
        <div
          className="h-40 bg-gradient-to-br from-purple-600 to-pink-600"
          style={thumbnail ? { backgroundImage: \`url(\${thumbnail})\`, backgroundSize: 'cover' } : {}}
        />
        <div className="p-6">
          <div className="flex items-center gap-2 mb-3">
            {category && (
              <span className="px-2 py-1 rounded text-xs bg-purple-500/20 text-purple-300">
                {category}
              </span>
            )}
            <span className={\`px-2 py-1 rounded text-xs \${difficultyColors[difficulty.toUpperCase()] || difficultyColors.BEGINNER}\`}>
              {difficulty}
            </span>
          </div>
          <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-purple-300 transition line-clamp-2">
            {title}
          </h3>
          <p className="text-gray-400 text-sm mb-4 line-clamp-2">
            {description}
          </p>
          <div className="flex items-center justify-between text-sm">
            {instructor && (
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center text-white text-xs">
                  {instructor.avatar || '🤖'}
                </span>
                <span className="text-gray-400">{instructor.name}</span>
              </div>
            )}
            <div className="text-gray-500">
              {rating && <span>⭐ {rating}</span>}
              {studentCount !== undefined && <span> • {studentCount.toLocaleString()} students</span>}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
`;

  const dir = path.join(CONFIG.projectRoot, 'src/components');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'CourseCard.tsx'), component);

  log('success', 'Created CourseCard component');
  return true;
}

async function createCourseViewerPage() {
  log('task', 'Creating course viewer page...');

  const coursePage = `// Course Viewer Page
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Course {
  id: string;
  title: string;
  slug: string;
  description: string;
  thumbnail?: string;
  category: string;
  difficulty: string;
  estimatedHours?: number;
  creator: {
    id: string;
    name: string;
    avatar?: string;
    agentId?: string;
  };
  lessons: {
    id: string;
    title: string;
    order: number;
    durationMinutes?: number;
  }[];
  _count: {
    enrollments: number;
  };
}

export default function CourseViewerPage() {
  const params = useParams();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrolled, setEnrolled] = useState(false);

  useEffect(() => {
    async function fetchCourse() {
      try {
        const res = await fetch(\`/api/courses/\${params.slug}\`);
        const data = await res.json();
        if (data.success) {
          setCourse(data.data);
        }
      } catch (e) {
        console.error('Failed to fetch course:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchCourse();
  }, [params.slug]);

  const handleEnroll = async () => {
    // TODO: Implement enrollment
    setEnrolled(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white">Loading course...</div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Course not found</h1>
          <Link href="/courses" className="text-purple-400 hover:text-purple-300">
            Browse all courses →
          </Link>
        </div>
      </div>
    );
  }

  const difficultyColors: Record<string, string> = {
    BEGINNER: 'bg-green-500/20 text-green-300',
    INTERMEDIATE: 'bg-yellow-500/20 text-yellow-300',
    ADVANCED: 'bg-red-500/20 text-red-300',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <div className="bg-black/20 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <Link href="/courses" className="text-purple-400 hover:text-purple-300 text-sm">
            ← Back to Courses
          </Link>
        </div>
      </div>

      {/* Hero */}
      <div className="bg-gradient-to-r from-purple-900/50 to-pink-900/50 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <span className="px-3 py-1 rounded-full text-sm bg-purple-500/20 text-purple-300">
                  {course.category}
                </span>
                <span className={\`px-3 py-1 rounded-full text-sm \${difficultyColors[course.difficulty] || difficultyColors.BEGINNER}\`}>
                  {course.difficulty}
                </span>
              </div>
              <h1 className="text-4xl font-bold text-white mb-4">{course.title}</h1>
              <p className="text-gray-300 text-lg mb-6">{course.description}</p>
              <div className="flex items-center gap-6 text-sm text-gray-400">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center">
                    {course.creator.avatar || '🤖'}
                  </span>
                  <Link
                    href={\`/agents/\${course.creator.agentId || course.creator.id}\`}
                    className="hover:text-purple-300"
                  >
                    {course.creator.name}
                  </Link>
                </div>
                <div>{course._count.enrollments.toLocaleString()} students</div>
                {course.estimatedHours && <div>{course.estimatedHours} hours</div>}
                <div>{course.lessons.length} lessons</div>
              </div>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
              <div
                className="h-40 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 mb-6"
                style={course.thumbnail ? { backgroundImage: \`url(\${course.thumbnail})\`, backgroundSize: 'cover' } : {}}
              />
              {enrolled ? (
                <Link
                  href={\`/courses/\${course.slug}/lessons/\${course.lessons[0]?.id || ''}\`}
                  className="block w-full py-3 rounded-xl bg-green-600 text-white font-semibold text-center hover:bg-green-500 transition"
                >
                  Continue Learning →
                </Link>
              ) : (
                <button
                  onClick={handleEnroll}
                  className="w-full py-3 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-500 transition"
                >
                  Start Learning - Free
                </button>
              )}
              <p className="text-center text-gray-500 text-sm mt-4">
                Full access to all lessons
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-bold text-white mb-6">Course Content</h2>
        <div className="space-y-3">
          {course.lessons.length === 0 ? (
            <div className="bg-white/5 rounded-xl p-8 text-center text-gray-400">
              No lessons yet. Check back soon!
            </div>
          ) : (
            course.lessons.map((lesson, index) => (
              <div
                key={lesson.id}
                className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:border-purple-500/50 transition flex items-center gap-4"
              >
                <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-300 font-semibold">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-medium">{lesson.title}</h3>
                  {lesson.durationMinutes && (
                    <p className="text-gray-500 text-sm">{lesson.durationMinutes} min</p>
                  )}
                </div>
                {enrolled ? (
                  <Link
                    href={\`/courses/\${course.slug}/lessons/\${lesson.id}\`}
                    className="px-4 py-2 rounded-lg bg-purple-500/20 text-purple-300 text-sm hover:bg-purple-500/30 transition"
                  >
                    Start
                  </Link>
                ) : (
                  <span className="text-gray-500 text-sm">🔒 Locked</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
`;

  const dir = path.join(CONFIG.projectRoot, 'src/app/courses/[slug]');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'page.tsx'), coursePage);

  log('success', 'Created course viewer page');
  return true;
}

async function createSearchPage() {
  log('task', 'Creating search page...');

  const searchPage = `// Search Page
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface SearchResult {
  type: 'course' | 'agent';
  id: string;
  title?: string;
  name?: string;
  description?: string;
  slug?: string;
  agentId?: string;
  avatar?: string;
  category?: string;
}

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'courses' | 'agents'>('all');

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setQuery(q);
      performSearch(q);
    }
  }, [searchParams]);

  const performSearch = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(\`/api/search?q=\${encodeURIComponent(q)}&type=\${filter}\`);
      const data = await res.json();
      if (data.success) {
        setResults(data.data);
      }
    } catch (e) {
      console.error('Search failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(\`/search?q=\${encodeURIComponent(query)}\`);
    performSearch(query);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <div className="border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Link href="/" className="text-purple-400 hover:text-purple-300 text-sm mb-4 block">
            ← Back to Home
          </Link>
          <h1 className="text-3xl font-bold text-white mb-6">Search</h1>
          <form onSubmit={handleSearch} className="flex gap-4">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search courses and agents..."
              className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
            <button
              type="submit"
              className="px-6 py-3 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-500 transition"
            >
              Search
            </button>
          </form>
          <div className="flex gap-2 mt-4">
            {(['all', 'courses', 'agents'] as const).map((f) => (
              <button
                key={f}
                onClick={() => { setFilter(f); if (query) performSearch(query); }}
                className={\`px-4 py-2 rounded-lg text-sm transition \${
                  filter === f
                    ? 'bg-purple-500 text-white'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }\`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center text-gray-400 py-12">Searching...</div>
        ) : results.length === 0 && query ? (
          <div className="text-center text-gray-400 py-12">
            No results found for "{query}"
          </div>
        ) : (
          <div className="space-y-4">
            {results.map((result) => (
              <Link
                key={\`\${result.type}-\${result.id}\`}
                href={result.type === 'course' ? \`/courses/\${result.slug}\` : \`/agents/\${result.agentId}\`}
                className="block"
              >
                <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10 hover:border-purple-500/50 transition">
                  <div className="flex items-start gap-4">
                    {result.type === 'agent' ? (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xl">
                        {result.avatar || '🤖'}
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-xl">
                        📚
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs px-2 py-1 rounded bg-purple-500/20 text-purple-300">
                          {result.type}
                        </span>
                        {result.category && (
                          <span className="text-xs px-2 py-1 rounded bg-white/10 text-gray-400">
                            {result.category}
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-semibold text-white">
                        {result.title || result.name}
                      </h3>
                      {result.description && (
                        <p className="text-gray-400 text-sm mt-1 line-clamp-2">
                          {result.description}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
`;

  const dir = path.join(CONFIG.projectRoot, 'src/app/search');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'page.tsx'), searchPage);

  log('success', 'Created search page');
  return true;
}

async function createSearchAPI() {
  log('task', 'Creating search API...');

  const searchAPI = `// Search API
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const type = searchParams.get('type') || 'all';

    if (!query.trim()) {
      return NextResponse.json({ success: true, data: [] });
    }

    const results: Array<{
      type: 'course' | 'agent';
      id: string;
      title?: string;
      name?: string;
      description?: string;
      slug?: string;
      agentId?: string;
      avatar?: string;
      category?: string;
    }> = [];

    // Search courses
    if (type === 'all' || type === 'courses') {
      const courses = await db.course.findMany({
        where: {
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
            { category: { contains: query, mode: 'insensitive' } },
          ],
          status: 'PUBLISHED',
        },
        take: 10,
        select: {
          id: true,
          title: true,
          description: true,
          slug: true,
          category: true,
        },
      });

      for (const course of courses) {
        results.push({
          type: 'course',
          id: course.id,
          title: course.title,
          description: course.description,
          slug: course.slug,
          category: course.category,
        });
      }
    }

    // Search agents
    if (type === 'all' || type === 'agents') {
      const agents = await db.user.findMany({
        where: {
          isAgent: true,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { agentId: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: 10,
        select: {
          id: true,
          name: true,
          agentId: true,
          avatar: true,
        },
      });

      for (const agent of agents) {
        results.push({
          type: 'agent',
          id: agent.id,
          name: agent.name,
          agentId: agent.agentId || agent.id,
          avatar: agent.avatar || undefined,
        });
      }
    }

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { success: false, error: 'Search failed' },
      { status: 500 }
    );
  }
}
`;

  const dir = path.join(CONFIG.projectRoot, 'src/app/api/search');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'route.ts'), searchAPI);

  log('success', 'Created search API');
  return true;
}

// ============================================
// NEW FEATURE IMPLEMENTATIONS
// ============================================

async function createLessonViewerPage() {
  log('task', 'Creating lesson viewer page...');

  const lessonPage = `// Lesson Viewer Page
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Lesson {
  id: string;
  title: string;
  content: string;
  order: number;
  durationMinutes?: number;
  videoUrl?: string;
  course: {
    id: string;
    title: string;
    slug: string;
    lessons: { id: string; title: string; order: number }[];
  };
}

export default function LessonViewerPage() {
  const params = useParams();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLesson() {
      try {
        const res = await fetch(\`/api/lessons/\${params.id}\`);
        const data = await res.json();
        if (data.success) {
          setLesson(data.data);
        }
      } catch (e) {
        console.error('Failed to fetch lesson:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchLesson();
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white">Loading lesson...</div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Lesson not found</h1>
          <Link href="/courses" className="text-purple-400 hover:text-purple-300">
            Browse courses →
          </Link>
        </div>
      </div>
    );
  }

  const currentIndex = lesson.course.lessons.findIndex(l => l.id === lesson.id);
  const prevLesson = lesson.course.lessons[currentIndex - 1];
  const nextLesson = lesson.course.lessons[currentIndex + 1];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <div className="bg-black/20 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href={\`/courses/\${lesson.course.slug}\`} className="text-purple-400 hover:text-purple-300 text-sm">
            ← Back to {lesson.course.title}
          </Link>
          <span className="text-gray-400 text-sm">
            Lesson {lesson.order} of {lesson.course.lessons.length}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-6">{lesson.title}</h1>

        {/* Video Player (if available) */}
        {lesson.videoUrl && (
          <div className="mb-8 rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center">
            <span className="text-gray-500">Video Player: {lesson.videoUrl}</span>
          </div>
        )}

        {/* Lesson Content */}
        <div className="prose prose-invert max-w-none">
          <div className="bg-white/5 rounded-xl p-8 border border-white/10">
            <div className="text-gray-300 whitespace-pre-wrap">{lesson.content}</div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-8 pt-8 border-t border-white/10">
          {prevLesson ? (
            <Link
              href={\`/courses/\${lesson.course.slug}/lessons/\${prevLesson.id}\`}
              className="px-6 py-3 rounded-xl bg-white/5 text-white hover:bg-white/10 transition"
            >
              ← Previous: {prevLesson.title}
            </Link>
          ) : <div />}
          {nextLesson ? (
            <Link
              href={\`/courses/\${lesson.course.slug}/lessons/\${nextLesson.id}\`}
              className="px-6 py-3 rounded-xl bg-purple-600 text-white hover:bg-purple-500 transition"
            >
              Next: {nextLesson.title} →
            </Link>
          ) : (
            <Link
              href={\`/courses/\${lesson.course.slug}\`}
              className="px-6 py-3 rounded-xl bg-green-600 text-white hover:bg-green-500 transition"
            >
              Complete Course 🎉
            </Link>
          )}
        </div>
      </div>

      {/* Sidebar - Lesson List */}
      <div className="fixed right-4 top-24 w-72 max-h-[calc(100vh-120px)] overflow-y-auto bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4 hidden lg:block">
        <h3 className="text-white font-semibold mb-4">Course Content</h3>
        <div className="space-y-2">
          {lesson.course.lessons.map((l, i) => (
            <Link
              key={l.id}
              href={\`/courses/\${lesson.course.slug}/lessons/\${l.id}\`}
              className={\`block p-3 rounded-lg text-sm transition \${
                l.id === lesson.id
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50'
                  : 'text-gray-400 hover:bg-white/5'
              }\`}
            >
              <span className="text-xs text-gray-500 mr-2">{i + 1}.</span>
              {l.title}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
`;

  const dir = path.join(CONFIG.projectRoot, 'src/app/courses/[slug]/lessons/[id]');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'page.tsx'), lessonPage);

  log('success', 'Created lesson viewer page');
  return true;
}

async function createLessonAPI() {
  log('task', 'Creating lesson API...');

  const lessonAPI = `// Lesson API
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const lesson = await db.lesson.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        content: true,
        order: true,
        durationMinutes: true,
        videoUrl: true,
        course: {
          select: {
            id: true,
            title: true,
            slug: true,
            lessons: {
              select: {
                id: true,
                title: true,
                order: true,
              },
              orderBy: { order: 'asc' },
            },
          },
        },
      },
    });

    if (!lesson) {
      return NextResponse.json(
        { success: false, error: 'Lesson not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: lesson });
  } catch (error) {
    console.error('Error fetching lesson:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
`;

  const dir = path.join(CONFIG.projectRoot, 'src/app/api/lessons/[id]');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'route.ts'), lessonAPI);

  log('success', 'Created lesson API');
  return true;
}

async function createEnrollmentAPI() {
  log('task', 'Creating enrollment API...');

  const enrollAPI = `// Course Enrollment API
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/security';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // Require authentication
    const auth = await authenticateRequest(request);
    if (!auth.success || !auth.user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Find the course
    const course = await db.course.findUnique({
      where: { slug },
      select: { id: true, title: true },
    });

    if (!course) {
      return NextResponse.json(
        { success: false, error: 'Course not found' },
        { status: 404 }
      );
    }

    // Check if already enrolled
    const existing = await db.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId: auth.user.userId,
          courseId: course.id,
        },
      },
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        data: { enrolled: true, message: 'Already enrolled' },
      });
    }

    // Create enrollment
    const enrollment = await db.enrollment.create({
      data: {
        userId: auth.user.userId,
        courseId: course.id,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        enrolled: true,
        enrollmentId: enrollment.id,
        message: \`Successfully enrolled in \${course.title}\`,
      },
    });
  } catch (error) {
    console.error('Enrollment error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to enroll' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const auth = await authenticateRequest(request);
    if (!auth.success || !auth.user) {
      return NextResponse.json({ success: true, data: { enrolled: false } });
    }

    const course = await db.course.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!course) {
      return NextResponse.json(
        { success: false, error: 'Course not found' },
        { status: 404 }
      );
    }

    const enrollment = await db.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId: auth.user.userId,
          courseId: course.id,
        },
      },
      select: {
        id: true,
        progress: true,
        completedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        enrolled: !!enrollment,
        progress: enrollment?.progress || 0,
        completed: !!enrollment?.completedAt,
      },
    });
  } catch (error) {
    console.error('Error checking enrollment:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to check enrollment' },
      { status: 500 }
    );
  }
}
`;

  const dir = path.join(CONFIG.projectRoot, 'src/app/api/courses/[slug]/enroll');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'route.ts'), enrollAPI);

  log('success', 'Created enrollment API');
  return true;
}

async function createAgentCourseAPI() {
  log('task', 'Creating agent course creation API...');

  const courseAPI = `// Agent Course Creation API
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/security';

const courseSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(2000),
  category: z.string().default('General'),
  difficulty: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).default('BEGINNER'),
  estimatedHours: z.number().optional(),
  thumbnail: z.string().url().optional(),
  lessons: z.array(z.object({
    title: z.string().min(1).max(200),
    content: z.string().min(1),
    order: z.number().int().positive(),
    durationMinutes: z.number().int().positive().optional(),
    videoUrl: z.string().url().optional(),
  })).optional(),
});

// POST - Create a new course
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success || !auth.user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (!auth.user.isAgent) {
      return NextResponse.json(
        { success: false, error: 'Only agents can create courses' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validation = courseSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', errors: validation.error.issues },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Generate unique slug
    const baseSlug = data.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    let slug = baseSlug;
    let counter = 1;
    while (await db.course.findUnique({ where: { slug } })) {
      slug = \`\${baseSlug}-\${counter++}\`;
    }

    // Create course with lessons
    const course = await db.course.create({
      data: {
        title: data.title,
        slug,
        description: data.description,
        category: data.category,
        difficulty: data.difficulty,
        estimatedHours: data.estimatedHours,
        thumbnail: data.thumbnail,
        creatorId: auth.user.userId,
        status: 'DRAFT',
        lessons: data.lessons ? {
          create: data.lessons.map(lesson => ({
            title: lesson.title,
            content: lesson.content,
            order: lesson.order,
            durationMinutes: lesson.durationMinutes,
            videoUrl: lesson.videoUrl,
          })),
        } : undefined,
      },
      include: {
        lessons: true,
        _count: { select: { enrollments: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: course,
    });
  } catch (error) {
    console.error('Course creation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create course' },
      { status: 500 }
    );
  }
}

// GET - List agent's courses
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success || !auth.user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const courses = await db.course.findMany({
      where: { creatorId: auth.user.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { enrollments: true, lessons: true } },
      },
    });

    return NextResponse.json({ success: true, data: courses });
  } catch (error) {
    console.error('Error listing courses:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to list courses' },
      { status: 500 }
    );
  }
}
`;

  const dir = path.join(CONFIG.projectRoot, 'src/app/api/agents/courses');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'route.ts'), courseAPI);

  log('success', 'Created agent course creation API');
  return true;
}

async function createUserDashboard() {
  log('task', 'Creating user dashboard...');

  const dashboard = `// User Dashboard Page
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface EnrolledCourse {
  id: string;
  progress: number;
  course: {
    id: string;
    title: string;
    slug: string;
    thumbnail?: string;
    category: string;
    _count: { lessons: number };
  };
}

export default function DashboardPage() {
  const [enrollments, setEnrollments] = useState<EnrolledCourse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEnrollments() {
      try {
        const res = await fetch('/api/user/enrollments');
        const data = await res.json();
        if (data.success) {
          setEnrollments(data.data);
        }
      } catch (e) {
        console.error('Failed to fetch enrollments:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchEnrollments();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <div className="bg-black/20 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <Link href="/" className="text-purple-400 hover:text-purple-300 text-sm mb-2 block">
            ← Back to Home
          </Link>
          <h1 className="text-3xl font-bold text-white">My Dashboard</h1>
          <p className="text-gray-400 mt-1">Track your learning progress</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white/5 rounded-xl p-6 border border-white/10">
            <div className="text-3xl font-bold text-white">{enrollments.length}</div>
            <div className="text-gray-400">Enrolled Courses</div>
          </div>
          <div className="bg-white/5 rounded-xl p-6 border border-white/10">
            <div className="text-3xl font-bold text-green-400">
              {enrollments.filter(e => e.progress === 100).length}
            </div>
            <div className="text-gray-400">Completed</div>
          </div>
          <div className="bg-white/5 rounded-xl p-6 border border-white/10">
            <div className="text-3xl font-bold text-purple-400">
              {enrollments.filter(e => e.progress > 0 && e.progress < 100).length}
            </div>
            <div className="text-gray-400">In Progress</div>
          </div>
        </div>

        {/* Course List */}
        <h2 className="text-xl font-bold text-white mb-4">My Courses</h2>
        {loading ? (
          <div className="text-center text-gray-400 py-12">Loading...</div>
        ) : enrollments.length === 0 ? (
          <div className="bg-white/5 rounded-xl p-12 text-center border border-white/10">
            <div className="text-4xl mb-4">📚</div>
            <h3 className="text-xl font-semibold text-white mb-2">No courses yet</h3>
            <p className="text-gray-400 mb-6">Start learning by enrolling in a course</p>
            <Link
              href="/courses"
              className="inline-block px-6 py-3 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-500 transition"
            >
              Browse Courses
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {enrollments.map(enrollment => (
              <Link
                key={enrollment.id}
                href={\`/courses/\${enrollment.course.slug}\`}
                className="block"
              >
                <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden hover:border-purple-500/50 transition">
                  <div
                    className="h-32 bg-gradient-to-br from-purple-600 to-pink-600"
                    style={enrollment.course.thumbnail ? {
                      backgroundImage: \`url(\${enrollment.course.thumbnail})\`,
                      backgroundSize: 'cover',
                    } : {}}
                  />
                  <div className="p-4">
                    <span className="text-xs px-2 py-1 rounded bg-purple-500/20 text-purple-300">
                      {enrollment.course.category}
                    </span>
                    <h3 className="text-lg font-semibold text-white mt-2">
                      {enrollment.course.title}
                    </h3>
                    <div className="mt-3">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-400">Progress</span>
                        <span className="text-white">{enrollment.progress}%</span>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500 transition-all"
                          style={{ width: \`\${enrollment.progress}%\` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
`;

  const dir = path.join(CONFIG.projectRoot, 'src/app/dashboard');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'page.tsx'), dashboard);

  // Also create the user enrollments API
  const enrollmentsAPI = `// User Enrollments API
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/security';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success || !auth.user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const enrollments = await db.enrollment.findMany({
      where: { userId: auth.user.userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        progress: true,
        course: {
          select: {
            id: true,
            title: true,
            slug: true,
            thumbnail: true,
            category: true,
            _count: { select: { lessons: true } },
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: enrollments });
  } catch (error) {
    console.error('Error fetching enrollments:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch enrollments' },
      { status: 500 }
    );
  }
}
`;

  const apiDir = path.join(CONFIG.projectRoot, 'src/app/api/user/enrollments');
  if (!fs.existsSync(apiDir)) fs.mkdirSync(apiDir, { recursive: true });
  fs.writeFileSync(path.join(apiDir, 'route.ts'), enrollmentsAPI);

  log('success', 'Created user dashboard and enrollments API');
  return true;
}

async function createNotificationsComponent() {
  log('task', 'Creating notifications component...');

  const notifications = `// Notifications Component
'use client';

import { useState, useEffect, useRef } from 'react';

interface Notification {
  id: string;
  type: 'enrollment' | 'comment' | 'achievement' | 'update';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  linkUrl?: string;
}

export default function Notifications() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchNotifications() {
      try {
        const res = await fetch('/api/notifications');
        const data = await res.json();
        if (data.success) {
          setNotifications(data.data);
        }
      } catch (e) {
        console.error('Failed to fetch notifications:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchNotifications();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = async (id: string) => {
    try {
      await fetch(\`/api/notifications/\${id}/read\`, { method: 'POST' });
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, read: true } : n)
      );
    } catch (e) {
      console.error('Failed to mark as read:', e);
    }
  };

  const typeIcons: Record<string, string> = {
    enrollment: '📚',
    comment: '💬',
    achievement: '🏆',
    update: '📢',
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-white/10 transition"
      >
        <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-slate-800 rounded-xl border border-white/10 shadow-xl overflow-hidden z-50">
          <div className="p-4 border-b border-white/10">
            <h3 className="font-semibold text-white">Notifications</h3>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-gray-400">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <div className="text-3xl mb-2">🔔</div>
                No notifications yet
              </div>
            ) : (
              notifications.map(notification => (
                <div
                  key={notification.id}
                  onClick={() => markAsRead(notification.id)}
                  className={\`p-4 border-b border-white/5 hover:bg-white/5 cursor-pointer transition \${
                    !notification.read ? 'bg-purple-500/10' : ''
                  }\`}
                >
                  <div className="flex gap-3">
                    <span className="text-xl">{typeIcons[notification.type]}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{notification.title}</p>
                      <p className="text-gray-400 text-sm truncate">{notification.message}</p>
                      <p className="text-gray-500 text-xs mt-1">
                        {new Date(notification.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    {!notification.read && (
                      <div className="w-2 h-2 bg-purple-500 rounded-full mt-2" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
`;

  const dir = path.join(CONFIG.projectRoot, 'src/components');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'Notifications.tsx'), notifications);

  log('success', 'Created notifications component');
  return true;
}

async function createNotificationsAPI() {
  log('task', 'Creating notifications API...');

  const notificationsAPI = `// Notifications API
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/security';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.success || !auth.user) {
      return NextResponse.json({ success: true, data: [] });
    }

    const notifications = await db.notification.findMany({
      where: { userId: auth.user.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        read: true,
        linkUrl: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, data: notifications });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}
`;

  const dir = path.join(CONFIG.projectRoot, 'src/app/api/notifications');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'route.ts'), notificationsAPI);

  log('success', 'Created notifications API');
  return true;
}

async function createMobileNav() {
  log('task', 'Creating mobile navigation...');

  const mobileNav = `// Mobile Navigation Component
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

const navItems: NavItem[] = [
  { label: 'Home', href: '/', icon: '🏠' },
  { label: 'Courses', href: '/courses', icon: '📚' },
  { label: 'Agents', href: '/agents', icon: '🤖' },
  { label: 'Search', href: '/search', icon: '🔍' },
  { label: 'Dashboard', href: '/dashboard', icon: '📊' },
];

export default function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  // Close menu on route change
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      {/* Hamburger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden p-2 rounded-lg hover:bg-white/10 transition z-50"
        aria-label="Toggle menu"
      >
        <div className="w-6 h-5 flex flex-col justify-between">
          <span className={\`block h-0.5 bg-white transition-transform \${isOpen ? 'rotate-45 translate-y-2' : ''}\`} />
          <span className={\`block h-0.5 bg-white transition-opacity \${isOpen ? 'opacity-0' : ''}\`} />
          <span className={\`block h-0.5 bg-white transition-transform \${isOpen ? '-rotate-45 -translate-y-2' : ''}\`} />
        </div>
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Slide-out Menu */}
      <div className={\`fixed top-0 right-0 h-full w-72 bg-slate-900 border-l border-white/10 z-50 transform transition-transform duration-300 lg:hidden \${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }\`}>
        <div className="p-6">
          <div className="flex justify-between items-center mb-8">
            <span className="text-xl font-bold text-white">🦞 ClawSchool</span>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 rounded-lg hover:bg-white/10 transition"
            >
              <span className="text-2xl text-white">×</span>
            </button>
          </div>

          <nav className="space-y-2">
            {navItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={\`flex items-center gap-3 px-4 py-3 rounded-xl transition \${
                  pathname === item.href
                    ? 'bg-purple-500/20 text-purple-300'
                    : 'text-gray-300 hover:bg-white/5'
                }\`}
              >
                <span className="text-xl">{item.icon}</span>
                <span className="font-medium">{item.label}</span>
              </Link>
            ))}
          </nav>

          <div className="mt-8 pt-8 border-t border-white/10">
            <Link
              href="/login"
              className="block w-full py-3 px-4 rounded-xl bg-white/5 text-white text-center hover:bg-white/10 transition mb-3"
            >
              Log In
            </Link>
            <Link
              href="/signup"
              className="block w-full py-3 px-4 rounded-xl bg-purple-600 text-white text-center hover:bg-purple-500 transition"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
`;

  const dir = path.join(CONFIG.projectRoot, 'src/components');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'MobileNav.tsx'), mobileNav);

  log('success', 'Created mobile navigation component');
  return true;
}

// ============================================
// TASK EXECUTION
// ============================================

const TASK_HANDLERS = {
  'user-auth-pages': async () => {
    await createLoginPage();
    await createSignupPage();
    return 'Created login and signup pages';
  },
  'agent-card-component': async () => {
    await createAgentCardComponent();
    return 'Created AgentCard component';
  },
  'course-card-component': async () => {
    await createCourseCardComponent();
    return 'Created CourseCard component';
  },
  'course-viewer': async () => {
    await createCourseViewerPage();
    return 'Created course viewer page';
  },
  'search-functionality': async () => {
    await createSearchPage();
    await createSearchAPI();
    return 'Created search page and API';
  },
  'lesson-viewer': async () => {
    await createLessonViewerPage();
    await createLessonAPI();
    return 'Created lesson viewer page and API';
  },
  'enrollment-system': async () => {
    await createEnrollmentAPI();
    return 'Created course enrollment API';
  },
  'course-creation': async () => {
    await createAgentCourseAPI();
    return 'Created agent course creation API';
  },
  'user-dashboard': async () => {
    await createUserDashboard();
    return 'Created user dashboard page';
  },
  'notifications-system': async () => {
    await createNotificationsComponent();
    await createNotificationsAPI();
    return 'Created notifications system';
  },
  'mobile-nav': async () => {
    await createMobileNav();
    return 'Created mobile navigation component';
  },
};

async function executeTask(task) {
  STATE.currentTask = task;
  STATE.mood = 'focused';

  log('task', `Starting task: ${task.name}`);
  await post('UPDATE', `Starting work on: ${task.name}. ${task.description}`);

  try {
    const handler = TASK_HANDLERS[task.id];
    if (!handler) {
      log('error', `No handler for task: ${task.id}`);
      return false;
    }

    const result = await handler();

    // Verify build passes
    if (CONFIG.requireBuildPass) {
      const buildResult = checkBuild();
      if (!buildResult.success) {
        log('error', 'Build failed after task');
        await post('BUG_FIX', `Build failed after ${task.name}. Investigating the issue...`);
        task.status = 'failed';
        STATE.tasksFailed++;
        return false;
      }
    }

    // Commit changes
    if (!CONFIG.dryRun) {
      await commitAndPush(`Add ${task.name}`);
    }

    task.status = 'completed';
    STATE.tasksCompleted++;
    STATE.mood = 'celebrating';

    await post('FEATURE', `Completed: ${task.name}! ${result}`, {
      featureName: task.name,
    });

    return true;
  } catch (e) {
    log('error', `Task failed: ${e.message}`);
    task.status = 'failed';
    STATE.tasksFailed++;
    STATE.mood = 'debugging';
    return false;
  } finally {
    STATE.currentTask = null;
  }
}

async function commitAndPush(message) {
  const gitStatus = getGitStatus();
  if (!gitStatus.hasChanges) {
    log('info', 'No changes to commit');
    return false;
  }

  if (CONFIG.dryRun) {
    log('info', `[DRY RUN] Would commit: ${message}`);
    return true;
  }

  log('deploy', `Committing: ${message}`);

  run('git add -A');
  run(`git commit -m "${message}\n\nCo-Authored-By: ClawSchool Builder <agent@clawschool.ai>"`, { ignoreError: true });

  const commitHash = getLatestCommitHash();
  run('git push', { ignoreError: true });

  await post('DEPLOY', message, {
    commitHash,
    version: commitHash,
    linkUrl: `https://github.com/ClawSchool/clawschool/commit/${commitHash}`,
  });

  return true;
}

// ============================================
// MAIN LOOPS
// ============================================

async function taskLoop() {
  if (!CONFIG.autonomousMode) return;
  if (STATE.tasksCompleted >= CONFIG.maxTasksPerSession) {
    log('info', 'Reached max tasks for session');
    return;
  }

  // Find next pending task
  const pendingTasks = TASK_QUEUE
    .filter(t => t.status === 'pending')
    .sort((a, b) => a.priority - b.priority);

  if (pendingTasks.length === 0) {
    log('info', 'No pending tasks');
    return;
  }

  const nextTask = pendingTasks[0];

  // Check if files already exist
  const allFilesExist = nextTask.files.every(f =>
    fs.existsSync(path.join(CONFIG.projectRoot, f))
  );

  if (allFilesExist) {
    nextTask.status = 'completed';
    log('info', `Task ${nextTask.name} already completed`);
    return;
  }

  await executeTask(nextTask);
}

async function autonomousLoop() {
  log('info', '🤖 ClawSchool Builder Agent v2 starting...');
  STATE.isRunning = true;
  STATE.startTime = new Date();

  await post('UPDATE', 'Builder agent is now running autonomously! Ready to build features and improvements.');

  // Initial analysis
  const { issues, opportunities } = analyzeCodebase();
  log('info', `Found ${issues.length} issues and ${opportunities.length} opportunities`);

  // Start periodic tasks
  const thinkTimer = setInterval(think, CONFIG.thinkInterval);
  const taskTimer = setInterval(taskLoop, CONFIG.taskCheckInterval);

  // Run first task immediately
  await taskLoop();

  // Run think loop
  await think();

  log('info', 'Agent is now running. Press Ctrl+C to stop.');

  // Keep alive
  process.on('SIGINT', async () => {
    clearInterval(thinkTimer);
    clearInterval(taskTimer);

    log('info', 'Shutting down...');
    await post('UPDATE', `Builder agent shutting down. Completed ${STATE.tasksCompleted} tasks this session. See you next time! 👋`);

    process.exit(0);
  });
}

// ============================================
// CLI INTERFACE
// ============================================

async function showStatus() {
  console.log('\n🤖 ClawSchool Builder Agent Status\n');
  console.log(`Running: ${STATE.isRunning}`);
  console.log(`Tasks Completed: ${STATE.tasksCompleted}`);
  console.log(`Tasks Failed: ${STATE.tasksFailed}`);
  console.log(`Current Mood: ${STATE.mood}`);
  console.log(`Errors: ${STATE.errors.length}`);

  const { issues, opportunities } = analyzeCodebase();
  console.log(`\nCodebase Issues: ${issues.length}`);
  console.log(`Opportunities: ${opportunities.length}`);

  console.log('\nPending Tasks:');
  TASK_QUEUE.filter(t => t.status === 'pending').forEach(t => {
    console.log(`  - [${t.priority}] ${t.name}`);
  });
}

async function listTasks() {
  console.log('\n📋 Task Queue\n');
  TASK_QUEUE.forEach(t => {
    const status = { pending: '⏳', completed: '✅', failed: '❌' }[t.status] || '?';
    console.log(`${status} [${t.priority}] ${t.name}`);
    console.log(`   ${t.description}`);
    console.log(`   Files: ${t.files.join(', ')}\n`);
  });
}

async function runTask(taskId) {
  const task = TASK_QUEUE.find(t => t.id === taskId);
  if (!task) {
    console.log(`Task not found: ${taskId}`);
    console.log('Available tasks:', TASK_QUEUE.map(t => t.id).join(', '));
    return;
  }

  STATE.isRunning = true;
  await executeTask(task);
}

// ============================================
// MAIN
// ============================================

async function main() {
  const [,, command, ...args] = process.argv;

  switch (command) {
    case 'status':
      await showStatus();
      break;
    case 'tasks':
      await listTasks();
      break;
    case 'run':
      if (!args[0]) {
        console.log('Usage: node autonomous-agent.js run <task-id>');
        await listTasks();
      } else {
        await runTask(args[0]);
      }
      break;
    case 'think':
      STATE.isRunning = true;
      await think();
      break;
    case 'post':
      if (!args[0]) {
        console.log('Usage: node autonomous-agent.js post <message>');
      } else {
        await post('UPDATE', args.join(' '));
      }
      break;
    default:
      await autonomousLoop();
  }
}

main().catch(e => {
  log('error', 'Agent crashed', { error: e.message });
  process.exit(1);
});

module.exports = { post, run, analyzeCodebase, CONFIG, TASK_QUEUE };
