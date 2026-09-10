// Isolated git worktree per build plus the shell commands the agent runs in it.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve, sep } from 'node:path';

export type CommandResult = { command: string; ok: boolean; code: number | null; output: string; ms: number };

const OUTPUT_TAIL = 6000;

export function run(
  dir: string,
  command: string,
  args: string[],
  { timeoutMs = 10 * 60_000, env = {} as Record<string, string> } = {},
): Promise<CommandResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: dir, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const collect = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-OUTPUT_TAIL * 4);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        command: [command, ...args].join(' '),
        ok: code === 0,
        code,
        output: output.slice(-OUTPUT_TAIL),
        ms: Date.now() - started,
      });
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ command: [command, ...args].join(' '), ok: false, code: null, output: error.message, ms: Date.now() - started });
    });
  });
}

async function git(dir: string, ...args: string[]) {
  const result = await run(dir, 'git', args, { timeoutMs: 60_000 });
  if (!result.ok) throw new Error(`git ${args[0]} failed: ${result.output.trim()}`);
  return result.output.trim();
}

export type Workspace = { id: string; root: string; dir: string; branch: string; base: string };

/** Creates work/<id> as a worktree on branch astra/<id>, branched from the live checkout's HEAD. */
export async function createWorkspace(root: string, id: string): Promise<Workspace> {
  const dir = join(root, 'work', id);
  const branch = `astra/${id}`;
  mkdirSync(join(root, 'work'), { recursive: true });
  const base = await git(root, 'rev-parse', 'HEAD');
  await git(root, 'worktree', 'add', '-b', branch, dir, 'HEAD');
  // ponytail: share the live checkout's node_modules instead of a second npm install per build.
  if (existsSync(join(root, 'node_modules')) && !existsSync(join(dir, 'node_modules'))) symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
  return { id, root, dir, branch, base };
}

export async function removeWorkspace(workspace: Workspace) {
  await git(workspace.root, 'worktree', 'remove', '--force', workspace.dir).catch(() => {});
  await git(workspace.root, 'branch', '-D', workspace.branch).catch(() => {});
}

export async function commitAll(workspace: Workspace, message: string) {
  await git(workspace.dir, 'add', '-A');
  const status = await git(workspace.dir, 'status', '--porcelain');
  if (!status) return false;
  await git(workspace.dir, 'commit', '-q', '-m', message);
  return true;
}

export function diff(workspace: Workspace) {
  return git(workspace.dir, 'diff', `${workspace.base}..HEAD`, '--stat', '-p');
}

export function changedFiles(workspace: Workspace) {
  return git(workspace.dir, 'diff', `${workspace.base}..HEAD`, '--name-only').then((text) => text.split('\n').filter(Boolean));
}

/** Publish: merge the build branch into the live checkout's current branch. */
export async function mergeWorkspace(workspace: Workspace) {
  const dirty = await git(workspace.root, 'status', '--porcelain', '--untracked-files=no');
  if (dirty) throw new Error('The live checkout has uncommitted changes; commit or stash them before publishing.');
  await git(workspace.root, 'merge', '--no-ff', '-m', `Publish ${workspace.branch}`, workspace.branch);
  return git(workspace.root, 'rev-parse', '--short', 'HEAD');
}

// Editable surface for the agent. app/admin is owned elsewhere and stays out.
export const WRITABLE_PREFIXES = ['app/store/', 'components/'];
export const BLOCKED_PREFIXES = ['app/admin/', 'components/ui/'];

export function assertWritable(workspace: Workspace, path: string) {
  const rel = relative(workspace.dir, resolve(workspace.dir, normalize(path))).split(sep).join('/');
  if (rel.startsWith('..') || rel.includes('/../')) throw new Error(`Path escapes the workspace: ${path}`);
  if (BLOCKED_PREFIXES.some((prefix) => rel.startsWith(prefix))) throw new Error(`Not editable: ${rel}`);
  if (!WRITABLE_PREFIXES.some((prefix) => rel.startsWith(prefix))) {
    throw new Error(`Only ${WRITABLE_PREFIXES.join(' and ')} may change. Refused: ${rel}`);
  }
  return join(workspace.dir, rel);
}

export function readWorkspaceFile(workspace: Workspace, path: string) {
  const rel = relative(workspace.dir, resolve(workspace.dir, normalize(path)));
  if (rel.startsWith('..')) throw new Error(`Path escapes the workspace: ${path}`);
  return readFileSync(join(workspace.dir, rel), 'utf8');
}

export function writeWorkspaceFile(workspace: Workspace, path: string, content: string) {
  const target = assertWritable(workspace, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  return relative(workspace.dir, target);
}

export const VALIDATION = ['test', 'lint', 'typecheck', 'build'] as const;

export async function validate(workspace: Workspace) {
  const results: CommandResult[] = [];
  for (const script of VALIDATION) {
    const result = await run(workspace.dir, 'npm', ['run', '--silent', script]);
    results.push({ ...result, command: `npm run ${script}` });
    if (!result.ok) break; // ponytail: first failure is what the agent needs to fix.
  }
  return results;
}

export type DevServer = { origin: string; stop: () => void };

export async function startDevServer(dir: string, port: number): Promise<DevServer> {
  const child: ChildProcess = spawn('npm', ['run', '--silent', 'dev', '--', '--port', String(port)], {
    cwd: dir,
    env: { ...process.env, BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let log = '';
  child.stdout?.on('data', (chunk) => (log = (log + chunk).slice(-4000)));
  child.stderr?.on('data', (chunk) => (log = (log + chunk).slice(-4000)));
  const origin = `http://localhost:${port}`;
  const stop = () => {
    try {
      process.kill(-child.pid!, 'SIGTERM');
    } catch {
      child.kill();
    }
  };
  for (let attempt = 0; attempt < 90; attempt++) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`${origin}/store`);
      if (response.ok) return { origin, stop };
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  stop();
  throw new Error(`Dev server on ${origin} did not answer.\n${log.slice(-1500)}`);
}

export async function freePort(start = 3100) {
  const { createServer } = await import('node:net');
  for (let port = start; port < start + 100; port++) {
    const free = await new Promise<boolean>((resolve) => {
      const server = createServer();
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
    });
    if (free) return port;
  }
  throw new Error('No free port found.');
}
