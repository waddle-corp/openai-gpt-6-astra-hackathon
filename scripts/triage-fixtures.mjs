// Runs every record in data/shopper-feedback.json through the Astra strategy gate.
// Usage: node --experimental-strip-types scripts/triage-fixtures.mjs [storefront origin] [--json]
import {
  feedbackFixtures,
  feedbackTargetPath,
  isAcceptedTriage,
  triageFeedback,
} from '../agents/index.ts';

try {
  process.loadEnvFile('.env');
} catch {
  // openAiKey() reports the missing key.
}

const args = process.argv.slice(2);
const json = args.includes('--json');
const origin =
  args.find((arg) => !arg.startsWith('--')) ?? 'http://localhost:3000';

const results = [];
for (const record of feedbackFixtures) {
  const targetUrl = `${origin}${feedbackTargetPath(record)}`;
  const triage = await triageFeedback(record, targetUrl);
  results.push({ id: record.id, topic: record.topic, targetUrl, triage });
  console.error(`${record.id} ${triage.decision} ${triage.score}`);
}

if (json) {
  console.log(JSON.stringify(results, null, 2));
} else {
  console.table(
    results.map(({ id, topic, triage }) => ({
      id,
      topic,
      decision: triage.decision,
      score: triage.score,
      computerUse: isAcceptedTriage(triage) ? 'yes' : 'no',
    })),
  );
}
