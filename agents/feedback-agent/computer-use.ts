import { responseText, responsesCreate } from '../shared/openai.ts';
import { strategyContext } from '../shared/strategy.ts';
import { recordContext, type FeedbackRecord } from './fixtures.ts';

type ComputerCall = {
  type: 'computer_call';
  call_id: string;
  actions?: unknown[];
  pending_safety_checks?: unknown[];
  status?: string;
};

export type ComputerUseResult = {
  status: 'needs_screenshot' | 'complete';
  responseId: string;
  call?: ComputerCall;
  output?: string;
};

const computerInstructions = [
  'You are a storefront UX researcher.',
  strategyContext(),
  'Inspect the supplied storefront only after the feedback gate has accepted it.',
  'Use screenshots to locate the relevant UI and compare the current experience with the feedback.',
  'Propose a concrete, evidence-based improvement. Do not submit forms, purchase anything, change account data, or deploy code.',
  'If the page is unavailable, say so and explain what evidence is missing.',
].join('\n');

function computerCall(response: Record<string, unknown>) {
  return response.output && Array.isArray(response.output)
    ? (response.output.find(
        (item): item is ComputerCall =>
          typeof item === 'object' &&
          item !== null &&
          (item as { type?: string }).type === 'computer_call',
      ) ?? null)
    : null;
}

export async function startComputerUse(
  record: FeedbackRecord,
  targetUrl?: string,
): Promise<ComputerUseResult> {
  const response = await responsesCreate({
    model: 'gpt-6-astra',
    reasoning: { effort: 'low' },
    instructions: computerInstructions,
    input: [
      `Open ${targetUrl || 'the current storefront'} and investigate this accepted feedback.`,
      ...recordContext(record),
      `User feedback:\n${record.feedback.message}`,
    ].join('\n'),
    tools: [{ type: 'computer' }],
  });
  return computerResult(response);
}

export async function continueComputerUse(
  responseId: string,
  callId: string,
  screenshot: string,
): Promise<ComputerUseResult> {
  if (!screenshot.startsWith('data:image/')) {
    throw new Error('screenshot must be a data image URL.');
  }
  const response = await responsesCreate({
    model: 'gpt-6-astra',
    reasoning: { effort: 'low' },
    tools: [{ type: 'computer' }],
    previous_response_id: responseId,
    input: [
      {
        type: 'computer_call_output',
        call_id: callId,
        output: { type: 'computer_screenshot', image_url: screenshot, detail: 'original' },
      },
    ],
  });
  return computerResult(response);
}

function computerResult(response: Record<string, unknown>): ComputerUseResult {
  const call = computerCall(response);
  const responseId = typeof response.id === 'string' ? response.id : '';
  if (!responseId) throw new Error('Astra returned no response id.');
  return call
    ? { status: 'needs_screenshot', responseId, call }
    : { status: 'complete', responseId, output: responseText(response) };
}
