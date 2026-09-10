import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const dir = await mkdtemp(join(tmpdir(), 'conversation-check-'));
try {
  for (const [name, path] of [
    ['feedback', '../lib/feedback.ts'],
    ['feedback-conversation', '../lib/feedback-conversation.ts'],
    ['route', '../app/api/feedback/conversation/route.ts'],
  ]) {
    let source = await readFile(new URL(path, import.meta.url), 'utf8');
    source = source
      .replace(
        "import { env } from 'cloudflare:workers';",
        'const env = globalThis.testConversationEnv;',
      )
      .replace("'@/lib/catalog'", "'./catalog.mjs'")
      .replaceAll("'@/lib/feedback'", "'./feedback.mjs'")
      .replaceAll("'./feedback'", "'./feedback.mjs'")
      .replace(
        "'@/lib/feedback-conversation'",
        "'./feedback-conversation.mjs'",
      );
    await writeFile(
      join(dir, name + '.mjs'),
      ts.transpileModule(source, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ES2022,
        },
      }).outputText,
    );
  }
  const raw = JSON.parse(
    await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'),
  );
  await writeFile(
    join(dir, 'catalog.mjs'),
    `export const byHandle=new Map(${JSON.stringify(raw.products.map((p) => [p.handle, p]))});`,
  );
  globalThis.testConversationEnv = {};
  const { POST } = await import(pathToFileURL(join(dir, 'route.mjs')));
  const path = '/store/products/evolve-skateboards-battery-charger-400013-ss20';
  const input = {
    events: [
      {
        id: 'charger',
        path,
        title: 'Evolve Battery Chargers',
        kind: 'page_view',
        at: new Date().toISOString(),
      },
    ],
    cart: [],
    turns: [],
    note: '',
  };
  const call = (body) =>
    POST(
      new Request('http://localhost/api/feedback/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  const initial = await (await call(input)).json();
  assert.equal(initial.source, 'prepared');
  assert.equal(initial.evidence.length, 0);
  assert(initial.question.options.includes('I was just browsing'));
  input.turns.push({
    question: initial.question,
    answer: initial.question.options[0],
  });
  const next = await (await call(input)).json();
  assert.equal(next.evidence[0].path, path);
  assert(next.evidence[0].excerpt.length > 0);
  assert(next.question.prompt.includes('confidence'));
  input.turns.push({
    question: next.question,
    answer: next.question.options[0],
  });
  assert.equal((await (await call(input)).json()).question, null);
  assert.equal((await call({ ...input, focusIds: ['invented'] })).status, 400);
  assert.equal(
    (
      await call({
        ...input,
        turns: [{ question: initial.question, answer: 'invented' }],
      })
    ).status,
    400,
  );
  globalThis.testConversationEnv.OPENAI_API_KEY = 'test-key';
  globalThis.testConversationEnv.OPENAI_FEEDBACK_MODEL = 'test-model';
  const original = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, options) => {
    sent = JSON.parse(options.body);
    return Response.json({
      output: [
        {
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({
                observation: 'The model options use different names.',
                question: null,
                summary: 'I was unsure which charger fit my board.',
              }),
            },
          ],
        },
      ],
    });
  };
  const live = await (await call(input)).json();
  assert.equal(live.source, 'astra');
  assert.equal(live.summary, 'I was unsure which charger fit my board.');
  assert(JSON.parse(sent.input).catalogLookup.length);
  globalThis.fetch = async () => {
    throw Error('offline');
  };
  assert.equal((await (await call(input)).json()).source, 'prepared');
  globalThis.fetch = original;
  console.log(
    'Verified adaptive conversation, catalog evidence, invalid focus/answers, live response parsing, and explicit offline fallback.',
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
