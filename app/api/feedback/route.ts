import { isAcceptedTriage, startComputerUse, triageFeedback } from '@/agents';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      feedback?: unknown;
      targetUrl?: unknown;
      inspect?: unknown;
    };
    const feedback = typeof body.feedback === 'string' ? body.feedback.trim() : '';
    const targetUrl = typeof body.targetUrl === 'string' ? body.targetUrl.trim() : '';
    if (!feedback) {
      return Response.json({ error: 'feedback is required.' }, { status: 400 });
    }
    if (feedback.length > 4000) {
      return Response.json({ error: 'feedback must be 4,000 characters or fewer.' }, { status: 400 });
    }

    const triage = await triageFeedback(feedback, targetUrl);
    if (!isAcceptedTriage(triage) || body.inspect !== true) {
      return Response.json({ triage });
    }

    const computer = await startComputerUse(feedback, targetUrl);
    return Response.json({ triage, computer });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected agent error.';
    const status = message.includes('OPENAI_API_KEY') ? 503 : 502;
    return Response.json({ error: message }, { status });
  }
}
