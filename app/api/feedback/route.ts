import {
  findFeedback,
  isAcceptedTriage,
  startComputerUse,
  triageFeedback,
} from '@/agents';
import {
  assertFeedbackRecord,
  type FeedbackRecord,
} from '@/contracts/feedback';
import { agentErrorResponse } from '@/lib/agent-response';

/** Accepts the shared FeedbackAnalysisRequest, or `feedbackId` to pick a fixture (optionally with an edited `message`). */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      feedback?: unknown;
      feedbackId?: unknown;
      message?: unknown;
      targetUrl?: unknown;
      inspect?: unknown;
    };
    const targetUrl =
      typeof body.targetUrl === 'string' ? body.targetUrl.trim() : '';

    let record: FeedbackRecord | undefined;
    if (typeof body.feedbackId === 'string') {
      const fixture = findFeedback(body.feedbackId);
      if (!fixture) {
        return Response.json(
          { error: 'feedbackId does not match the feedback fixtures.' },
          { status: 400 },
        );
      }
      const message =
        typeof body.message === 'string' && body.message.trim()
          ? body.message.trim()
          : fixture.feedback.message;
      record = { ...fixture, feedback: { ...fixture.feedback, message } };
    } else if (body.feedback !== undefined) {
      assertFeedbackRecord(body.feedback);
      record = body.feedback;
    }
    if (!record) {
      return Response.json(
        { error: 'feedback (FeedbackRecord v1.0) or feedbackId is required.' },
        { status: 400 },
      );
    }

    const triage = await triageFeedback(record, targetUrl);
    if (!isAcceptedTriage(triage) || body.inspect !== true) {
      return Response.json({ triage });
    }

    const computer = await startComputerUse(record, targetUrl);
    return Response.json({ triage, computer });
  } catch (error) {
    if (
      error instanceof Error &&
      /FeedbackRecord|contract/i.test(error.message)
    ) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return agentErrorResponse(error);
  }
}
