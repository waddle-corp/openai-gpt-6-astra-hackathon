import assert from 'node:assert/strict';
import { register } from 'node:module';
import { initialState } from '../lib/feedback.ts';

// Node needs the extension that the app's TypeScript bundler resolves itself.
register(
  `data:text/javascript,${encodeURIComponent("export function resolve(specifier, context, next) { return next(specifier === './agent-run' ? './agent-run.ts' : specifier, context); }")}`,
  import.meta.url,
);
const { projectFleet } = await import('../lib/agent-fleet.ts');
const input = structuredClone(initialState.feedback);
const fleet = projectFleet(input, 28000);
assert.deepEqual(
  fleet,
  projectFleet(input, 28000),
  'A timestamp must reproduce the same scene.',
);
assert.deepEqual(
  input,
  initialState.feedback,
  'Projection must not mutate feedback.',
);
assert.equal(fleet.feedback, input);
assert.equal(
  fleet.runs.length,
  3,
  'Related delivery reports belong to one run.',
);
assert.equal(fleet.workers.length, 12);
assert.deepEqual(
  fleet.runs.map((entry) => entry.offsetMs),
  [0, 12000, 24000],
);
assert.equal(new Set(fleet.workers.map((worker) => worker.id)).size, 12);
assert.equal(
  fleet.workers.filter((worker) => worker.status === 'running').length,
  3,
);
assert(
  fleet.workers.every(
    (worker) =>
      worker.source === 'sample' &&
      worker.progress >= 0 &&
      worker.progress <= 1,
  ),
);
assert.equal(fleet.runs[0].snapshot.reward.status, 'paid');
const beforeReward = projectFleet(input, 16000);
assert.equal(beforeReward.runs[0].snapshot.event.stage, 'propose');
assert.equal(
  beforeReward.runs[0].snapshot.reward,
  undefined,
  'Do not reveal a future reward.',
);
assert(
  beforeReward.runs
    .slice(1)
    .every(
      (entry) =>
        !entry.snapshot.finding &&
        !entry.snapshot.proposal &&
        !entry.snapshot.reward,
    ),
);
const starting = projectFleet(input, 0);
assert(
  starting.runs
    .slice(1)
    .every((entry) => entry.index === -1 && entry.snapshot.event === undefined),
);
assert(starting.workers.every((worker) => worker.status === 'queued'));
assert(
  projectFleet(input, 8000)
    .workers.filter((worker) => worker.runId === 'sample-delivery-v1')
    .every((worker) => worker.status === 'completed'),
  'Delivery tasks stop when reproduction completes, before diagnosis.',
);
const blockedVariant = projectFleet(input, 32000).workers.filter(
  (worker) => worker.feedbackId === 'F-006',
);
assert.equal(blockedVariant.length, 3);
assert(
  blockedVariant.every((worker) => worker.status === 'blocked'),
  'A blocked reproduction cannot leave browser tasks running.',
);
const rewarded = projectFleet(input, 28000);
assert.equal(rewarded.runs.filter((entry) => entry.snapshot.reward).length, 1);
assert.equal(
  rewarded.runs.reduce(
    (cents, entry) => cents + (entry.snapshot.reward?.poolCents || 0),
    0,
  ),
  64000,
);
assert.deepEqual(
  projectFleet(input, 28000 + fleet.cycleMs),
  fleet,
  'The illustration loops on stable identifiers.',
);
for (const worker of fleet.workers) {
  const report = input.find((item) => item.id === worker.feedbackId);
  assert(report.moments.some((moment) => moment.route === worker.route));
  if (worker.referenceImage)
    assert(
      report.moments.some((moment) => moment.image === worker.referenceImage),
    );
}
assert(
  fleet.workers
    .filter((worker) => worker.feedbackId === 'F-008')
    .every((worker) => !worker.referenceImage),
);
const shopper = { ...input[0], id: 'new-shopper', sample: false };
const liveInput = [shopper, ...input];
const withPending = projectFleet(liveInput, 28000);
assert.equal(withPending.feedback[0], shopper);
assert.equal(withPending.workers.length, 12);
assert.deepEqual(
  withPending.runs
    .filter((entry) => entry.run.source === 'sample')
    .map((entry) => entry.offsetMs),
  [0, 12000, 24000],
);
assert(withPending.workers.every((worker) => worker.feedbackId !== shopper.id));
const pending = withPending.runs.find(
  (entry) => entry.run.source === 'pending',
);
assert.equal(pending.snapshot.event.status, 'blocked');
assert.equal(pending.snapshot.finding, undefined);
assert.equal(pending.snapshot.proposal, undefined);
assert.equal(pending.snapshot.reward, undefined);
assert.deepEqual(
  projectFleet(liveInput, 999999).runs.find(
    (entry) => entry.run.source === 'pending',
  ),
  pending,
  'Real submissions never simulate progress or loop.',
);
const expanded = projectFleet(
  [...input, { ...input[2], id: 'another-sample', group: 'another-issue' }],
  28000,
);
assert.deepEqual(
  expanded.runs.map((entry) => entry.offsetMs),
  [0, 9000, 18000, 27000],
  'Unique sample runs are evenly spaced for any fleet size.',
);
assert.deepEqual(projectFleet([], 0), {
  feedback: [],
  runs: [],
  workers: [],
  cycleMs: 36000,
});
assert.throws(() => projectFleet(input, -1));
assert.throws(() => projectFleet(input, NaN));
console.log(
  'OK deterministic fleet, staggered parallel sample tasks, no future outputs, one shared reward and unchanged pending submissions',
);
