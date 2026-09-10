import assert from 'node:assert/strict';
import {
  calculate,
  allocate,
  approve,
  pay,
  propose,
  initialState,
  reproduce,
  submitFeedback,
  defaultForecast,
} from '../lib/feedback.ts';
assert.equal(calculate(defaultForecast).profit, 3200);
assert.equal(calculate(defaultForecast).pool, 64000);
assert.equal(calculate({ ...defaultForecast, cap: 100 }).pool, 10000);
assert.equal(calculate(defaultForecast, 0).profit, 0);
assert.equal(calculate(defaultForecast, 2).profit, 6400);
assert.throws(() => calculate({ ...defaultForecast, lift: 101 }));
assert.throws(() => calculate({ ...defaultForecast, sessions: NaN }));
assert.throws(() => calculate({ ...defaultForecast, rate: -1 }));
assert.throws(() => calculate({ ...defaultForecast, sessions: 1e30 }));
const contributors = [
  { id: 'a', weight: 1, reason: 'a' },
  { id: 'b', weight: 1, reason: 'b' },
  { id: 'c', weight: 1, reason: 'c' },
];
assert.deepEqual(
  allocate(100, contributors).map((c) => c.cents),
  [34, 33, 33],
);
assert.equal(
  allocate(1, contributors).reduce((n, c) => n + c.cents, 0),
  1,
);
assert.throws(() => allocate(100, [contributors[0], contributors[0]]));
assert.throws(() => allocate(100, [{ ...contributors[0], weight: 0 }]));
assert.equal(
  allocate(100, [{ ...contributors[0], weight: 0 }, contributors[1]])[0].cents,
  0,
);
const state = structuredClone(initialState);
assert.throws(() => propose('delivery', state.feedback));
for (const f of state.feedback) f.run = await reproduce(f);
assert.equal(state.feedback[0].run.verdict, 'Observation supported');
assert.equal(state.feedback[2].run.verdict, 'Could not reproduce');
assert.equal(state.feedback[3].run.verdict, 'Needs more evidence');
const p = propose('delivery', state.feedback);
assert.equal(p.contributors.length, 2);
assert.throws(() => pay(p));
assert.throws(() =>
  approve(
    {
      ...p,
      contributors: [{ id: 'unknown', weight: 1, reason: 'no evidence' }],
    },
    state.feedback,
  ),
);
const approved = approve(p, state.feedback);
assert.equal(approved.snapshot.pool, 64000);
assert.equal(
  approved.snapshot.allocations.reduce((n, c) => n + c.cents, 0),
  64000,
);
p.forecast.rate = 50;
assert.equal(approved.snapshot.forecast.rate, 20);
assert.equal(approve(approved, state.feedback), approved);
const paid = pay(approved);
assert.equal(paid.status, 'paid');
assert.equal(pay(paid), paid);
assert.match(paid.receipt, /^SIM-/);
const moments = [
  {
    id: 'm1',
    label: 'Product',
    route: '/store/products/boosted-charger',
    detail: 'Viewed charger',
  },
];
assert.throws(() => submitFeedback(state, 'short', moments));
assert.throws(() => submitFeedback(state, 'Long enough comment', []));
const submission = submitFeedback(
  state,
  'I could not find delivery timing.',
  moments,
);
assert.equal(submission.state.feedback.length, state.feedback.length + 1);
const duplicate = submitFeedback(
  submission.state,
  'I could not find delivery timing.',
  moments,
);
assert.equal(duplicate.id, submission.id);
assert.equal(duplicate.state.feedback.length, submission.state.feedback.length);
assert.equal(
  (await reproduce(submission.state.feedback[0])).verdict,
  'Needs more evidence',
);
console.log(
  'OK forecasts, caps, cent allocation, eligibility, locked approvals, idempotent payout, submission deduplication and verdicts',
);
