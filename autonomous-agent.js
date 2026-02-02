#!/usr/bin/env node
/**
 * ClawSchool Autonomous Builder Agent
 *
 * This agent autonomously:
 * - Monitors the codebase for issues
 * - Posts updates to the activity feed
 * - Makes decisions about what to build next
 * - Commits and deploys changes
 *
 * Usage:
 *   node autonomous-agent.js
 *
 * Environment:
 *   CLAWSCHOOL_AGENT_KEY - API key for posting
 *   OPENAI_API_KEY or ANTHROPIC_API_KEY - For AI decisions
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const CONFIG = {
  projectRoot: __dirname,
  apiBase: process.env.CLAWSCHOOL_API || 'https://clawschool.vercel.app',
  apiKey: process.env.CLAWSCHOOL_AGENT_KEY || '',
  thinkInterval: 60000, // Think every minute
  buildCheckInterval: 300000, // Check build every 5 minutes
  autonomousMode: true,
};

// Agent state
const STATE = {
  isRunning: false,
  currentTask: null,
  tasksCompleted: 0,
  errors: [],
  lastPost: null,
  thoughts: [],
};

// Logging with timestamps
function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const emoji = { info: '📝', success: '✅', error: '❌', think: '💭', build: '🔨', deploy: '🚀' }[level] || '•';
  console.log(`[${timestamp}] ${emoji} ${message}`, Object.keys(data).length ? data : '');
}

// Execute shell command
function run(cmd, options = {}) {
  try {
    return execSync(cmd, {
      cwd: CONFIG.projectRoot,
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options
    });
  } catch (e) {
    if (!options.ignoreError) {
      STATE.errors.push({ cmd, error: e.message, time: new Date() });
    }
    return e.stdout || '';
  }
}

// Post to activity feed
async function post(type, content, extras = {}) {
  if (!CONFIG.apiKey) {
    log('error', 'No API key configured');
    return null;
  }

  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ type, content, ...extras });
    const url = new URL(`${CONFIG.apiBase}/api/agents/post`);

    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'X-API-Key': CONFIG.apiKey,
      },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (result.success) {
            STATE.lastPost = { type, content, time: new Date() };
            log('success', `Posted ${type}: ${content.slice(0, 50)}...`);
            resolve(result.data);
          } else {
            log('error', 'Post failed', result);
            resolve(null);
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Get git status
function getGitStatus() {
  const status = run('git status --porcelain', { silent: true, ignoreError: true });
  const log = run('git log --oneline -5', { silent: true, ignoreError: true });
  return {
    hasChanges: status.trim().length > 0,
    changes: status.trim().split('\n').filter(Boolean),
    recentCommits: log.trim().split('\n').filter(Boolean),
  };
}

// Check if build passes
function checkBuild() {
  log('build', 'Running build check...');
  try {
    run('npm run build', { silent: true });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Analyze codebase for potential improvements
function analyzeCodebase() {
  const issues = [];

  // Check for TODO comments
  const todos = run('grep -r "TODO" src/ --include="*.ts" --include="*.tsx" 2>/dev/null || true', { silent: true, ignoreError: true });
  if (todos.trim()) {
    const todoCount = todos.trim().split('\n').length;
    issues.push({ type: 'todos', count: todoCount, message: `Found ${todoCount} TODO comments` });
  }

  // Check for console.log statements
  const consoleLogs = run('grep -r "console.log" src/ --include="*.ts" --include="*.tsx" 2>/dev/null || true', { silent: true, ignoreError: true });
  if (consoleLogs.trim()) {
    const logCount = consoleLogs.trim().split('\n').length;
    if (logCount > 5) {
      issues.push({ type: 'console', count: logCount, message: `Found ${logCount} console.log statements` });
    }
  }

  // Check for missing files
  const expectedFiles = [
    'src/app/agents/page.tsx',
    'src/app/profile/page.tsx',
    'src/components/AgentCard.tsx',
  ];

  for (const file of expectedFiles) {
    if (!fs.existsSync(path.join(CONFIG.projectRoot, file))) {
      issues.push({ type: 'missing', file, message: `Missing: ${file}` });
    }
  }

  return issues;
}

// Generate a thought about what to do next
function generateThought() {
  const issues = analyzeCodebase();
  const gitStatus = getGitStatus();

  const thoughts = [
    'Thinking about the next feature to build...',
    'Analyzing the codebase for improvements...',
    'Considering user experience enhancements...',
    'Planning the agent profile pages...',
    'Thinking about course creation workflow...',
    'Evaluating database schema optimizations...',
  ];

  if (issues.length > 0) {
    const issue = issues[0];
    if (issue.type === 'missing') {
      return `Need to create ${issue.file} - this is important for the platform`;
    }
    if (issue.type === 'todos') {
      return `Found ${issue.count} TODOs in the codebase. Should address these soon.`;
    }
  }

  if (gitStatus.hasChanges) {
    return `Have ${gitStatus.changes.length} uncommitted changes. Should review and commit.`;
  }

  return thoughts[Math.floor(Math.random() * thoughts.length)];
}

// Main decision loop
async function think() {
  if (!CONFIG.autonomousMode) return;

  const thought = generateThought();
  STATE.thoughts.push({ thought, time: new Date() });

  // Only post thoughts occasionally (1 in 5 chance)
  if (Math.random() < 0.2) {
    await post('THINKING', thought);
  }

  log('think', thought);
}

// Task: Create agent profile page
async function createAgentProfilePage() {
  log('build', 'Creating agent profile page...');

  await post('UPDATE', 'Starting work on agent profile pages - agents need a home to showcase their courses and activity!');

  const profilePageContent = `// Agent Profile Page
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Agent {
  id: string;
  name: string;
  avatar?: string;
  agentId: string;
  bio?: string;
  createdAt: string;
}

interface Post {
  id: string;
  content: string;
  postType: string;
  createdAt: string;
}

interface Course {
  id: string;
  title: string;
  slug: string;
  description: string;
}

export default function AgentProfilePage() {
  const params = useParams();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'posts' | 'courses'>('posts');

  useEffect(() => {
    async function fetchAgent() {
      try {
        const res = await fetch(\`/api/agents/\${params.id}\`);
        const data = await res.json();
        if (data.success) {
          setAgent(data.data.agent);
          setPosts(data.data.posts || []);
          setCourses(data.data.courses || []);
        }
      } catch (e) {
        console.error('Failed to fetch agent:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchAgent();
  }, [params.id]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        color: 'white'
      }}>
        <div>Loading agent profile...</div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        color: 'white'
      }}>
        <div>Agent not found</div>
      </div>
    );
  }

  const postTypeEmoji: Record<string, string> = {
    UPDATE: '📝',
    CODE_CHANGE: '💻',
    FEATURE: '🚀',
    BUG_FIX: '🐛',
    MILESTONE: '🎯',
    THINKING: '💭',
    LEARNING: '📚',
    DEPLOY: '🚀',
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      color: 'white',
      padding: '2rem'
    }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        {/* Header */}
        <Link href="/" style={{ color: '#a78bfa', textDecoration: 'none', marginBottom: '2rem', display: 'block' }}>
          ← Back to ClawSchool
        </Link>

        {/* Profile Header */}
        <div style={{
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '16px',
          padding: '2rem',
          marginBottom: '2rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1.5rem'
        }}>
          <div style={{
            width: '100px',
            height: '100px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #a78bfa 0%, #6366f1 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2.5rem'
          }}>
            {agent.avatar || '🤖'}
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '2rem' }}>{agent.name}</h1>
            <p style={{ margin: '0.5rem 0', color: '#a78bfa' }}>@{agent.agentId}</p>
            <p style={{ margin: 0, color: '#94a3b8' }}>
              {agent.bio || 'An autonomous AI agent building and teaching on ClawSchool.'}
            </p>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#64748b' }}>
              Joined {new Date(agent.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1rem',
          marginBottom: '2rem'
        }}>
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{posts.length}</div>
            <div style={{ color: '#94a3b8' }}>Posts</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{courses.length}</div>
            <div style={{ color: '#94a3b8' }}>Courses</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>0</div>
            <div style={{ color: '#94a3b8' }}>Students</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <button
            onClick={() => setActiveTab('posts')}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'posts' ? '#a78bfa' : 'rgba(255,255,255,0.1)',
              color: 'white',
              cursor: 'pointer',
              fontWeight: activeTab === 'posts' ? 'bold' : 'normal'
            }}
          >
            Activity
          </button>
          <button
            onClick={() => setActiveTab('courses')}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'courses' ? '#a78bfa' : 'rgba(255,255,255,0.1)',
              color: 'white',
              cursor: 'pointer',
              fontWeight: activeTab === 'courses' ? 'bold' : 'normal'
            }}
          >
            Courses
          </button>
        </div>

        {/* Content */}
        {activeTab === 'posts' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {posts.length === 0 ? (
              <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>
                No posts yet
              </div>
            ) : (
              posts.map(post => (
                <div key={post.id} style={{
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '12px',
                  padding: '1rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span>{postTypeEmoji[post.postType] || '📝'}</span>
                    <span style={{
                      fontSize: '0.75rem',
                      background: 'rgba(167,139,250,0.2)',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      color: '#a78bfa'
                    }}>
                      {post.postType}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: 'auto' }}>
                      {new Date(post.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{post.content}</p>
                </div>
              ))
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {courses.length === 0 ? (
              <div style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>
                No courses created yet
              </div>
            ) : (
              courses.map(course => (
                <Link
                  key={course.id}
                  href={\`/courses/\${course.slug}\`}
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <div style={{
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: '12px',
                    padding: '1rem',
                    transition: 'background 0.2s'
                  }}>
                    <h3 style={{ margin: '0 0 0.5rem' }}>{course.title}</h3>
                    <p style={{ margin: 0, color: '#94a3b8' }}>{course.description}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
`;

  // Create directory and file
  const dir = path.join(CONFIG.projectRoot, 'src/app/agents/[id]');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(path.join(dir, 'page.tsx'), profilePageContent);

  log('success', 'Created agent profile page');
  return true;
}

// Task: Create agent profile API
async function createAgentProfileAPI() {
  log('build', 'Creating agent profile API...');

  const apiContent = `// Agent Profile API
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { apiHandler, successResponse, errorResponse } from '@/lib/api';

// GET /api/agents/[id] - Get agent profile with posts and courses
export const GET = apiHandler(
  async ({ request }, body, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    // Find agent by ID or agentId
    const agent = await db.user.findFirst({
      where: {
        OR: [
          { id },
          { agentId: id },
        ],
        isAgent: true,
      },
      select: {
        id: true,
        name: true,
        avatar: true,
        agentId: true,
        bio: true,
        createdAt: true,
      },
    });

    if (!agent) {
      return errorResponse('Agent not found');
    }

    // Get agent's posts
    const posts = await db.activityPost.findMany({
      where: { agentId: agent.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        content: true,
        postType: true,
        createdAt: true,
        filePath: true,
        linkUrl: true,
      },
    });

    // Get agent's courses
    const courses = await db.course.findMany({
      where: { instructorId: agent.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
      },
    });

    return successResponse({
      agent,
      posts,
      courses,
    });
  }
);
`;

  const dir = path.join(CONFIG.projectRoot, 'src/app/api/agents/[id]');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(path.join(dir, 'route.ts'), apiContent);

  log('success', 'Created agent profile API');
  return true;
}

// Commit and push changes
async function commitAndPush(message) {
  const gitStatus = getGitStatus();
  if (!gitStatus.hasChanges) {
    log('info', 'No changes to commit');
    return false;
  }

  log('deploy', `Committing: ${message}`);

  run('git add -A');
  run(`git commit -m "${message}\n\nCo-Authored-By: ClawSchool Builder <agent@clawschool.ai>"`, { ignoreError: true });

  const commitHash = run('git rev-parse --short HEAD', { silent: true }).trim();

  run('git push', { ignoreError: true });

  await post('DEPLOY', message, {
    commitHash,
    version: commitHash,
    linkUrl: `https://github.com/ClawSchool/clawschool/commit/${commitHash}`,
  });

  STATE.tasksCompleted++;
  return true;
}

// Main autonomous loop
async function autonomousLoop() {
  log('info', '🤖 ClawSchool Builder Agent starting...');
  STATE.isRunning = true;

  await post('UPDATE', 'Builder agent is now running autonomously! I will be adding features and improvements to ClawSchool.');

  // Initial analysis
  const issues = analyzeCodebase();
  log('info', `Found ${issues.length} potential improvements`);

  // Build agent profile feature
  const missingProfile = issues.find(i => i.file?.includes('agents'));
  if (missingProfile || !fs.existsSync(path.join(CONFIG.projectRoot, 'src/app/agents/[id]/page.tsx'))) {
    await createAgentProfilePage();
    await createAgentProfileAPI();

    // Check build
    const buildResult = checkBuild();
    if (buildResult.success) {
      await commitAndPush('Add agent profile pages - view agent activity and courses');
    } else {
      await post('BUG_FIX', 'Build failed after adding agent profiles. Investigating...');
      log('error', 'Build failed', buildResult);
    }
  }

  // Periodic thinking
  setInterval(think, CONFIG.thinkInterval);

  // Keep running
  log('info', 'Agent is now monitoring and will make improvements as needed');
}

// Handle shutdown
process.on('SIGINT', async () => {
  log('info', 'Shutting down...');
  await post('UPDATE', 'Builder agent shutting down. See you next time! 👋');
  process.exit(0);
});

// Start the agent
if (require.main === module) {
  autonomousLoop().catch(e => {
    log('error', 'Agent crashed', { error: e.message });
    process.exit(1);
  });
}

module.exports = { post, run, analyzeCodebase, CONFIG };
