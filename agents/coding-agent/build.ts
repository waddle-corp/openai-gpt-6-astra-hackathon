// One build = one opportunity → one isolated worktree → agent loop → validation → merchant review.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ImprovementOpportunity } from '../feedback-agent/synthesize.ts';
import { runAgent, type AgentEvent } from './agent.ts';
import { Browser, type Page, type Viewport } from './browser.ts';
import {
  changedFiles,
  commitAll,
  createWorkspace,
  diff,
  freePort,
  mergeWorkspace,
  removeWorkspace,
  startDevServer,
  validate,
  type CommandResult,
  type DevServer,
  type Workspace,
} from './workspace.ts';

export type BuildStatus = 'building' | 'validating' | 'review' | 'draft' | 'published' | 'rejected' | 'failed';
export type Decision = 'publish' | 'reject' | 'request_change' | 'draft';
export type Shots = Partial<Record<Viewport, string>>;

export type Build = {
  id: string;
  status: BuildStatus;
  createdAt: string;
  updatedAt: string;
  opportunity: ImprovementOpportunity;
  branch: string;
  dir: string;
  base: string;
  liveOrigin: string;
  previewOrigin?: string;
  reviewPath: string;
  events: AgentEvent[];
  summary?: string;
  changedFiles: string[];
  diff?: string;
  checks: CommandResult[];
  screenshots: { original: Shots; result: Shots };
  notes: string[];
  error?: string;
  mergedCommit?: string;
};

type Live = { workspace: Workspace; server?: DevServer; browser?: Browser; page?: Page };

const builds = new Map<string, Build>();
const live = new Map<string, Live>();

const root = () => process.env.ASTRA_REPO_ROOT || process.cwd();
const stateDir = () => join(root(), 'work', 'builds');

function persist(build: Build) {
  build.updatedAt = new Date().toISOString();
  mkdirSync(stateDir(), { recursive: true });
  writeFileSync(join(stateDir(), `${build.id}.json`), JSON.stringify(build));
}

export function loadBuilds() {
  if (!existsSync(stateDir())) return;
  for (const file of readdirSync(stateDir())) {
    if (!file.endsWith('.json')) continue;
    const build = JSON.parse(readFileSync(join(stateDir(), file), 'utf8')) as Build;
    // A runner restart loses the in-flight agent; only finished states survive.
    if (build.status === 'building' || build.status === 'validating') {
      build.status = 'failed';
      build.error = 'The runner restarted while this build was running.';
    }
    builds.set(build.id, build);
  }
}

export const listBuilds = () => [...builds.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
export const getBuild = (id: string) => builds.get(id);

/** Strip the heavy fields for list views. */
export function summarize(build: Build) {
  const { diff: _diff, screenshots: _shots, events: _events, ...rest } = build;
  return { ...rest, eventCount: build.events.length };
}

export function startBuild(opportunity: ImprovementOpportunity, liveOrigin: string) {
  const id = `${Date.now().toString(36)}-${opportunity.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}`;
  const build: Build = {
    id,
    status: 'building',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    opportunity,
    branch: `astra/${id}`,
    dir: join(root(), 'work', id),
    base: '',
    liveOrigin,
    reviewPath: '/store',
    events: [],
    changedFiles: [],
    checks: [],
    screenshots: { original: {}, result: {} },
    notes: [],
  };
  builds.set(id, build);
  persist(build);
  void execute(build).catch((error) => fail(build, error));
  return build;
}

function fail(build: Build, error: unknown) {
  build.status = 'failed';
  build.error = error instanceof Error ? error.message : String(error);
  build.events.push({ at: new Date().toISOString(), kind: 'error', text: build.error });
  persist(build);
  void stopPreview(build.id);
}

async function ensureLive(build: Build): Promise<Live> {
  let entry = live.get(build.id);
  if (!entry) {
    entry = { workspace: workspaceOf(build) };
    live.set(build.id, entry);
  }
  if (!entry.server) {
    entry.server = await startDevServer(build.dir, await freePort(3200));
    build.previewOrigin = entry.server.origin;
  }
  if (!entry.browser) entry.browser = await Browser.launch();
  if (!entry.page) entry.page = await entry.browser.newPage('desktop');
  return entry;
}

async function stopPreview(id: string) {
  const entry = live.get(id);
  if (!entry) return;
  entry.server?.stop();
  await entry.browser?.close().catch(() => {});
  live.delete(id);
  const build = builds.get(id);
  if (build) {
    build.previewOrigin = undefined;
    persist(build);
  }
}

// ponytail: desktop only for now; add 'mobile' here when the merchant wants mobile review.
const REVIEW_VIEWPORTS: Viewport[] = ['desktop'];

async function capture(page: Page, origin: string, path: string): Promise<Shots> {
  const shots: Shots = {};
  for (const viewport of REVIEW_VIEWPORTS) {
    await page.setViewport(viewport);
    await page.goto(`${origin}${path}`);
    await page.settle(600);
    shots[viewport] = await page.screenshot();
  }
  return shots;
}

const workspaceOf = (build: Build): Workspace => ({ id: build.id, root: root(), dir: build.dir, branch: build.branch, base: build.base });

async function execute(build: Build, note?: string) {
  if (!existsSync(build.dir)) {
    const workspace = await createWorkspace(root(), build.id);
    build.base = workspace.base;
    live.set(build.id, { workspace });
  }
  const entry = await ensureLive(build);
  build.status = 'building';
  persist(build);

  const outcome = await runAgent(
    { workspace: entry.workspace, page: entry.page!, origin: entry.server!.origin, log: (event) => (build.events.push(event), persist(build)) },
    build.opportunity,
    { note },
  );
  build.summary = outcome.summary;
  build.reviewPath = outcome.reviewPath.startsWith('/store') ? outcome.reviewPath : '/store';
  const committed = await commitAll(entry.workspace, `Astra: ${build.opportunity.title}${note ? ' (revision)' : ''}`);
  if (!committed && !(await changedFiles(entry.workspace)).length) throw new Error('Astra finished without changing any file.');

  build.status = 'validating';
  persist(build);
  build.checks = await validate(entry.workspace);
  build.changedFiles = await changedFiles(entry.workspace);
  build.diff = (await diff(entry.workspace)).slice(0, 200_000);
  build.screenshots.result = await capture(entry.page!, entry.server!.origin, build.reviewPath);
  build.screenshots.original = await capture(entry.page!, build.liveOrigin, build.reviewPath).catch(() => ({}));

  build.status = 'review';
  persist(build);
}

export async function decide(id: string, decision: Decision, note?: string) {
  const build = builds.get(id);
  if (!build) throw new Error(`Unknown build ${id}.`);
  if (!['review', 'draft', 'failed'].includes(build.status)) throw new Error(`Build is ${build.status}; wait for review.`);
  const workspace = workspaceOf(build);
  switch (decision) {
    case 'publish': {
      if (build.status === 'failed') throw new Error('A failed build cannot be published.');
      if (build.checks.some((check) => !check.ok)) throw new Error('Validation failed; fix it via request_change before publishing.');
      await stopPreview(id);
      build.mergedCommit = await mergeWorkspace(workspace);
      await removeWorkspace(workspace);
      build.status = 'published';
      break;
    }
    case 'reject':
      await stopPreview(id);
      await removeWorkspace(workspace);
      build.status = 'rejected';
      break;
    case 'draft':
      await stopPreview(id);
      build.status = 'draft';
      break;
    case 'request_change': {
      if (!note?.trim()) throw new Error('request_change needs a note.');
      build.notes.push(note.trim());
      build.status = 'building';
      persist(build);
      void execute(build, note.trim()).catch((error) => fail(build, error));
      return build;
    }
  }
  persist(build);
  return build;
}
