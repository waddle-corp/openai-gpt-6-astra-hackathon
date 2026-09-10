import { findFeedback, isAcceptedTriage, startComputerUse, triageFeedback } from '@/agents';
import { agentErrorResponse } from '@/lib/agent-response';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      feedback?: unknown;
      targetUrl?: unknown;
      inspect?: unknown;
      feedbackId?: unknown;
    };
    const feedback = typeof body.feedback === 'string' ? body.feedback.trim() : '';
    const targetUrl = typeof body.targetUrl === 'string' ? body.targetUrl.trim() : '';
    if (!feedback) {
      return Response.json({ error: 'feedback is required.' }, { status: 400 });
    }
    if (feedback.length > 4000) {
      return Response.json({ error: 'feedback must be 4,000 characters or fewer.' }, { status: 400 });
    }

    const fixture = typeof body.feedbackId === 'string' ? findFeedback(body.feedbackId) : undefined;
    if (typeof body.feedbackId === 'string' && !fixture) {
      return Response.json({ error: 'feedbackId does not match data/shopper-feedback.json.' }, { status: 400 });
    }
    // The edited text wins; the fixture only adds topic, product, and journey context.
    const record = { ...fixture, message: feedback };

    const triage = await triageFeedback(record, targetUrl);
    if (!isAcceptedTriage(triage) || body.inspect !== true) {
      return Response.json({ triage });
    }

    const computer = await startComputerUse(record, targetUrl);
    return Response.json({ triage, computer });
  } catch (error) {
    return agentErrorResponse(error);
  }
}
