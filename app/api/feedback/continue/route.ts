import { continueComputerUse } from '@/agents';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      responseId?: unknown;
      callId?: unknown;
      screenshot?: unknown;
    };
    if (
      typeof body.responseId !== 'string' ||
      typeof body.callId !== 'string' ||
      typeof body.screenshot !== 'string'
    ) {
      return Response.json(
        { error: 'responseId, callId, and screenshot are required.' },
        { status: 400 },
      );
    }
    return Response.json(
      await continueComputerUse(body.responseId, body.callId, body.screenshot),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected agent error.';
    const status = message.includes('OPENAI_API_KEY') ? 503 : 502;
    return Response.json({ error: message }, { status });
  }
}
