import assert from 'node:assert/strict';
import { register } from 'node:module';
const root = new URL('../', import.meta.url).href;
register(
  `data:text/javascript,${encodeURIComponent(`
import { readFile } from 'node:fs/promises';
export function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) specifier = new URL(specifier.slice(2) + (specifier.endsWith('.json') ? '' : '.ts'), ${JSON.stringify(root)}).href;
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url.endsWith('.json')) return { format: 'module', source: 'export default ' + await readFile(new URL(url), 'utf8'), shortCircuit: true };
  return next(url, context);
}`)}`,
  import.meta.url,
);
const { getAdminOverviewRecords, getStrategyOverview } =
  await import('../lib/admin-overview-data.ts');
const original = getAdminOverviewRecords();
const { records, totalSignals } = getStrategyOverview();
assert.equal(totalSignals, 33);
assert.equal(new Set(records.map((record) => record.shortId)).size, 33);
assert.ok(records.every((record) => /^SIG-\d{4}$/.test(record.shortId)));
assert.ok(records.every((record) => record.shortId === original.find((item) => item.feedback.id === record.feedback.id).shortId));
assert.equal(records.length, 33);
assert.equal(records.filter((record) => record.strategyMatch).length, 14);
assert.equal(new Set(records.map((record) => record.feedback.id)).size, 33);
for (const record of records) {
  assert.deepEqual(
    record.feedback,
    original.find((item) => item.feedback.id === record.feedback.id).feedback,
  );
  assert.ok(record.replayUrl);
}
for (const id of [
  'shopper-feedback-001',
  'shopper-feedback-003',
  'shopper-feedback-019',
])
  assert.ok(records.some((record) => record.feedback.id === id && record.strategyMatch));
for (const id of [
  'shopper-feedback-015',
  'shopper-feedback-008',
  'SYN-FB-04',
])
  assert.ok(records.some((record) => record.feedback.id === id && !record.strategyMatch));
assert.ok(!records.some((record) => record.feedback.id === 'SYN-FB-01'));
// The payout modal shows the ledger as money, so it must add up and name known shoppers.
const { getRewardLedger } = await import('../lib/admin-overview-data.ts');
const { allocate } = await import('../lib/allocate.ts');
const ledger = getRewardLedger();
const known = new Set(records.map((record) => record.feedback.id));
assert.equal(
  ledger.contributions.reduce((sum, payout) => sum + payout.bountyCents, 0),
  ledger.poolCents,
  'reward payouts do not add up to the bounty budget',
);
for (const payout of ledger.contributions) {
  assert.ok(known.has(payout.feedbackId), `payout cites unknown ${payout.feedbackId}`);
  assert.ok(/^SIG-\d{4}$/.test(payout.shortId), `payout ${payout.feedbackId} lost its signal id`);
  assert.ok(payout.shopper && payout.rationale, `payout ${payout.feedbackId} is missing display fields`);
}
const amounts = ledger.contributions.map((payout) => payout.bountyCents);
assert.equal(
  new Set(ledger.contributions.map((payout) => payout.shopper)).size,
  ledger.contributions.length,
  'two payouts share a shopper name',
);
// The merchant can move the budget in the modal; the same weights must still spend it exactly.
for (const pool of [50000, 12345, 101]) {
  const cents = allocate(ledger.contributions.map((payout) => payout.weight), pool);
  assert.equal(cents.reduce((sum, value) => sum + value, 0), pool, `budget ${pool} did not add up`);
}
assert.deepEqual(
  amounts,
  ledger.contributions.map((payout) => payout.bountyCents).sort((a, b) => b - a),
  'the payout list is not ordered by amount',
);

console.log(
  `OK AOV scope: 14 of 33 signals, original evidence preserved, linked replays, all signals retained with unrelated and set-aside records unselected; ${ledger.contributions.length} payouts totalling ${ledger.poolCents} cents`,
);
