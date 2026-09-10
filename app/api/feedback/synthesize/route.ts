import { feedbackFixtures, synthesizeOpportunity } from '@/agents';
import { agentErrorResponse, pickFeedback } from '@/lib/agent-response';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      feedbackIds?: unknown;
      focus?: unknown;
    };
    const records = pickFeedback(feedbackFixtures, body.feedbackIds, {
      required: true,
    });
    if (records instanceof Response) return records;
    const focus =
      typeof body.focus === 'string'
        ? body.focus.trim().slice(0, 500)
        : undefined;
    return Response.json({
      opportunity: await synthesizeOpportunity(records, focus || undefined),
      feedbackIds: records.map((record) => record.id),
    });
  } catch (error) {
    return agentErrorResponse(error);
  }
}
