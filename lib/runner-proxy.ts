// API routes run in workerd; the coding-agent runner is a local Node process.
const RUNNER_URL = process.env.ASTRA_RUNNER_URL || 'http://127.0.0.1:3100';

export async function runnerProxy(path: string, init?: RequestInit) {
  try {
    const response = await fetch(`${RUNNER_URL}${path}`, init);
    return new Response(response.body, { status: response.status, headers: { 'Content-Type': 'application/json' } });
  } catch {
    return Response.json(
      { error: 'The coding-agent runner is not running. Start it with `npm run agent:runner`.' },
      { status: 503 },
    );
  }
}
