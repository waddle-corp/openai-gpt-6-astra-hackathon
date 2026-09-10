import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertFeedbackRecord,
  parseFeedbackRecords,
} from '../contracts/feedback.ts';
const read = async (path) =>
  JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const shopper = parseFeedbackRecords(
  await read('../data/shopper-feedback.json'),
);
const compatibility = parseFeedbackRecords(
  await read('../data/feedback/synthetic-submissions.json'),
);
assert.equal(shopper.length, 20);
assert.equal(compatibility.length, 14);
parseFeedbackRecords([...shopper, ...compatibility]);
for (const record of shopper) {
  assert.equal(record.context.cart, null);
  assert.equal(record.purchase.status, 'unknown');
  assert.equal(record.rewardPreference, null);
  assert.equal(
    record.feedback.category,
    null,
    'Author topic is not a customer-selected category',
  );
  assert(record.journey.events.every((event) => event.occurredAt === null));
}
assert(
  shopper.some((record) =>
    record.journey.events.some((event) => event.type === 'drag'),
  ),
);
assert(
  shopper.some((record) =>
    record.journey.events.some((event) => event.type === 'type' && event.value),
  ),
);
const labels = await read('../evaluation/feedback/shopper-labels.json');
assert.deepEqual(
  shopper.map((record) => record.id),
  labels.cases.map((record) => record.feedbackId),
);
const example = compatibility[0];
const reject = (change) => {
  const record = structuredClone(example);
  change(record);
  assert.throws(() => assertFeedbackRecord(record));
};
reject((record) => {
  record.topic = 'compatibility';
});
reject((record) => {
  record.feedback.priority = 'high';
});
reject((record) => {
  record.contractVersion = '2.0';
});
reject((record) => {
  record.context.cart.totalCents += 1;
});
reject((record) => {
  record.context.cart.items[0].quantity = -1;
});
reject((record) => {
  record.journey.evidence = 'demo_recording';
});
reject((record) => {
  record.journey.events[0].sequence = 0;
});
reject((record) => {
  record.journey.events[0].path = 'https://example.com';
});
reject((record) => {
  record.feedback.responses[0].answer = 'Invented answer';
});
reject((record) => {
  record.purchase.status = 'unknown';
});
reject((record) => {
  record.createdAt = 'yesterday';
});
assert.throws(() => parseFeedbackRecords([example, example]));
console.log(
  'Validated shared contract across 34 records, evidence provenance, null handling, label separation, and invalid-input rejection.',
);
