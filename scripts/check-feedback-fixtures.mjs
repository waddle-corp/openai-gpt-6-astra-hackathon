import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  categories,
  isRecordablePath,
  validFeedbackCart,
  validQuestions,
  highlights,
  preparedQuestions,
} from '../lib/feedback.ts';
import { maxQuantity } from '../lib/shop.ts';

const read = async (path) =>
  JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const records = await read('../data/feedback/synthetic-submissions.json');
const catalog = await read('../data/catalog.json');
const expected = await read('../evaluation/feedback/expected-outcomes.json');
const products = new Map(
  catalog.products.map((product) => [product.handle, product]),
);
assert.equal(records.length, 14);
assert.equal(new Set(records.map((record) => record.id)).size, records.length);
assert.deepEqual(
  records.map((record) => record.id),
  expected.cases.map((record) => record.feedbackId),
);
for (const record of records) {
  assert.equal(record.synthetic, true);
  assert.equal(record.demo, true);
  assert.equal(record.schemaVersion, 2);
  assert(categories.includes(record.category));
  assert(validQuestions(record.questions));
  assert(validFeedbackCart(record.cartSnapshot));
  assert.equal(
    record.orderTotalCents,
    record.cartSnapshot.reduce(
      (sum, item) => sum + item.quantity * item.unitPriceCents,
      0,
    ),
  );
  assert.equal(
    Date.parse(record.reviewDueAt) - Date.parse(record.submittedAt),
    72 * 3600000,
  );
  assert(record.completedOrder.completedAt > record.submittedAt);
  assert.deepEqual(record.completedOrder.items, record.cartSnapshot);
  assert(!('expectedGroup' in record) && !('opportunityTreatment' in record));
  for (const question of record.questions)
    assert(question.options.includes(record.answers[question.id]));
  assert(record.journey.some((event) => event.id === record.selectedScreen.id));
  assert(
    highlights(record.journey).some(
      (event) => event.path === record.selectedScreen.path,
    ),
    `${record.id}: selected screen must be surfaced`,
  );
  for (const [index, event] of record.journey.entries()) {
    assert(isRecordablePath(event.path));
    if (index) assert(event.at >= record.journey[index - 1].at);
    if (event.path.includes('/products/'))
      assert(products.has(event.path.split('/').at(-1)));
    if (event.path.includes('/collections/'))
      assert(
        catalog.collections.some(
          (collection) => collection.handle === event.path.split('/').at(-1),
        ),
      );
  }
  for (const item of record.cartSnapshot) {
    const product = products.get(item.productHandle);
    const variant = product.variants.find(
      (variant) => variant.id === item.variantId,
    );
    assert(variant);
    assert.equal(product.title, item.productTitle);
    assert.equal(variant.title, item.variantTitle);
    assert.equal(Math.round(Number(variant.price) * 100), item.unitPriceCents);
    assert(maxQuantity(variant) >= item.quantity);
  }
  const fallback = preparedQuestions(record.category, record.note);
  assert(validQuestions(fallback));
  assert(
    fallback.every((question) => question.options.includes('None of these')),
  );
}
// Catalog-backed facts for the live route and the sold-out control.
const board = products.get('evolve-skateboards-bamboo-gtr-series-2-street');
assert(
  board.variants.some(
    (variant) => variant.title === 'Black' && maxQuantity(variant) > 0,
  ),
);
const charger = products.get('evolve-skateboards-battery-charger-400013-ss20');
assert(charger.descriptionHtml.includes('Only compatible with GTR'));
assert(
  charger.variants.some(
    (variant) =>
      variant.title.includes('GTR Series 1 & 2') && maxQuantity(variant) > 0,
  ),
);
assert.equal(
  maxQuantity(
    products
      .get('boosted-helmets')
      .variants.find((variant) => variant.title.startsWith('L-XL')),
  ),
  0,
);
console.log(
  'Verified 14 synthetic submissions: real catalog variants/prices/stock, chronological paths, highlight coverage, cart totals, answer validity, and isolated evaluation labels. No model classification was evaluated.',
);

// Optional local API smoke test. This tests questions only, not root-cause analysis.
if (process.argv[2]) {
  const base = new URL(process.argv[2]);
  assert(
    ['localhost', '127.0.0.1'].includes(base.hostname),
    'Use a local demo server',
  );
  const sources = {};
  for (const record of records.slice(0, 6)) {
    const response = await fetch(new URL('/api/feedback/questions', base), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: record.category,
        note: record.note,
        selectedScreen: record.selectedScreen,
        journey: record.journey,
        cartSnapshot: record.cartSnapshot,
      }),
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert(validQuestions(result.questions));
    sources[result.source] = (sources[result.source] ?? 0) + 1;
    console.log(
      `${record.id}: ${result.source}; ${result.questions.map((question) => question.id).join(', ')}`,
    );
  }
  console.log('Question API sources:', sources);
}
