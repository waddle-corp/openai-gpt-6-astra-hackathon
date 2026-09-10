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
console.log(
  'OK AOV scope: 14 of 33 signals, original evidence preserved, linked replays, all signals retained with unrelated and set-aside records unselected',
);
