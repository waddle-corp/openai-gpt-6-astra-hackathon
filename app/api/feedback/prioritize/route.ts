import { feedbackFixtures, prioritizeFeedback } from '@/agents';
import { agentErrorResponse, pickFeedback } from '@/lib/agent-response';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      feedbackIds?: unknown;
    };
    const records = pickFeedback(feedbackFixtures, body.feedbackIds);
    if (records instanceof Response) return records;
    return Response.json({
      prioritization: await prioritizeFeedback(records),
      count: records.length,
    });
  } catch (error) {
    return agentErrorResponse(error);
  }
}
