import { runnerProxy } from '@/lib/runner-proxy';

export function GET() {
  return runnerProxy('/builds');
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { opportunity?: unknown; liveOrigin?: unknown };
  if (!body.opportunity || typeof body.opportunity !== 'object') {
    return Response.json({ error: 'opportunity is required.' }, { status: 400 });
  }
  return runnerProxy('/builds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      opportunity: body.opportunity,
      liveOrigin: typeof body.liveOrigin === 'string' ? body.liveOrigin : new URL(request.url).origin,
    }),
  });
}
