import { runnerProxy } from '@/lib/runner-proxy';

type Context = { params: Promise<{ id: string }> };

const DECISIONS = ['publish', 'reject', 'request_change', 'draft'];

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  return runnerProxy(`/builds/${encodeURIComponent(id)}`);
}

export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { decision?: unknown; note?: unknown };
  if (typeof body.decision !== 'string' || !DECISIONS.includes(body.decision)) {
    return Response.json({ error: `decision must be one of ${DECISIONS.join(', ')}.` }, { status: 400 });
  }
  return runnerProxy(`/builds/${encodeURIComponent(id)}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision: body.decision, note: typeof body.note === 'string' ? body.note.slice(0, 2000) : undefined }),
  });
}
