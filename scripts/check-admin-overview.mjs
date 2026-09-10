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
assert.ok(
  records.every(
    (record) =>
      record.shortId ===
      original.find((item) => item.feedback.id === record.feedback.id).shortId,
  ),
);
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
  assert.ok(
    records.some((record) => record.feedback.id === id && record.strategyMatch),
  );
for (const id of ['shopper-feedback-015', 'shopper-feedback-008', 'SYN-FB-04'])
  assert.ok(
    records.some(
      (record) => record.feedback.id === id && !record.strategyMatch,
    ),
  );
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
  assert.ok(
    known.has(payout.feedbackId),
    `payout cites unknown ${payout.feedbackId}`,
  );
  assert.ok(
    /^SIG-\d{4}$/.test(payout.shortId),
    `payout ${payout.feedbackId} lost its signal id`,
  );
  assert.ok(
    payout.shopper && payout.rationale,
    `payout ${payout.feedbackId} is missing display fields`,
  );
}
const amounts = ledger.contributions.map((payout) => payout.bountyCents);
assert.equal(
  new Set(ledger.contributions.map((payout) => payout.shopper)).size,
  ledger.contributions.length,
  'two payouts share a shopper name',
);
// The merchant can move the budget in the modal; the same weights must still spend it exactly.
for (const pool of [50000, 12345, 101]) {
  const cents = allocate(
    ledger.contributions.map((payout) => payout.weight),
    pool,
  );
  assert.equal(
    cents.reduce((sum, value) => sum + value, 0),
    pool,
    `budget ${pool} did not add up`,
  );
}
assert.deepEqual(
  amounts,
  ledger.contributions
    .map((payout) => payout.bountyCents)
    .sort((a, b) => b - a),
  'the payout list is not ordered by amount',
);

console.log(
  `OK AOV scope: 14 of 33 signals, original evidence preserved, linked replays, all signals retained with unrelated and set-aside records unselected; ${ledger.contributions.length} payouts totalling ${ledger.poolCents} cents`,
);

const { analysisSchedule, analysisProgress, DEMO_ANALYSIS_MS } =
  await import('../lib/demo-analysis.ts');
const replayIds = records
  .filter((record) => record.strategyMatch)
  .map((record) => record.feedback.id);
const deadlines = analysisSchedule(replayIds, () => 0.25);
assert.equal(Object.keys(deadlines).length, replayIds.length);
assert.deepEqual(new Set(Object.keys(deadlines)), new Set(replayIds));
assert.notDeepEqual(Object.keys(deadlines), replayIds);
const waves = [...new Set(Object.values(deadlines))].sort((a, b) => a - b);
assert.equal(waves.at(-1), DEMO_ANALYSIS_MS);
for (let i = 1; i < waves.length; i++)
  assert(waves[i] - waves[i - 1] >= 1000 && waves[i] - waves[i - 1] <= 2000);
for (const deadline of Object.values(deadlines)) {
  assert.equal(analysisProgress(0, deadline), 0);
  assert(analysisProgress(deadline - 1, deadline) < 100);
  assert.equal(analysisProgress(deadline, deadline), 100);
  assert.equal(analysisProgress(9000, deadline), 100);
}
assert.deepEqual(analysisSchedule([]), {});
assert.equal(analysisProgress(0), 0);
assert.deepEqual(analysisSchedule(['only']), { only: DEMO_ANALYSIS_MS });
console.log(
  'OK demo analysis: randomized completion waves, 1–2 second spacing, six-second completion, and restart progress reset',
);

for (const record of records.filter((item) => item.strategyMatch)) {
  assert.equal(record.analysis?.source, 'cached');
  assert(record.analysis.title && record.analysis.problem);
  assert(record.analysis.generatedAt);
}
console.log(
  'OK completed journey feed uses saved findings with explicit provenance',
);

const { demoFlowAt, DEMO_FLOW_MS, DEMO_PREVIEWS_MS } =
  await import('../lib/demo-analysis.ts');
assert.equal(demoFlowAt(0, 33).signalCount, 25);
assert.equal(demoFlowAt(1000, 33).signalCount, 29);
assert.equal(demoFlowAt(2000, 33).signalCount, 33);
assert.equal(demoFlowAt(2499, 33).analysisStarted, false);
assert.equal(demoFlowAt(2500, 33).analysisStarted, true);
assert.equal(demoFlowAt(8500, 33).analysisElapsed, 6000);
assert.equal(demoFlowAt(8999, 33).generating, false);
assert.equal(demoFlowAt(9000, 33).generating, true);
assert.equal(DEMO_PREVIEWS_MS, 11000);
assert.equal(DEMO_FLOW_MS, 13000);
assert.equal(demoFlowAt(10999, 33).previewsReady, false);
assert.equal(demoFlowAt(DEMO_PREVIEWS_MS, 33).previewsReady, true);
assert.equal(demoFlowAt(DEMO_PREVIEWS_MS, 33).generating, false);
assert.equal(demoFlowAt(10999, 33).rewarding, false);
assert.equal(demoFlowAt(DEMO_PREVIEWS_MS, 33).rewarding, true);
assert.equal(demoFlowAt(DEMO_FLOW_MS - 1, 33).rewardsReady, false);
assert.equal(demoFlowAt(DEMO_FLOW_MS, 33).rewarding, false);
assert.equal(demoFlowAt(DEMO_FLOW_MS, 33).rewardsReady, true);
assert.equal(demoFlowAt(0, 5).signalCount, 5);
for (const [start, field] of [
  [0, 'signalFocus'],
  [2500, 'analysisFocus'],
  [9000, 'improvementFocus'],
  [11000, 'rewardFocus'],
]) {
  assert.equal(demoFlowAt(start, 33)[field], true);
  assert.equal(demoFlowAt(start + 999, 33)[field], true);
  assert.equal(demoFlowAt(start + 1000, 33)[field], false);
}
console.log(
  'OK page demo: sequential 2s improvement and reward loading, reveals 2s apart, 1s stage focus',
);
