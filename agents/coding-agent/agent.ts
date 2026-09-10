// The Astra coding loop: function tools for the workspace plus the computer tool for the browser.
// Verified against developers.openai.com/api/docs/guides/tools-computer-use (2026-09):
// tools: [{ type: 'computer' }], output items `computer_call` with an `actions` array,
// answered by one `computer_call_output` carrying a `computer_screenshot`.
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { ImprovementOpportunity } from '../feedback-agent/synthesize.ts';
import { responsesCreate } from '../shared/openai.ts';
import { strategyContext } from '../shared/strategy.ts';
import { VIEWPORTS, type Page, type Viewport } from './browser.ts';
import {
  BLOCKED_PREFIXES,
  WRITABLE_PREFIXES,
  readWorkspaceFile,
  run,
  writeWorkspaceFile,
  type Workspace,
} from './workspace.ts';

// eslint-disable-next-line typescript/no-explicit-any -- model tool arguments and CDP payloads are untyped JSON
export type Json = Record<string, any>;

export type AgentEvent = { at: string; kind: 'message' | 'tool' | 'browser' | 'error'; text: string };

export type AgentEnv = {
  workspace: Workspace;
  page: Page;
  origin: string;
  log: (event: AgentEvent) => void;
};

export type AgentOutcome = { summary: string; reviewPath: string; turns: number };

const MODEL = 'gpt-6-astra';
const MAX_TURNS = 80;
const TEXT_LIMIT = 6000;
const FILE_LIMIT = 120_000; // whole files: a truncated read followed by write_file would destroy the rest

const fn = (name: string, description: string, properties: Record<string, unknown>) => ({
  type: 'function',
  name,
  description,
  strict: true,
  parameters: { type: 'object', additionalProperties: false, properties, required: Object.keys(properties) },
});

export const TOOLS = [
  { type: 'computer' },
  fn('list_files', 'List files under a workspace directory (recursive, capped).', { dir: { type: 'string' } }),
  fn('read_file', 'Read a whole workspace file.', { path: { type: 'string' } }),
  fn('edit_file', 'Replace one exact occurrence of `find` with `replace` in a file. Prefer this over rewriting whole files.', {
    path: { type: 'string' },
    find: { type: 'string' },
    replace: { type: 'string' },
  }),
  fn('search', 'Search tracked files with git grep (regex).', { pattern: { type: 'string' } }),
  fn('write_file', `Create or overwrite a file. Only ${WRITABLE_PREFIXES.join(' and ')} are writable; ${BLOCKED_PREFIXES.join(' and ')} are refused.`, {
    path: { type: 'string' },
    content: { type: 'string' },
  }),
  fn('run_checks', 'Run npm run typecheck and npm run lint in the workspace.', {}),
  fn('open_page', 'Navigate the browser to a storefront path (desktop viewport by default), then read the page text. Follow with a computer screenshot action to see it.', {
    path: { type: 'string', description: 'Path starting with /store' },
    viewport: { type: 'string', enum: Object.keys(VIEWPORTS) },
  }),
  fn('page_eval', 'Run a JavaScript expression in the open page and return its JSON value (code-execution style checks: query the DOM, click elements, read computed styles).', {
    script: { type: 'string' },
  }),
  fn('finish', 'End the build. Provide the merchant-facing summary and the storefront path that best shows the change.', {
    summary: { type: 'string' },
    reviewPath: { type: 'string' },
  }),
];

export function agentInstructions() {
  return [
    'You are Astra, the coding agent for the Boosted USA demo storefront (Next-style app on vinext, React 19, TypeScript).',
    strategyContext(),
    '',
    'Workflow: inspect the code, implement the improvement, open the affected pages at the desktop viewport, verify with screenshots and page_eval, fix what is wrong, run_checks, then finish.',
    'Desktop only for now: design and verify for the 1280px desktop viewport. Do not spend turns on mobile layouts or the mobile viewport.',
    'The dev server hot-reloads after write_file; re-open the page to see the change.',
    `Only edit files under ${WRITABLE_PREFIXES.join(' and ')}. Never touch ${BLOCKED_PREFIXES.join(' or ')}. Never add dependencies.`,
    'Never submit forms, add to cart, open checkout, purchase, change orders or payments, or deploy. The merchant publishes after review.',
    'Preserve the brand: reuse existing class names and CSS variables in app/store/store.css; keep the layout of untouched areas unchanged.',
    'Do not read data/catalog.json in full (it is very large); use search or read lib/catalog.ts and lib/shop.ts for the data model.',
    'Be decisive and concise. Finish within the turn budget.',
  ].join('\n');
}

export function agentPrompt(opportunity: ImprovementOpportunity, origin: string, note?: string) {
  return [
    `Storefront dev server: ${origin} (the workspace is a git worktree of the live checkout).`,
    'Key files: app/store/[...path]/page.tsx (all /store routes), components/shop-client.tsx (ProductPurchase, cart), components/catalog-view.tsx (product grid), app/store/store.css, app/store/layout.tsx, lib/catalog.ts and lib/shop.ts (read-only data helpers).',
    '',
    `Improvement: ${opportunity.title}`,
    `Underlying problem: ${opportunity.underlyingProblem}`,
    `Opportunity: ${opportunity.opportunity}`,
    'Design direction:',
    ...opportunity.designDirection.map((item) => `- ${item}`),
    'Constraints honored:',
    ...opportunity.constraintsHonored.map((item) => `- ${item}`),
    'Shopper evidence:',
    ...opportunity.evidence.map((item) => `- [${item.feedbackId}, ${item.role}] "${item.quote}"`),
    '',
    'Build brief:',
    opportunity.buildBrief,
    note ? `\nMerchant change request on the previous attempt:\n${note}` : '',
    '',
    'Implement it now.',
  ].join('\n');
}

function listFiles(root: string, dir: string, limit = 200) {
  const out: string[] = [];
  const skip = new Set(['node_modules', '.git', 'work', 'dist', '.vinext', '.wrangler', 'public']);
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      if (skip.has(entry) || out.length >= limit) continue;
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(root, full));
    }
  };
  const start = join(root, dir);
  if (!start.startsWith(root)) throw new Error('dir escapes the workspace');
  walk(start);
  return out.join('\n') + (out.length >= limit ? '\n…(truncated)' : '');
}

const clip = (text: string) => (text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT)}\n…(truncated)` : text);

async function guardLocation(env: AgentEnv) {
  const url = await env.page.url();
  if (url.startsWith(env.origin) && !url.includes('/store/checkout')) return '';
  await env.page.goto(`${env.origin}/store`);
  return `Navigation to ${url} is not allowed; returned to /store.`;
}

export async function callTool(env: AgentEnv, name: string, args: Json): Promise<string> {
  const { workspace, page, origin } = env;
  switch (name) {
    case 'list_files':
      return listFiles(workspace.dir, args.dir || '.');
    case 'read_file': {
      const text = readWorkspaceFile(workspace, args.path);
      return text.length > FILE_LIMIT ? `${text.slice(0, FILE_LIMIT)}\n…(truncated at ${FILE_LIMIT} chars; do not rewrite this file whole, use edit_file)` : text;
    }
    case 'edit_file': {
      const text = readWorkspaceFile(workspace, args.path);
      const count = text.split(args.find).length - 1;
      if (count !== 1) return `Error: \`find\` matches ${count} times in ${args.path}; it must match exactly once.`;
      writeWorkspaceFile(workspace, args.path, text.replace(args.find, () => args.replace));
      return `Edited ${args.path}.`;
    }
    case 'search': {
      const result = await run(workspace.dir, 'git', ['grep', '-n', '-E', '-I', '--', args.pattern], { timeoutMs: 30_000 });
      return clip(result.output || 'No matches.');
    }
    case 'write_file':
      return `Wrote ${writeWorkspaceFile(workspace, args.path, args.content)} (${args.content.length} chars).`;
    case 'run_checks': {
      const lines: string[] = [];
      for (const script of ['typecheck', 'lint']) {
        const result = await run(workspace.dir, 'npm', ['run', '--silent', script], { timeoutMs: 5 * 60_000 });
        lines.push(`npm run ${script}: ${result.ok ? 'ok' : 'FAILED'}\n${result.output.trim()}`);
      }
      return clip(lines.join('\n\n'));
    }
    case 'open_page': {
      const path = String(args.path || '/store');
      if (!path.startsWith('/store') || path.includes('/store/checkout')) return 'Only /store paths (except checkout) can be opened.';
      const viewport: Viewport = args.viewport in VIEWPORTS ? args.viewport : 'desktop';
      await page.setViewport(viewport);
      await page.goto(`${origin}${path}`);
      const text = await page.evaluate<string>('document.body.innerText');
      return clip(`Opened ${path} at ${viewport} (${VIEWPORTS[viewport].width}px). Title: ${await page.evaluate<string>('document.title')}\n\n${text}`);
    }
    case 'page_eval': {
      const value = await page.evaluate(args.script);
      const guard = await guardLocation(env);
      return clip(`${JSON.stringify(value) ?? 'undefined'}${guard ? `\n${guard}` : ''}`);
    }
    default:
      return `Unknown tool ${name}.`;
  }
}

type Action = Json & { type: string };

export async function runActions(env: AgentEnv, actions: Action[]) {
  const { page } = env;
  const notes: string[] = [];
  for (const action of actions) {
    switch (action.type) {
      case 'click':
        await page.click(action.x, action.y, action.button === 'right' ? 'right' : 'left');
        break;
      case 'double_click':
        await page.click(action.x, action.y, 'left', 2);
        break;
      case 'move':
        await page.move(action.x, action.y);
        break;
      case 'scroll':
        await page.scroll(action.x ?? 10, action.y ?? 10, action.scroll_x ?? 0, action.scroll_y ?? 0);
        break;
      case 'type':
        await page.type(String(action.text ?? ''));
        break;
      case 'keypress':
        await page.keypress(Array.isArray(action.keys) ? action.keys : [String(action.keys ?? '')]);
        break;
      case 'wait':
        await page.settle(Math.min(Number(action.ms) || 1000, 5000));
        break;
      case 'drag': {
        const path = Array.isArray(action.path) ? action.path : [];
        if (path.length > 1) {
          await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: path[0].x, y: path[0].y, button: 'left', clickCount: 1 });
          for (const point of path.slice(1)) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y, button: 'left' });
          const last = path[path.length - 1];
          await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: last.x, y: last.y, button: 'left', clickCount: 1 });
        }
        break;
      }
      case 'screenshot':
        break;
      default:
        notes.push(`Unsupported action ${action.type} skipped.`);
    }
    await page.settle(250);
  }
  const guard = await guardLocation(env);
  if (guard) notes.push(guard);
  return { screenshot: await page.screenshot(), notes };
}

const describeActions = (actions: Action[]) =>
  actions.map((action) => `${action.type}${action.x !== undefined ? `(${action.x},${action.y})` : ''}${action.text ? ` "${String(action.text).slice(0, 40)}"` : ''}`).join(', ');

export function pendingCalls(response: Record<string, unknown>) {
  const output = Array.isArray(response.output) ? (response.output as Json[]) : [];
  const messages = output
    .filter((item) => item.type === 'message')
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .filter((part) => typeof part.text === 'string')
    .map((part) => part.text as string);
  const calls = output.filter((item) => item.type === 'function_call' || item.type === 'computer_call');
  return { messages, calls };
}

export async function runAgent(
  env: AgentEnv,
  opportunity: ImprovementOpportunity,
  { note, maxTurns = MAX_TURNS }: { note?: string; maxTurns?: number } = {},
): Promise<AgentOutcome> {
  const log = (kind: AgentEvent['kind'], text: string) => env.log({ at: new Date().toISOString(), kind, text });
  const request = (extra: Record<string, unknown>) =>
    responsesCreate({ model: MODEL, reasoning: { effort: 'medium' }, tools: TOOLS, truncation: 'auto', ...extra });

  let response = await request({ instructions: agentInstructions(), input: agentPrompt(opportunity, env.origin, note) });
  for (let turn = 1; turn <= maxTurns; turn++) {
    const { messages, calls } = pendingCalls(response);
    messages.forEach((text) => log('message', text));
    const input: Record<string, unknown>[] = [];
    let finished: AgentOutcome | undefined;

    for (const call of calls) {
      if (call.type === 'computer_call') {
        const actions: Action[] = call.actions ?? (call.action ? [call.action] : []);
        log('browser', describeActions(actions) || 'screenshot');
        const { screenshot, notes } = await runActions(env, actions);
        input.push({
          type: 'computer_call_output',
          call_id: call.call_id,
          ...(call.pending_safety_checks?.length ? { acknowledged_safety_checks: call.pending_safety_checks } : {}),
          output: { type: 'computer_screenshot', image_url: screenshot, detail: 'original' },
        });
        if (notes.length) input.push({ role: 'user', content: notes.join('\n') });
        continue;
      }
      let args: Json = {};
      try {
        args = JSON.parse(call.arguments || '{}');
      } catch {
        /* treated as empty */
      }
      if (call.name === 'finish') {
        finished = { summary: String(args.summary ?? ''), reviewPath: String(args.reviewPath || '/store'), turns: turn };
        input.push({ type: 'function_call_output', call_id: call.call_id, output: 'Build ended.' });
        continue;
      }
      log('tool', `${call.name} ${JSON.stringify(args).slice(0, 200)}`);
      let output: string;
      try {
        output = await callTool(env, call.name, args);
      } catch (error) {
        output = `Error: ${error instanceof Error ? error.message : String(error)}`;
        log('error', output);
      }
      input.push({ type: 'function_call_output', call_id: call.call_id, output });
    }

    if (finished) {
      log('message', finished.summary);
      return finished;
    }
    const left = maxTurns - turn;
    if (!calls.length) input.push({ role: 'user', content: 'Continue. Call finish when the change is implemented and verified at the desktop viewport.' });
    else if (left <= 8) input.push({ role: 'user', content: `Turn budget: ${left} turns left. Stop auditing, make sure run_checks passes, and call finish with what works.` });
    else if (turn % 10 === 0) input.push({ role: 'user', content: `Turn ${turn} of ${maxTurns}.` });
    // ponytail: on the last turn force finish so the work is still committed and validated.
    response = await request({
      previous_response_id: response.id,
      input,
      ...(left <= 1 ? { tool_choice: { type: 'function', name: 'finish' } } : {}),
    });
  }
  const forced = pendingCalls(response).calls.find((call) => call.type === 'function_call' && call.name === 'finish');
  if (forced) {
    const args = JSON.parse(forced.arguments || '{}') as Json;
    log('message', `Forced finish after ${maxTurns} turns: ${args.summary ?? ''}`);
    return { summary: String(args.summary ?? ''), reviewPath: String(args.reviewPath || '/store'), turns: maxTurns };
  }
  throw new Error(`Astra did not finish within ${maxTurns} turns.`);
}
