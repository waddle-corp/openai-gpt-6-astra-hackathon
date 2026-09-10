import assert from 'node:assert/strict';
import { initialState } from '../lib/feedback.ts';
import {
  STAGES,
  appendEvent,
  buildSampleRun,
  decodeAgentEvent,
  projectEvent,
} from '../lib/agent-run.ts';

const original = structuredClone(initialState);
const run = buildSampleRun(initialState.feedback[0], initialState.feedback);
assert.equal(run.source, 'sample');
assert.equal(run.feedback.length, 2);
assert.deepEqual(
  [...new Set(run.events.map((event) => event.stage))],
  STAGES.map((stage) => stage.id),
);
assert.deepEqual(
  initialState,
  original,
  'The viewer must not mutate feedback or business state.',
);
let events = [];
for (const event of run.events) events = appendEvent(events, event);
assert.deepEqual(events, run.events);
assert.equal(
  appendEvent(events, events[0]),
  events,
  'An identical retry is idempotent.',
);
assert.throws(() =>
  appendEvent(events, { ...events[0], title: 'A conflicting retry' }),
);
assert.throws(() =>
  appendEvent(events, { ...events.at(-1), runId: 'another-run' }),
);
assert.throws(
  () => appendEvent([events[0], events[2]], events[1]),
  /Out-of-order/,
);
assert.throws(() => appendEvent([events[1]], { ...events[2], elapsedMs: 0 }));
assert.throws(() => projectEvent([events[2], events[1]], 1));
assert.throws(() =>
  projectEvent([events[0], { ...events[1], runId: 'other' }], 1),
);

const beforeStart = projectEvent(events, -1);
assert.equal(beforeStart.event, undefined);
assert.equal(beforeStart.reward, undefined);
assert.equal(projectEvent([], 0).event, undefined);
const received = projectEvent(events, 0);
assert.equal(received.artifact, undefined);
assert.equal(received.finding, undefined);
assert.equal(received.proposal, undefined);
assert.equal(received.reward, undefined);
const investigating = projectEvent(events, 1);
assert.equal(investigating.artifact.kind, 'reference');
assert.match(investigating.artifact.caption, /not a live browser capture/);
assert.equal(investigating.finding, undefined);
assert.equal(investigating.proposal, undefined);
const diagnosed = projectEvent(events, 3);
assert.equal(diagnosed.finding.verdict, 'Observation supported');
assert.equal(diagnosed.proposal, undefined);
assert.equal(diagnosed.reward, undefined);
const proposed = projectEvent(events, 4);
assert.equal(proposed.proposal.expectedProfit, 3200);
assert.equal(proposed.reward, undefined);
assert.equal(projectEvent(events, 5).reward.status, 'proposed');
const approved = projectEvent(events, 6);
const paid = projectEvent(events, 7);
assert.equal(approved.reward.status, 'approved');
assert.equal(
  approved.reward.receipt,
  undefined,
  'A future receipt must not appear at approval.',
);
assert.equal(paid.reward.status, 'paid');
assert.equal(paid.reward.receipt, 'SIM-delivery-v1');
assert.equal(paid.reward.poolCents, 64000);
assert.deepEqual(
  paid.reward.allocations.map((item) => item.cents),
  [38400, 25600],
);
assert.deepEqual(approved.reward.allocations, paid.reward.allocations);
assert.deepEqual(approved.proposal, paid.proposal);
const f = paid.proposal.forecast;
assert.deepEqual(paid.proposal.scenarios[0], {
  label: 'Low',
  lift: 0,
  profit: 0,
});
assert.equal(
  f.sessions * (f.lift / 100) * f.aov * (f.margin / 100),
  paid.proposal.expectedProfit,
);
assert.equal(
  Math.min(f.cap, (paid.proposal.expectedProfit * f.rate) / 100) * 100,
  paid.reward.poolCents,
);
for (const scenario of paid.proposal.scenarios)
  assert.equal(
    f.sessions * (scenario.lift / 100) * f.aov * (f.margin / 100),
    scenario.profit,
  );
assert.deepEqual(projectEvent(events, 100), paid);

for (const [index, verdict] of [
  [2, 'Could not reproduce'],
  [3, 'Needs more evidence'],
]) {
  const unresolved = buildSampleRun(
    initialState.feedback[index],
    initialState.feedback,
  );
  const result = projectEvent(unresolved.events, 100);
  assert.equal(result.finding.verdict, verdict);
  assert.equal(result.event.status, 'blocked');
  assert.equal(result.proposal, undefined);
  assert.equal(result.reward, undefined);
}
const shopper = {
  ...initialState.feedback[0],
  id: 'new-submission',
  sample: false,
};
const waiting = buildSampleRun(shopper, [...initialState.feedback, shopper]);
assert.equal(waiting.source, 'pending');
assert.equal(
  waiting.feedback.length,
  1,
  'A new report is never silently added to a sample finding.',
);
assert.equal(waiting.events.at(-1).status, 'blocked');
assert.equal(waiting.events.at(-1).elapsedMs, 0);
assert(
  waiting.events.every(
    (event) =>
      !event.finding && !event.proposal && !event.reward && !event.artifact,
  ),
);
assert.deepEqual(
  buildSampleRun(initialState.feedback[1], initialState.feedback).events.at(-1)
    .reward,
  paid.reward,
  'Selecting another report from the same sample improvement must not create another pool.',
);

const base = run.events[0];
for (const invalid of [
  null,
  [],
  {},
  { ...base, runId: '' },
  { ...base, sequence: -1 },
  { ...base, elapsedMs: Infinity },
  { ...base, stage: 'unknown' },
  { ...base, status: 'success' },
])
  assert.throws(() => decodeAgentEvent(invalid));
for (const url of [
  'https://example.com/evidence.png',
  '//example.com/evidence.png',
  '/\\example.com/evidence.png',
  'relative.png',
  '/evidence\n.png',
])
  assert.throws(() =>
    decodeAgentEvent({
      ...base,
      artifact: { kind: 'screenshot', url, caption: 'Evidence' },
    }),
  );
assert.equal(
  decodeAgentEvent({ ...base, ignored: 'drop transport-only fields' }).ignored,
  undefined,
);
assert.throws(() =>
  decodeAgentEvent({
    ...events[3],
    finding: { ...diagnosed.finding, verdict: 'Invalid feedback' },
  }),
);
assert.throws(() =>
  decodeAgentEvent({
    ...events[4],
    proposal: { ...proposed.proposal, forecast: { ...f, margin: 101 } },
  }),
);
assert.throws(() =>
  decodeAgentEvent({
    ...events[7],
    reward: { ...paid.reward, receipt: undefined },
  }),
);
assert.throws(() =>
  decodeAgentEvent({ ...events[7], reward: { ...paid.reward, poolCents: 1 } }),
);
assert.throws(() =>
  decodeAgentEvent({
    ...events[7],
    reward: {
      ...paid.reward,
      allocations: [paid.reward.allocations[0], paid.reward.allocations[0]],
    },
  }),
);
console.log(
  'OK ordered agent events, idempotent retries, safe evidence, time travel, sample rewards and unverified shopper submissions',
);
