import { responseText, responsesCreate } from '../shared/openai.ts';
import { strategyContext } from '../shared/strategy.ts';
import { recordContext, type FeedbackRecord } from './fixtures.ts';

export const JOURNEY_STAGES = [
  'discovery',
  'search',
  'product-page',
  'cart',
  'checkout',
  'post-purchase',
  'support',
] as const;

export type Opportunity = {
  id: string;
  title: string;
  problem: string;
  journeyStage: (typeof JOURNEY_STAGES)[number];
  feedbackIds: string[];
  goalAlignment: string[];
  constraintRisks: string[];
  priority: number;
  rationale: string;
};

export type Prioritization = {
  opportunities: Opportunity[];
  setAside: { feedbackId: string; reason: string }[];
};

const PRIORITIZATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    opportunities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          problem: { type: 'string' },
          journeyStage: { type: 'string', enum: [...JOURNEY_STAGES] },
          feedbackIds: { type: 'array', items: { type: 'string' } },
          goalAlignment: { type: 'array', items: { type: 'string' } },
          constraintRisks: { type: 'array', items: { type: 'string' } },
          priority: { type: 'number', minimum: 0, maximum: 100 },
          rationale: { type: 'string' },
        },
        required: [
          'id',
          'title',
          'problem',
          'journeyStage',
          'feedbackIds',
          'goalAlignment',
          'constraintRisks',
          'priority',
          'rationale',
        ],
      },
    },
    setAside: {
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
  required: ['opportunities', 'setAside'],
} as const;

export function feedbackDigest(records: FeedbackRecord[]) {
  return records
    .map((record) =>
      [...recordContext(record), `Feedback: ${record.message}`].join('\n'),
    )
    .join('\n\n');
}

export function prioritizePrompt(records: FeedbackRecord[]) {
  return [
    strategyContext(),
    '',
    `You are given ${records.length} shopper feedback records from one storefront.`,
    'Group records that describe the same underlying problem into opportunities, even when shoppers ask for different solutions.',
    'Rank opportunities by how much solving them advances the goal and the ordered priorities, not by how often they were mentioned.',
    'priority is 0-100. Frequency is evidence, not the ranking rule: a rarely mentioned problem that serves priority 1 outranks a common cosmetic complaint.',
    'Cite the merchant constraints an opportunity could violate in constraintRisks.',
    'Put records that do not serve the goal, are out of scope, or ask for a risky action in setAside with a short reason. Every record must appear exactly once, either in one opportunity or in setAside.',
    'Use short kebab-case ids for opportunities.',
    '',
    'Feedback records:',
    '',
    feedbackDigest(records),
  ].join('\n');
}

export function parsePrioritization(
  text: string,
  knownIds: Set<string>,
): Prioritization {
  const parsed = JSON.parse(text) as Prioritization;
  const seen = new Set<string>();
  const opportunities = parsed.opportunities
    .map((item) => ({
      ...item,
      // Drop hallucinated or duplicate citations rather than trusting them.
      feedbackIds: item.feedbackIds.filter(
        (id) => knownIds.has(id) && !seen.has(id) && seen.add(id),
      ),
    }))
    .filter((item) => item.feedbackIds.length > 0)
    .sort((a, b) => b.priority - a.priority);
  const setAside = parsed.setAside.filter(
    (item) =>
      knownIds.has(item.feedbackId) &&
      !seen.has(item.feedbackId) &&
      seen.add(item.feedbackId),
  );
  if (opportunities.length === 0)
    throw new Error('Astra returned no opportunities.');
  return { opportunities, setAside };
}

export async function prioritizeFeedback(
  records: FeedbackRecord[],
): Promise<Prioritization> {
  const response = await responsesCreate({
    model: 'gpt-6-astra',
    reasoning: { effort: 'medium' },
    instructions:
      'You prioritize collective shopper feedback for a storefront improvement agent using the merchant strategy. Return only the requested JSON schema.',
    input: prioritizePrompt(records),
    text: {
      format: {
        type: 'json_schema',
        name: 'feedback_prioritization',
        strict: true,
        schema: PRIORITIZATION_SCHEMA,
      },
    },
  });
  return parsePrioritization(
    responseText(response),
    new Set(records.flatMap((record) => (record.id ? [record.id] : []))),
  );
}
