import {
  recordContext,
  type FeedbackRecord,
} from '../feedback-agent/fixtures.ts';
import type { ImprovementOpportunity } from '../feedback-agent/synthesize.ts';
import { allocate } from '../../lib/allocate.ts';
import { responseText, responsesCreate } from '../shared/openai.ts';
import { strategy } from '../shared/strategy.ts';

/** Merchant bounty policy: a fixed budget per published improvement, split by contribution role. */
export const rewardPolicy = {
  poolCents: 20000,
  roleWeights: {
    identified: 3,
    shaped: 2,
    addressed: 2,
    corroborated: 1,
  },
  /** At most this many records can hold `identified`; the rest of the group corroborated it. */
  identifiedCap: 3,
  /** Rank decay across the ranked list, so equal roles at different ranks never tie. */
  lastRankFactor: 0.6,
} as const;

export type ContributionRole = keyof typeof rewardPolicy.roleWeights;

const ROLE_MEANING: Record<ContributionRole, string> = {
  identified:
    'identified: this shopper named the underlying problem in terms specific enough that the improvement follows from their record alone. Reserve it for the few clearest accounts.',
  shaped:
    'shaped: this shopper proposed something you can trace into the design direction or build brief. A complaint without a direction does not earn it.',
  corroborated:
    'corroborated: this shopper reported the same problem, but in generic terms someone else had already made specific. Mutually exclusive with identified.',
  addressed:
    'addressed: the published improvement changes the exact moment this shopper struggled with, not merely the page they were on. It never stands alone; pair it with the job the record did.',
};

export const CONTRIBUTION_ROLES = Object.keys(
  rewardPolicy.roleWeights,
) as ContributionRole[];

export type Assessment = {
  feedbackId: string;
  roles: ContributionRole[];
  rationale: string;
};

export type Contribution = Assessment & {
  rank: number;
  weight: number;
  share: number;
  bountyCents: number;
  rewardPreference: FeedbackRecord['rewardPreference'];
  /** Measured on the record itself, never predicted: what this shopper had in play. */
  cartCents: number | null;
  purchased: boolean;
};

export type RewardLedger = {
  opportunityTitle: string;
  goal: string;
  successMetric: string;
  publishedAt: string;
  poolCents: number;
  /** Order value the rewarded feedback was recorded against. Observed, not an uplift estimate. */
  basket: {
    cartValueCents: number;
    recordsWithCart: number;
    completed: number;
    notCompleted: number;
  };
  contributions: Contribution[];
  excluded: { feedbackId: string; reason: string }[];
};

const LEDGER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    contributions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          feedbackId: { type: 'string' },
          roles: {
            type: 'array',
            items: { type: 'string', enum: CONTRIBUTION_ROLES },
          },
          rationale: { type: 'string' },
        },
        required: ['feedbackId', 'roles', 'rationale'],
      },
    },
    excluded: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          feedbackId: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['feedbackId', 'reason'],
      },
    },
  },
  required: ['contributions', 'excluded'],
} as const;

/** Judging a contribution needs the words, the chosen moments and the basket, not the whole click trail. */
function rewardDigest(records: FeedbackRecord[]) {
  return records
    .map((record) =>
      [
        ...recordContext(record).filter(
          (line) => !line.startsWith('Recorded shopper journey'),
        ),
        `Feedback: ${record.feedback.message}`,
      ].join('\n'),
    )
    .join('\n\n');
}

export function rewardPrompt(
  records: FeedbackRecord[],
  opportunity: ImprovementOpportunity,
  buildSummary?: string,
) {
  return [
    `Merchant goal: ${strategy.goal}`,
    '',
    'The merchant published this improvement, built from shopper feedback:',
    `Title: ${opportunity.title}`,
    `Underlying problem: ${opportunity.underlyingProblem}`,
    `Opportunity: ${opportunity.opportunity}`,
    'Design direction:',
    ...opportunity.designDirection.map((item) => `- ${item}`),
    `Build brief: ${opportunity.buildBrief}`,
    buildSummary
      ? `What was actually built and validated: ${buildSummary}`
      : '',
    '',
    `Decide how each of these ${records.length} shopper feedback records contributed to that improvement.`,
    'Assign every role that applies:',
    ...CONTRIBUTION_ROLES.map((role) => `- ${ROLE_MEANING[role]}`),
    `Order contributions from the strongest to the weakest. The order is the ranking, and at most ${rewardPolicy.identifiedCap} records may hold identified, so decide which accounts were clearest instead of giving the role to everyone.`,
    'Be selective. Most records earn one or two roles; all four is rare and means the record did all four jobs on its own.',
    'The point of the bounty is to reward thoughtful, contextual feedback over generic remarks, so a vague record must not score like a specific one.',
    'Judge the contribution, not the length: a short remark that first named the problem outranks a long restatement of it.',
    'Do not rank by how many shoppers said the same thing; corroboration is one role, not a multiplier.',
    'A record that did not contribute goes in excluded with a one-line reason. Never invent a feedback ID.',
    'Amounts are not your decision. Assign roles and a rationale addressed to the shopper: one sentence, at most 15 words, no preamble.',
    '',
    'Feedback records:',
    '',
    rewardDigest(records),
  ]
    .filter(Boolean)
    .join('\n');
}

export function parseAssessments(
  text: string,
  knownIds: Set<string>,
): { contributions: Assessment[]; excluded: RewardLedger['excluded'] } {
  const parsed = JSON.parse(text) as {
    contributions: Assessment[];
    excluded: RewardLedger['excluded'];
  };
  const seen = new Set<string>();
  let identified = 0;
  // Order is the model's ranking, strongest first, so the cap falls on the weakest claims.
  const contributions = parsed.contributions.filter((item) => {
    if (!knownIds.has(item.feedbackId) || seen.has(item.feedbackId))
      return false;
    seen.add(item.feedbackId);
    item.roles = [...new Set(item.roles)].filter((role) =>
      CONTRIBUTION_ROLES.includes(role),
    );
    // Naming the problem first and repeating it after are the same job; the stronger one stands.
    if (item.roles.includes('identified'))
      item.roles = item.roles.filter((role) => role !== 'corroborated');
    // Benefiting from the fix is not a contribution: a record in the group at least corroborated it.
    if (item.roles.length === 1 && item.roles[0] === 'addressed')
      item.roles = ['corroborated', 'addressed'];
    // The cap is what forces a choice: past it, the record corroborated what someone else named.
    if (item.roles.includes('identified')) {
      if (identified < rewardPolicy.identifiedCap) identified += 1;
      else
        item.roles = [
          ...item.roles.filter((role) => role !== 'identified'),
          'corroborated',
        ];
    }
    return item.roles.length > 0;
  });
  const excluded = parsed.excluded.filter(
    (item) => knownIds.has(item.feedbackId) && !seen.has(item.feedbackId),
  );
  return { contributions, excluded };
}

/** Ranked weight: the role decides the size, the rank breaks ties between equal roles. */
function rankedWeights(assessments: Assessment[]) {
  const last = assessments.length - 1;
  return assessments.map((item, index) => {
    const role = item.roles.reduce(
      (sum, name) => sum + rewardPolicy.roleWeights[name],
      0,
    );
    const decay =
      last < 1 ? 1 : 1 - (1 - rewardPolicy.lastRankFactor) * (index / last);
    return role * decay;
  });
}

/** The role decides the size, the rank breaks ties, and the cents always add up to the merchant budget. */
export function splitPool(
  assessments: Assessment[],
  records: FeedbackRecord[],
  poolCents: number = rewardPolicy.poolCents,
): Contribution[] {
  const byId = new Map(records.map((record) => [record.id, record]));
  const weights = rankedWeights(assessments);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!total) throw new Error('No feedback earned a share of the reward pool.');
  const cents = allocate(weights, poolCents);
  return assessments.map((item, index) => {
    const record = byId.get(item.feedbackId);
    return {
      ...item,
      rank: index + 1,
      weight: weights[index],
      share: weights[index] / total,
      bountyCents: cents[index],
      rewardPreference: record?.rewardPreference ?? null,
      cartCents: record?.context.cart?.totalCents ?? null,
      purchased: record?.purchase.status === 'completed_demo',
    };
  });
}

/** What the rewarded feedback was recorded against. Observed on the records, never a predicted uplift. */
export function basketEvidence(contributions: Contribution[]) {
  const withCart = contributions.filter((item) => item.cartCents !== null);
  return {
    cartValueCents: withCart.reduce((sum, item) => sum + item.cartCents!, 0),
    recordsWithCart: withCart.length,
    completed: contributions.filter((item) => item.purchased).length,
    notCompleted: contributions.filter((item) => !item.purchased).length,
  };
}

export async function rewardContributors(
  records: FeedbackRecord[],
  opportunity: ImprovementOpportunity,
  {
    poolCents = rewardPolicy.poolCents,
    buildSummary,
  }: { poolCents?: number; buildSummary?: string } = {},
): Promise<RewardLedger> {
  const response = await responsesCreate({
    model: 'gpt-6-astra',
    reasoning: { effort: 'low' },
    instructions:
      'You decide how shopper feedback contributed to a storefront improvement the merchant published. Return only the requested JSON schema.',
    input: rewardPrompt(records, opportunity, buildSummary),
    text: {
      format: {
        type: 'json_schema',
        name: 'reward_assessment',
        strict: true,
        schema: LEDGER_SCHEMA,
      },
    },
  });
  const { contributions, excluded } = parseAssessments(
    responseText(response),
    new Set(records.map((record) => record.id)),
  );
  // Ranked before sorting: rank is Astra's ordering, the ledger itself reads by amount.
  const paid = splitPool(contributions, records, poolCents).sort(
    (a, b) => b.bountyCents - a.bountyCents,
  );
  return {
    opportunityTitle: opportunity.title,
    goal: strategy.goal,
    successMetric: opportunity.successMetric,
    publishedAt: new Date().toISOString(),
    poolCents,
    basket: basketEvidence(paid),
    contributions: paid,
    excluded,
  };
}
