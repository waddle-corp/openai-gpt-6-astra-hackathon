import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Exercise the real storage module with browser storage doubles, without a DOM.
const directory = await mkdtemp(join(tmpdir(), 'feedback-check-'));
try {
  for (const name of ['feedback', 'feedback-storage']) {
    const source = await readFile(
      new URL(`../lib/${name}.ts`, import.meta.url),
      'utf8',
    );
    const output = ts
      .transpileModule(source, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ES2022,
        },
      })
      .outputText.replace("'./feedback'", "'./feedback.mjs'");
    await writeFile(join(directory, `${name}.mjs`), output);
  }
  const model = await import(pathToFileURL(join(directory, 'feedback.mjs')));
  const storageDouble = () => {
    const data = new Map();
    return {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => data.set(key, String(value)),
      clear: () => data.clear(),
    };
  };
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: storageDouble(),
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storageDouble(),
  });
  globalThis.window = new EventTarget();
  const storage = await import(
    pathToFileURL(join(directory, 'feedback-storage.mjs'))
  );
  const page = {
    kind: 'page_view',
    path: '/store/products/test-board',
    title: 'Test board',
    image: '/media/test.png',
  };
  storage.recordJourney(page);
  assert.equal(
    storage.getFeedbackState().session.events.length,
    0,
    'Never record before consent',
  );
  storage.setFeedbackConsent('declined');
  storage.recordJourney(page);
  assert.equal(
    storage.getFeedbackState().session.events.length,
    0,
    'Never record after refusal',
  );
  storage.setFeedbackConsent('accepted');
  storage.recordJourney(page);
  storage.recordJourney(page);
  assert.equal(
    storage.getFeedbackState().session.events.length,
    1,
    'Deduplicate repeated render',
  );
  for (const path of [
    '/store/checkout',
    '/admin',
    '/store/search?q=private',
    '/store/account',
  ])
    storage.recordJourney({ ...page, path });
  assert.equal(
    storage.getFeedbackState().session.events.length,
    1,
    'Exclude checkout, admin, and query strings',
  );
  storage.recordJourney({
    ...page,
    kind: 'cart_added',
    detail: 'Black · quantity 1',
  });
  assert.equal(
    model.highlights(storage.getFeedbackState().session.events).length,
    1,
  );
  const questions = model.preparedQuestions('Comparing products');
  assert(model.validQuestions(questions));
  assert(
    !model.validQuestions([{ ...questions[0], options: ['Same', 'Same'] }]),
  );
  storage.updateFeedbackDraft({
    selected: storage.getFeedbackState().session.events[0],
    category: 'Comparing products',
    questions,
    answers: {
      cause: questions[0].options[0],
      impact: questions[1].options[1],
    },
    reward: 'card_cashback',
    step: 'review',
  });
  const reloaded = await import(
    `${pathToFileURL(join(directory, 'feedback-storage.mjs'))}?reload`
  );
  assert.equal(
    reloaded.getFeedbackState().session.draft.step,
    'review',
    'Draft survives navigation',
  );
  const realSet = localStorage.setItem.bind(localStorage);
  localStorage.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  assert.throws(() => storage.submitFeedback(6000));
  assert.equal(
    storage.getFeedbackState().session.receipt,
    undefined,
    'No false success on storage failure',
  );
  localStorage.setItem = realSet;
  const receipt = storage.submitFeedback(6000);
  assert.equal(
    Date.parse(receipt.reviewDueAt) - Date.parse(receipt.submittedAt),
    72 * 3600000,
  );
  assert.equal(receipt.rewardPreference, 'card_cashback');
  assert.equal(
    storage.submitFeedback(6000).id,
    receipt.id,
    'Submitting twice is idempotent',
  );
  assert.equal(storage.readFeedbackSubmissions().length, 1);
  storage.linkFeedbackOrder('DEMO-123');
  assert.equal(storage.readFeedbackSubmissions()[0].orderReference, 'DEMO-123');
  storage.resetFeedbackSession();
  assert.equal(storage.getFeedbackState().session.events.length, 0);
  assert.equal(
    storage.readFeedbackSubmissions().length,
    1,
    'Restart preserves merchant submissions',
  );
  storage.setFeedbackConsent('accepted');
  storage.recordJourney(page);
  storage.setFeedbackConsent('declined');
  assert.equal(
    storage.getFeedbackState().session.events.length,
    0,
    'Withdrawal removes unsubmitted journey',
  );
  console.log(
    'Verified consent boundaries, journey deduplication, question validation, draft persistence, storage failure, submission idempotency, 72-hour review, order linking, and session restart.',
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
