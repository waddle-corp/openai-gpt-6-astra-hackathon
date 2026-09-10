import assert from 'node:assert/strict';
import { assertFeedbackRecord } from '../contracts/feedback.ts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  feedbackFixtures,
  feedbackTargetPath,
  findFeedback,
  journeySummary,
  labRecord,
} from '../agents/feedback-agent/fixtures.ts';
import {
  FIT_THRESHOLD,
  isAcceptedTriage,
  parseTriage,
  triagePrompt,
} from '../agents/feedback-agent/triage.ts';
import {
  parsePrioritization,
  prioritizePrompt,
} from '../agents/feedback-agent/prioritize.ts';
import {
  parseOpportunity,
  synthesizePrompt,
} from '../agents/feedback-agent/synthesize.ts';
import { responseText } from '../agents/shared/openai.ts';
import { pca3 } from '../agents/feedback-agent/embed.ts';
import { strategy } from '../agents/shared/strategy.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const config = JSON.parse(
  readFileSync(`${root}/data/feedback-agent-config.json`, 'utf8'),
);

// Gate
const result = parseTriage(
  JSON.stringify({
    decision: 'fit',
    score: 88,
    summary: 'The request reduces purchase uncertainty.',
    evidence: ['It concerns product compatibility.'],
    risks: [],
    nextStep: 'Inspect the product page.',
  }),
);
assert(isAcceptedTriage(result));
assert(!isAcceptedTriage({ ...result, score: FIT_THRESHOLD - 1 }));
assert(!isAcceptedTriage({ ...result, decision: 'review', score: 100 }));
assert.throws(() =>
  parseTriage(JSON.stringify({ ...result, decision: 'deploy' })),
);
assert.throws(() => parseTriage(JSON.stringify({ ...result, score: 101 })));

// Config mirrors the code
assert.equal(config.goal, strategy.goal);
assert.equal(config.gating.fitThreshold, FIT_THRESHOLD);
assert.equal(config.feedbackSource, 'data/shopper-feedback.json');
assert.equal(config.computerUsePolicy.canDeploy, false);

// Fixtures
assert.equal(feedbackFixtures.length, 33); // 20 shopper + 13 compatibility (SYN-FB-01 excluded)
assert.equal(new Set(feedbackFixtures.map((record) => record.id)).size, 33);
for (const record of feedbackFixtures) {
  assert(record.feedback.message.trim(), `${record.id} has no message`);
  assert(
    feedbackTargetPath(record).startsWith('/store'),
    `${record.id} target path`,
  );
  assert(record.journey.events.length > 0, `${record.id} has an empty journey`);
  assert(
    journeySummary(record.journey).includes(record.journey.events[0].path),
  );
}
assert.equal(findFeedback('nope'), undefined);

// Prompt grounding
const first = feedbackFixtures[0];
const prompt = triagePrompt(first, 'http://localhost:3000/store');
assert(prompt.includes('Goal:'));
assert(prompt.includes(first.feedback.message));
assert(prompt.includes(first.context.selectedPage.title));
assert(prompt.includes(`score ${FIT_THRESHOLD}`));
assert(prompt.includes('Recorded shopper journey'));
const lab = labRecord('Free text only', '/store/cart');
assertFeedbackRecord(lab);
assertFeedbackRecord(labRecord('Overall visit', '/elsewhere'));
const freeText = triagePrompt(lab);
assert(freeText.includes('Free text only') && freeText.includes('/store/cart'));
const compat = feedbackFixtures.find((record) => record.id === 'SYN-FB-02');
const compatPrompt = triagePrompt(compat);
assert(
  compatPrompt.includes('Cart at submission') &&
    compatPrompt.includes('Q: ') &&
    compatPrompt.includes('cart_added'),
);
assert(!feedbackFixtures.some((record) => record.id === 'SYN-FB-01'));

// Current customer contract reaches merchant prompts without losing focus or approved text.
const selectedEvent = compat.journey.events[0];
const conversational = {
  ...compat,
  feedback: {
    ...compat.feedback,
    message: '',
    category: null,
    summary: 'I could not choose a charger.',
  },
  context: {
    ...compat.context,
    focus: { scope: 'specific_moments', eventIds: [selectedEvent.id] },
  },
};
assertFeedbackRecord(conversational);
const conversationPrompt = triagePrompt(conversational);
assert(conversationPrompt.includes(conversational.feedback.summary));
assert(conversationPrompt.includes(`Selected moment ${selectedEvent.id}:`));
assert(
  conversationPrompt.includes('Customer feedback scope: specific_moments'),
);

// Collective: prioritize (step 2)
const knownIds = new Set(feedbackFixtures.map((record) => record.id));
const prioritizeText = prioritizePrompt(feedbackFixtures);
assert(prioritizeText.includes('Current priorities'));
assert(prioritizeText.includes('Merchant constraints'));
for (const record of feedbackFixtures)
  assert(prioritizeText.includes(record.id));
const opp = (id, priority, feedbackIds, extra = {}) => ({
  id,
  title: id,
  problem: 'p',
  journeyStage: 'product-page',
  feedbackIds,
  goalAlignment: [],
  constraintRisks: [],
  priority,
  rationale: 'r',
  ...extra,
});
const ranked = parsePrioritization(
  JSON.stringify({
    opportunities: [
      opp('cosmetic', 30, ['shopper-feedback-010', 'made-up-id']),
      opp('fit', 90, [
        'shopper-feedback-001',
        'shopper-feedback-001',
        'shopper-feedback-006',
      ]),
      opp('ghost', 99, ['nope']),
    ],
    setAside: [
      { feedbackId: 'shopper-feedback-008', reason: 'policy page' },
      { feedbackId: 'shopper-feedback-001', reason: 'already grouped' },
      { feedbackId: 'unknown', reason: 'x' },
    ],
  }),
  knownIds,
);
assert.deepEqual(
  ranked.opportunities.map((item) => item.id),
  ['fit', 'cosmetic'],
);
assert.deepEqual(ranked.opportunities[0].feedbackIds, [
  'shopper-feedback-001',
  'shopper-feedback-006',
]);
assert.deepEqual(ranked.opportunities[1].feedbackIds, ['shopper-feedback-010']);
assert.deepEqual(
  ranked.setAside.map((item) => item.feedbackId),
  ['shopper-feedback-008'],
);
assert.throws(() =>
  parsePrioritization(
    JSON.stringify({ opportunities: [], setAside: [] }),
    knownIds,
  ),
);

// Collective: synthesize (step 3)
const selected = feedbackFixtures.slice(0, 3);
const synthText = synthesizePrompt(selected, 'reduce returns');
assert(synthText.includes('Merchant focus for this synthesis: reduce returns'));
assert(
  synthText.includes(selected[2].feedback.message) &&
    !synthText.includes(feedbackFixtures[5].feedback.message),
);
const opportunity = parseOpportunity(
  JSON.stringify({
    title: 'Compatibility guide',
    underlyingProblem: 'p',
    opportunity: 'o',
    designDirection: ['d'],
    tensions: [
      {
        feedbackIds: ['shopper-feedback-001', 'nope'],
        tension: 't',
        resolution: 'r',
      },
    ],
    constraintsHonored: [],
    evidence: [
      { feedbackId: 'shopper-feedback-001', role: 'problem', quote: 'q' },
      { feedbackId: 'nope', role: 'context', quote: 'q' },
    ],
    successMetric: 'm',
    buildBrief: 'b',
  }),
  new Set(selected.map((record) => record.id)),
);
assert.equal(opportunity.evidence.length, 1);
assert.deepEqual(opportunity.tensions[0].feedbackIds, ['shopper-feedback-001']);
assert.throws(() =>
  parseOpportunity(
    JSON.stringify({ title: ' ', buildBrief: 'b', evidence: [], tensions: [] }),
    knownIds,
  ),
);

// REST payload shape (no output_text convenience field)
assert.equal(
  responseText({
    output: [
      { type: 'reasoning' },
      {
        type: 'message',
        content: [
          { type: 'output_text', text: '{"a":' },
          { type: 'output_text', text: '1}' },
        ],
      },
    ],
  }),
  '{"a":1}',
);
assert.throws(
  () =>
    responseText({
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output: [],
    }),
  /max_output_tokens/,
);

// PCA: variance along one raw axis becomes the first component, output is unit-scaled
const cloud = Array.from({ length: 12 }, (_, i) => [
  i * 10,
  (i % 3) - 1,
  (i % 2) * 0.1,
  0,
]);
const projected = pca3(cloud);
assert.equal(projected.length, 12);
assert.ok(
  projected.every(
    ([x, y, z]) => Math.abs(x) <= 1 && Math.abs(y) <= 1 && Math.abs(z) <= 1,
  ),
);
assert.ok(
  Math.abs(projected[11][0] - projected[0][0]) > 1.9,
  'first component spans the long axis',
);

// Cached collective pass used by /tmp/feedback/collective
const cache = JSON.parse(
  readFileSync(`${root}/data/collective-cache.json`, 'utf8'),
);
assert.equal(
  cache.goal,
  strategy.goal,
  'collective cache was built for a different goal; rerun scripts/precompute-collective.mjs',
);
assert.equal(cache.points.length, feedbackFixtures.length);
assert(
  cache.opportunities[cache.lead]?.buildBrief,
  'cache lead opportunity is missing',
);
for (const item of cache.prioritization.opportunities)
  for (const id of item.feedbackIds)
    assert(knownIds.has(id), `cache cites unknown ${id}`);

console.log(
  `Agent self-check passed: ${feedbackFixtures.length} fixtures, gate threshold ${FIT_THRESHOLD}.`,
);
