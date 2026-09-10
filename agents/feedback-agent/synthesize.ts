import { responseText, responsesCreate } from '../shared/openai.ts';
import { strategyContext } from '../shared/strategy.ts';
import type { FeedbackRecord } from './fixtures.ts';
import { feedbackDigest } from './prioritize.ts';

export type ImprovementOpportunity = {
  title: string;
  underlyingProblem: string;
  opportunity: string;
  designDirection: string[];
  tensions: { feedbackIds: string[]; tension: string; resolution: string }[];
  constraintsHonored: string[];
  evidence: {
    feedbackId: string;
    role: 'problem' | 'solution' | 'context';
    quote: string;
  }[];
  successMetric: string;
  buildBrief: string;
};

const OPPORTUNITY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    underlyingProblem: { type: 'string' },
    opportunity: { type: 'string' },
    designDirection: { type: 'array', items: { type: 'string' } },
    tensions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          feedbackIds: { type: 'array', items: { type: 'string' } },
          tension: { type: 'string' },
          resolution: { type: 'string' },
        },
        required: ['feedbackIds', 'tension', 'resolution'],
      },
    },
    constraintsHonored: { type: 'array', items: { type: 'string' } },
    evidence: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          feedbackId: { type: 'string' },
          role: { type: 'string', enum: ['problem', 'solution', 'context'] },
          quote: { type: 'string' },
        },
        required: ['feedbackId', 'role', 'quote'],
      },
    },
    successMetric: { type: 'string' },
    buildBrief: { type: 'string' },
  },
  required: [
    'title',
    'underlyingProblem',
    'opportunity',
    'designDirection',
    'tensions',
    'constraintsHonored',
    'evidence',
    'successMetric',
    'buildBrief',
  ],
} as const;

export function synthesizePrompt(records: FeedbackRecord[], focus?: string) {
  return [
    strategyContext(),
    '',
    `Synthesize these ${records.length} selected shopper feedback records into one improvement opportunity.`,
    'Do not vote or merge the requests. Find the underlying problem the shoppers share, then propose the smallest change that resolves it within the merchant constraints.',
    'Where shoppers ask for conflicting solutions, name the tension and how the proposal resolves it.',
    'Quote shoppers verbatim in evidence and label each quote as problem, solution, or context.',
    'buildBrief is the handoff to the coding agent: which storefront pages and components change, on desktop and mobile, and what must stay unchanged. It is a proposal only; nothing is deployed.',
    focus ? `Merchant focus for this synthesis: ${focus}` : '',
    '',
    'Selected feedback records:',
    '',
    feedbackDigest(records),
  ].join('\n');
}

export function parseOpportunity(
  text: string,
  knownIds: Set<string>,
): ImprovementOpportunity {
  const parsed = JSON.parse(text) as ImprovementOpportunity;
  if (!parsed.title.trim() || !parsed.buildBrief.trim()) {
    throw new Error('Astra returned an incomplete opportunity.');
  }
  parsed.evidence = parsed.evidence.filter((item) =>
    knownIds.has(item.feedbackId),
  );
  parsed.tensions = parsed.tensions.map((item) => ({
    ...item,
    feedbackIds: item.feedbackIds.filter((id) => knownIds.has(id)),
  }));
  return parsed;
}

export async function synthesizeOpportunity(
  records: FeedbackRecord[],
  focus?: string,
): Promise<ImprovementOpportunity> {
  const response = await responsesCreate({
    model: 'gpt-6-astra',
    reasoning: { effort: 'medium' },
    instructions:
      'You turn selected shopper feedback into one strategy-aligned improvement opportunity for a storefront. Return only the requested JSON schema.',
    input: synthesizePrompt(records, focus),
    text: {
      format: {
        type: 'json_schema',
        name: 'improvement_opportunity',
        strict: true,
        schema: OPPORTUNITY_SCHEMA,
      },
    },
  });
  return parseOpportunity(
    responseText(response),
    new Set(records.map((record) => record.id)),
  );
}
