import { feedbackFixtures } from '@/agents';
import { rewardContributors } from '@/agents/reward-agent/index.ts';
import type { ImprovementOpportunity } from '@/agents/feedback-agent/synthesize.ts';
import { agentErrorResponse, pickFeedback } from '@/lib/agent-response';

/** Rewards the shoppers behind one published improvement. The opportunity comes from POST /api/feedback/synthesize. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      feedbackIds?: unknown;
      opportunity?: unknown;
      poolCents?: unknown;
      buildSummary?: unknown;
    };
    const records = pickFeedback(feedbackFixtures, body.feedbackIds, {
      required: true,
    });
    if (records instanceof Response) return records;
    const opportunity = body.opportunity as ImprovementOpportunity | undefined;
    if (!opportunity?.title || !Array.isArray(opportunity.designDirection)) {
      return Response.json(
        { error: 'opportunity must be a synthesized improvement opportunity.' },
        { status: 400 },
      );
    }
    const poolCents =
      typeof body.poolCents === 'number' &&
      Number.isSafeInteger(body.poolCents) &&
      body.poolCents > 0
        ? body.poolCents
        : undefined;
    return Response.json({
      ledger: await rewardContributors(records, opportunity, {
        poolCents,
        buildSummary:
          typeof body.buildSummary === 'string'
            ? body.buildSummary.slice(0, 2000)
            : undefined,
      }),
    });
  } catch (error) {
    return agentErrorResponse(error);
  }
}
