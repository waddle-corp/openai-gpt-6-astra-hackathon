import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { feedbackFixtures } from '../agents/feedback-agent/fixtures.ts';
import {
  basketEvidence,
  CONTRIBUTION_ROLES,
  parseAssessments,
  rewardPolicy,
  rewardPrompt,
  splitPool,
} from '../agents/reward-agent/index.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const records = feedbackFixtures.slice(0, 5);
const [a, b, c, d, e] = records.map((record) => record.id);

// Parsing drops unknown IDs, duplicates, unknown roles and empty role sets.
const parsed = parseAssessments(
  JSON.stringify({
    contributions: [
      { feedbackId: a, roles: ['identified', 'identified'], rationale: 'named it' },
      { feedbackId: a, roles: ['shaped'], rationale: 'duplicate' },
      { feedbackId: b, roles: ['shaped', 'invented'], rationale: 'direction' },
      { feedbackId: c, roles: [], rationale: 'nothing' },
      { feedbackId: 'UNKNOWN-1', roles: ['identified'], rationale: 'ghost' },
    ],
    excluded: [
      { feedbackId: d, reason: 'about a different journey' },
      { feedbackId: a, reason: 'cannot be both' },
      { feedbackId: 'UNKNOWN-2', reason: 'ghost' },
    ],
  }),
  new Set(records.map((record) => record.id)),
);
assert.deepEqual(
  parsed.contributions.map((item) => [item.feedbackId, item.roles]),
  [
    [a, ['identified']],
    [b, ['shaped']],
  ],
);
assert.deepEqual(parsed.excluded, [
  { feedbackId: d, reason: 'about a different journey' },
]);

// Past the cap, identified becomes corroborated, in the order the model ranked them.
const capped = parseAssessments(
  JSON.stringify({
    contributions: [a, b, c, d, e].map((id) => ({
      feedbackId: id,
      roles: ['identified', 'addressed'],
      rationale: '',
    })),
    excluded: [],
  }),
  new Set(records.map((record) => record.id)),
).contributions;
assert.equal(
  capped.filter((item) => item.roles.includes('identified')).length,
  rewardPolicy.identifiedCap,
);
assert.deepEqual(capped.slice(-2).map((item) => item.roles.includes('corroborated')), [
  true,
  true,
]);

// The merchant budget is split by ranked weight and never drifts, whatever the remainder.
for (const pool of [20000, 10001, 7, 333333]) {
  const split = splitPool(
    [
      { feedbackId: a, roles: ['identified', 'addressed'], rationale: '' },
      { feedbackId: b, roles: ['shaped'], rationale: '' },
      { feedbackId: c, roles: ['corroborated'], rationale: '' },
    ],
    records,
    pool,
  );
  assert.equal(
    split.reduce((sum, item) => sum + item.bountyCents, 0),
    pool,
    `pool ${pool} did not add up`,
  );
  assert(split.every((item) => item.bountyCents >= 0));
  assert.deepEqual(
    split.map((item) => item.rank),
    [1, 2, 3],
  );
  assert(split[0].weight > split[1].weight);
  assert(split[1].weight > split[2].weight);
  assert.equal(split[0].rewardPreference, records[0].rewardPreference);
}

// Equal roles at different ranks must not tie: the ranking is what breaks them.
const tied = splitPool(
  [a, b, c].map((id) => ({
    feedbackId: id,
    roles: ['identified'],
    rationale: '',
  })),
  records,
  20000,
);
assert.equal(new Set(tied.map((item) => item.bountyCents)).size, 3);
assert(tied[0].bountyCents > tied[2].bountyCents);

// Basket evidence is read off the records, never predicted.
const basket = basketEvidence(tied);
assert.equal(basket.completed + basket.notCompleted, tied.length);
assert.equal(
  basket.cartValueCents,
  tied.reduce((sum, item) => sum + (item.cartCents ?? 0), 0),
);

assert.throws(() => splitPool([], records, 20000), /No feedback earned/);

// The prompt carries the improvement and the shopper evidence, and never asks for amounts.
const opportunity = {
  title: 'Show compatibility beside the purchase controls',
  underlyingProblem: 'Shoppers cannot tell which parts fit their board.',
  opportunity: 'Surface a fit check on the product page.',
  designDirection: ['Add a compatibility row under the variant picker.'],
  tensions: [],
  constraintsHonored: [],
  evidence: [],
  successMetric: 'Attach rate on replacement parts.',
  buildBrief: 'Change the product page purchase block.',
};
const prompt = rewardPrompt(records, opportunity, 'Shipped the fit check.');
assert(prompt.includes(opportunity.title));
assert(prompt.includes('Shipped the fit check.'));
assert(prompt.includes(records[0].feedback.message.slice(0, 40)));
assert(prompt.includes('Amounts are not your decision.'));
assert(prompt.includes(`at most ${rewardPolicy.identifiedCap} records may hold identified`));
for (const role of CONTRIBUTION_ROLES) assert(prompt.includes(`- ${role}:`));

// The cached demo ledger stays consistent with the policy and the fixtures.
const cache = JSON.parse(
  readFileSync(`${root}/data/collective-cache.json`, 'utf8'),
);
if (cache.reward) {
  const known = new Set(feedbackFixtures.map((record) => record.id));
  const lead = cache.prioritization.opportunities.find(
    (item) => item.id === cache.lead,
  );
  assert.equal(cache.reward.poolCents, rewardPolicy.poolCents);
  assert.equal(
    cache.reward.contributions.filter((item) => item.roles.includes('identified'))
      .length <= rewardPolicy.identifiedCap,
    true,
    'cached ledger exceeds the identified cap',
  );
  assert.equal(
    new Set(cache.reward.contributions.map((item) => item.bountyCents)).size,
    cache.reward.contributions.length,
    'cached ledger still has tied bounties',
  );
  assert.equal(
    cache.reward.contributions.reduce((sum, item) => sum + item.bountyCents, 0),
    cache.reward.poolCents,
    'cached ledger does not add up to the pool',
  );
  for (const item of [...cache.reward.contributions, ...cache.reward.excluded]) {
    assert(known.has(item.feedbackId), `ledger cites unknown ${item.feedbackId}`);
    assert(
      lead.feedbackIds.includes(item.feedbackId),
      `${item.feedbackId} is not in the published group`,
    );
  }
}

console.log(
  `Reward agent self-check passed: pool ${rewardPolicy.poolCents} cents, roles ${CONTRIBUTION_ROLES.join('/')}, identified cap ${rewardPolicy.identifiedCap}.`,
);
