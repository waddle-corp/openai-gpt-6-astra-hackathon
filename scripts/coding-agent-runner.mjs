// Local runner for the Astra coding agent. API routes run inside workerd and cannot
// spawn git, Chrome, or npm, so app/api/build proxies to this Node process.
// Start: npm run agent:runner   (reads OPENAI_API_KEY from .env via --env-file-if-exists)
import { createServer } from 'node:http';
import { decide, getBuild, listBuilds, loadBuilds, startBuild, summarize } from '../agents/coding-agent/build.ts';

const port = Number(process.env.ASTRA_RUNNER_PORT) || 3100;
loadBuilds();

const json = (response, status, body) => {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
};

const readBody = (request) =>
  new Promise((resolve, reject) => {
    let data = '';
    request.on('data', (chunk) => (data += chunk));
    request.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
  });

createServer(async (request, response) => {
  const url = new URL(request.url, `http://localhost:${port}`);
  const [, resource, id, action] = url.pathname.split('/');
  try {
    if (resource !== 'builds') return json(response, 404, { error: 'Not found.' });
    if (request.method === 'GET' && !id) return json(response, 200, { builds: listBuilds().map(summarize) });
    if (request.method === 'GET' && id) {
      const build = getBuild(id);
      return build ? json(response, 200, { build }) : json(response, 404, { error: 'Unknown build.' });
    }
    if (request.method === 'POST' && !id) {
      const body = await readBody(request);
      if (!body.opportunity?.title || !body.opportunity?.buildBrief) {
        return json(response, 400, { error: 'opportunity with title and buildBrief is required.' });
      }
      const build = startBuild(body.opportunity, body.liveOrigin || 'http://localhost:3000');
      return json(response, 202, { build: summarize(build) });
    }
    if (request.method === 'POST' && id && action === 'decision') {
      const body = await readBody(request);
      const build = await decide(id, body.decision, body.note);
      return json(response, 200, { build: summarize(build) });
    }
    return json(response, 405, { error: 'Method not allowed.' });
  } catch (error) {
    return json(response, 400, { error: error instanceof Error ? error.message : String(error) });
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Astra coding-agent runner on http://127.0.0.1:${port} (OPENAI_API_KEY ${process.env.OPENAI_API_KEY ? 'present' : 'missing'})`);
});
