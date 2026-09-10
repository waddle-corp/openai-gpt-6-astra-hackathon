import assert from 'node:assert/strict';
import { register } from 'node:module';
import { initialState } from '../lib/feedback.ts';
import { DEMO_DURATION_MS, projectDemoTour } from '../lib/demo-tour.ts';
register(
  `data:text/javascript,${encodeURIComponent("export function resolve(specifier, context, next) { return next(specifier === './agent-run' ? './agent-run.ts' : specifier, context); }")}`,
  import.meta.url,
);
const { projectFleet } = await import('../lib/agent-fleet.ts');
assert.equal(DEMO_DURATION_MS, 60000);
const expected = [
  [0, 'overview', false],
  [5000, '01', true],
  [12000, '01', false],
  [14000, '02', true],
  [25000, '02', false],
  [27000, '03', true],
  [35000, '03', false],
  [37000, '04', true],
  [46000, '04', false],
  [48000, '05', true],
  [56000, 'overview', false],
  [60000, 'overview', false],
];
for (const [ms, step, modal] of expected) {
  const frame = projectDemoTour(ms);
  assert.equal(frame.step, step, `step at ${ms}`);
  assert.equal(frame.showModal, modal, `modal at ${ms}`);
}
let previous = -1;
for (let ms = 0; ms <= 60000; ms += 100) {
  const frame = projectDemoTour(ms);
  assert.ok(frame.sampleMs >= previous, 'Story never rewinds or loops');
  previous = frame.sampleMs;
  const fleet = projectFleet(initialState.feedback, frame.sampleMs);
  const story = fleet.runs.find((item) =>
    item.run.feedback.some((report) => report.group === 'delivery'),
  ).snapshot;
  if (frame.step === '03')
    assert.ok(story.finding, 'Evidence exists before the findings modal');
  if (frame.step === '04')
    assert.ok(story.proposal, 'Proposal exists before the improvements modal');
  if (frame.step === '05')
    assert.ok(story.reward, 'Reward exists before the rewards modal');
  if (ms >= 56000)
    assert.equal(
      story.reward.status,
      'paid',
      'Final overview holds the completed sample outcome',
    );
  assert.equal(frame.finished, ms === 60000);
}
assert.equal(projectDemoTour(5000).page, 0);
assert.equal(projectDemoTour(10000).page, 1);
assert.deepEqual(
  projectDemoTour(61000),
  projectDemoTour(60000),
  'Ends rather than looping',
);
console.log(
  'OK 60-second guided chapters, overview transitions, automatic pages, evidence ordering and final hold',
);
