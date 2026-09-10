import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Exercise the real storage module with browser storage doubles, without a DOM.
const directory = await mkdtemp(join(tmpdir(), 'feedback-check-'));
try {
  for (const name of [
    'feedback',
    'feedback-contract',
    'feedback-adapters',
    'feedback-storage',
  ]) {
    const source = await readFile(
      new URL(
        name === 'feedback-contract'
          ? '../contracts/feedback.ts'
          : `../lib/${name}.ts`,
        import.meta.url,
      ),
      'utf8',
    );
    const output = ts
      .transpileModule(source, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ES2022,
        },
      })
      .outputText.replace("'./feedback'", "'./feedback.mjs'")
      .replace("'../contracts/feedback.ts'", "'./feedback-contract.mjs'")
      .replace("'./feedback-adapters.ts'", "'./feedback-adapters.mjs'");
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
  const cart = [
    {
      variantId: 'variant-1',
      productHandle: 'test-board',
      productTitle: 'Test board',
      variantTitle: 'Black',
      quantity: 1,
      unitPriceCents: 6000,
    },
  ];
  const questions = model.preparedQuestions('Comparing products');
  assert(model.validQuestions(questions));
  assert.equal(
    model.preparedQuestions(
      'Understanding details',
      'I do not know my friend’s board model.',
    )[0].id,
    'model_check',
  );
  assert.equal(
    model.preparedQuestions(
      'Choosing an option',
      'My gear was changed; 32T or 38T?',
    ).length,
    1,
  );
  assert.equal(
    model.preparedQuestions(
      'Finding a product',
      'I searched for a Stealth charger.',
    )[0].id,
    'search_stage',
  );
  assert.equal(
    model.preparedQuestions(
      'Understanding details',
      'The label says Gen 2 and V2.',
    )[0].id,
    'terminology',
  );
  const fitQuestions = model.preparedQuestions(
    'Understanding details',
    'I was unsure which charger would fit my board.',
  );
  assert.equal(fitQuestions[0].id, 'purchase_barrier');
  assert(
    fitQuestions[0].options.includes('The price'),
    'Offer a competing explanation',
  );
  assert(
    fitQuestions[1].options.includes('Still leave it out'),
    'Do not assume recovered revenue',
  );

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
  assert.throws(() => storage.submitFeedback(6000, cart));
  assert.equal(
    storage.getFeedbackState().session.receipt,
    undefined,
    'No false success on storage failure',
  );
  localStorage.setItem = realSet;
  assert.throws(
    () => storage.submitFeedback(5999, cart),
    'Reject mismatched totals',
  );
  const eventIds = storage
    .getFeedbackState()
    .session.events.map((event) => event.id);
  storage.updateFeedbackDraft({
    focus: 'specific_moments',
    selectedIds: ['missing'],
  });
  assert.throws(() => storage.submitFeedback(6000, cart));
  storage.updateFeedbackDraft({ selectedIds: eventIds });
  const receipt = storage.submitFeedback(6000, cart);
  assert.deepEqual(
    storage.readFeedbackSubmissions()[0].context.focus.eventIds,
    eventIds,
  );
  const journey = storage.getFeedbackState().session.events;
  assert.equal(model.journeyMoments(journey).length, 1);
  assert.equal(model.journeyMoments(journey)[0].label, 'Added to your cart');
  assert.equal(
    model.journeyMoments([
      ...journey,
      { ...journey[0], id: 'other', path: '/store/cart' },
      { ...journey[0], id: 'return' },
    ]).length,
    3,
  );

  assert.equal(
    Date.parse(receipt.reviewDueAt) - Date.parse(receipt.submittedAt),
    72 * 3600000,
  );
  assert.equal(receipt.rewardPreference, 'card_cashback');
  assert.equal(
    storage.submitFeedback(6000, cart).id,
    receipt.id,
    'Submitting twice is idempotent',
  );
  assert.equal(storage.readFeedbackSubmissions().length, 1);
  localStorage.setItem(
    model.FEEDBACK_SUBMISSIONS_KEY,
    JSON.stringify([receipt]),
  );
  assert.equal(
    storage.readFeedbackSubmissions()[0].contractVersion,
    '1.1',
    'Migrate legacy local records',
  );
  assert.equal(
    JSON.parse(localStorage.getItem(model.FEEDBACK_SUBMISSIONS_KEY))[0]
      .contractVersion,
    '1.1',
  );
  storage.linkFeedbackOrder('DEMO-123', [{ ...cart[0], quantity: 2 }]);
  assert.equal(
    storage.readFeedbackSubmissions()[0].purchase.cart.totalCents,
    12000,
  );
  assert.equal(
    storage.readFeedbackSubmissions()[0].context.cart.items[0].quantity,
    1,
    'Keep original feedback cart separate from final order',
  );
  assert.equal(
    storage.readFeedbackSubmissions()[0].purchase.orderReference,
    'DEMO-123',
  );
  storage.resetFeedbackSession();
  assert.equal(storage.getFeedbackState().session.events.length, 0);
  assert.equal(
    storage.readFeedbackSubmissions().length,
    1,
    'Restart preserves merchant submissions',
  );
  storage.setFeedbackConsent('accepted');
  storage.updateFeedbackDraft({
    focus: 'overall',
    category: 'Comparing products',
    questions,
    answers: {
      cause: questions[0].options[0],
      impact: questions[1].options[1],
    },
    reward: 'coupon',
    step: 'review',
  });
  const overall = storage.submitFeedback(6000, cart);
  assert.equal(overall.selectedScreen, null);
  assert.deepEqual(storage.readFeedbackSubmissions().at(-1).context.focus, {
    scope: 'overall',
    eventIds: [],
  });
  storage.resetFeedbackSession();
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
