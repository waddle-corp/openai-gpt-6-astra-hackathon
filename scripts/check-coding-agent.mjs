import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { feedbackFixtures } from '../agents/feedback-agent/fixtures.ts';
import { agentPrompt, pendingCalls, runActions, TOOLS } from '../agents/coding-agent/agent.ts';
import { Browser } from '../agents/coding-agent/browser.ts';
import { sampleOpportunity } from '../agents/coding-agent/fixtures.ts';
import {
  changedFiles,
  commitAll,
  createWorkspace,
  mergeWorkspace,
  readWorkspaceFile,
  removeWorkspace,
  writeWorkspaceFile,
} from '../agents/coding-agent/workspace.ts';

// Fixture evidence is real and verbatim
const byId = new Map(feedbackFixtures.map((record) => [record.id, record]));
for (const item of sampleOpportunity.evidence) {
  const record = byId.get(item.feedbackId);
  assert(record, `${item.feedbackId} is not in data/shopper-feedback.json`);
  // FeedbackRecord v1.0 moved the shopper's words under `feedback`.
  assert(record.feedback.message.includes(item.quote), `${item.feedbackId} quote is not verbatim`);
}

// Prompt and tool contract
const prompt = agentPrompt(sampleOpportunity, 'http://localhost:3200', 'Make the cards larger.');
assert(prompt.includes(sampleOpportunity.title) && prompt.includes(sampleOpportunity.buildBrief));
assert(prompt.includes('Make the cards larger.'));
assert(TOOLS.some((tool) => tool.type === 'computer'));
for (const tool of TOOLS.filter((tool) => tool.type === 'function')) {
  assert(tool.strict && tool.parameters.additionalProperties === false, `${tool.name} must be strict`);
  assert.deepEqual(tool.parameters.required, Object.keys(tool.parameters.properties), `${tool.name} required keys`);
}
assert(TOOLS.some((tool) => tool.name === 'finish'));

const parsed = pendingCalls({
  output: [
    { type: 'reasoning', summary: [] },
    { type: 'message', content: [{ type: 'output_text', text: 'Looking at the product page.' }] },
    { type: 'function_call', call_id: 'c1', name: 'read_file', arguments: '{"path":"lib/shop.ts"}' },
    { type: 'computer_call', call_id: 'c2', actions: [{ type: 'screenshot' }] },
  ],
});
assert.deepEqual(parsed.messages, ['Looking at the product page.']);
assert.equal(parsed.calls.length, 2);

// Computer actions map onto the page and never leave the workspace origin
const calls = [];
let location = 'http://localhost:3200/store';
const fakePage = {
  click: (...args) => calls.push(['click', ...args]),
  move: (...args) => calls.push(['move', ...args]),
  scroll: (...args) => calls.push(['scroll', ...args]),
  type: (text) => calls.push(['type', text]),
  keypress: (keys) => calls.push(['keypress', keys]),
  send: () => {},
  settle: async () => {},
  screenshot: async () => 'data:image/png;base64,AAAA',
  url: async () => location,
  goto: async (url) => {
    calls.push(['goto', url]);
    location = url;
  },
};
const env = { workspace: null, page: fakePage, origin: 'http://localhost:3200', log: () => {} };
let result = await runActions(env, [
  { type: 'click', x: 10, y: 20, button: 'left' },
  { type: 'scroll', x: 5, y: 5, scroll_x: 0, scroll_y: 400 },
  { type: 'type', text: 'hello' },
  { type: 'keypress', keys: ['ENTER'] },
  { type: 'screenshot' },
]);
assert.equal(result.screenshot, 'data:image/png;base64,AAAA');
assert.deepEqual(calls.map((call) => call[0]), ['click', 'scroll', 'type', 'keypress']);
assert.deepEqual(result.notes, []);
location = 'http://localhost:3200/store/checkout';
result = await runActions(env, [{ type: 'click', x: 1, y: 1 }]);
assert.equal(result.notes.length, 1);
assert.equal(location, 'http://localhost:3200/store');
location = 'https://shop.example.com/pay';
result = await runActions(env, [{ type: 'wait' }]);
assert.equal(result.notes.length, 1);
assert.equal(location, 'http://localhost:3200/store');

// Workspace: worktree, write guard, commit, merge, cleanup (in a throwaway repo)
const root = mkdtempSync(join(tmpdir(), 'astra-repo-'));
const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' }).toString().trim();
git('init', '-q', '-b', 'main');
git('config', 'user.email', 'astra@example.com');
git('config', 'user.name', 'Astra Check');
mkdirSync(join(root, 'app', 'store'), { recursive: true });
mkdirSync(join(root, 'app', 'admin'), { recursive: true });
writeFileSync(join(root, 'app', 'store', 'page.tsx'), 'export default () => null;\n');
writeFileSync(join(root, 'app', 'admin', 'page.tsx'), 'export default () => null;\n');
writeFileSync(join(root, '.gitignore'), '/work/\n');
git('add', '-A');
git('commit', '-q', '-m', 'init');
const workspace = await createWorkspace(root, 'check-build');
assert(existsSync(join(root, 'work', 'check-build', 'app', 'store', 'page.tsx')));
assert(git('branch', '--list', 'astra/check-build').includes('astra/check-build'));
assert.equal(readWorkspaceFile(workspace, 'app/store/page.tsx'), 'export default () => null;\n');
writeWorkspaceFile(workspace, 'app/store/page.tsx', 'export default () => "changed";\n');
writeWorkspaceFile(workspace, 'components/compatibility.tsx', 'export const x = 1;\n');
for (const path of ['app/admin/page.tsx', 'components/ui/button.tsx', 'lib/shop.ts', '../outside.ts', 'package.json']) {
  assert.throws(() => writeWorkspaceFile(workspace, path, 'nope'), `${path} must be refused`);
}
assert.equal(git('status', '--porcelain'), '', 'the live checkout must stay clean while the agent edits');
assert.equal(await commitAll(workspace, 'Astra: check'), true);
assert.equal(await commitAll(workspace, 'Astra: nothing'), false);
assert.deepEqual(await changedFiles(workspace), ['app/store/page.tsx', 'components/compatibility.tsx']);
assert(await mergeWorkspace(workspace));
assert.equal(git('show', 'HEAD:app/store/page.tsx'), 'export default () => "changed";');
assert.equal(git('show', 'HEAD:app/admin/page.tsx'), 'export default () => null;');
await removeWorkspace(workspace);
assert(!existsSync(join(root, 'work', 'check-build')));
assert.equal(git('branch', '--list', 'astra/check-build'), '');
rmSync(root, { recursive: true, force: true });

// Browser: headless Chrome over CDP, skipped when no Chrome is installed
let browserNote = 'browser skipped (no Chrome)';
try {
  const browser = await Browser.launch();
  try {
    const page = await browser.newPage('mobile');
    await page.goto('data:text/html,<meta name=viewport content=width=device-width><h1>astra</h1><p>ok</p>');
    assert.equal(await page.evaluate('document.querySelector("h1").textContent'), 'astra');
    assert.equal(await page.evaluate('innerWidth'), 390);
    assert((await page.screenshot()).startsWith('data:image/png;base64,'));
    browserNote = 'browser ok';
  } finally {
    await browser.close();
  }
} catch (error) {
  if (!/No Chrome/.test(error.message)) throw error;
}

console.log(`Coding-agent self-check passed: ${TOOLS.length} tools, workspace guard ok, ${browserNote}.`);
