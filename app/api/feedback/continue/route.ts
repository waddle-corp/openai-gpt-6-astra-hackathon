import { continueComputerUse } from '@/agents';
import { agentErrorResponse } from '@/lib/agent-response';

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
    return agentErrorResponse(error);
  }
}
