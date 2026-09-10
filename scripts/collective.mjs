// Steps 2 and 3 from the terminal.
// Usage: node --experimental-strip-types scripts/collective.mjs prioritize
//        node --experimental-strip-types scripts/collective.mjs synthesize id,id,... [focus]
import {
  feedbackFixtures,
  prioritizeFeedback,
  synthesizeOpportunity,
} from '../agents/index.ts';

try {
  process.loadEnvFile('.env');
} catch {
  // openAiKey() reports the missing key.
}

const [command, idList, focus] = process.argv.slice(2);
if (command === 'prioritize') {
  const { opportunities, setAside } =
    await prioritizeFeedback(feedbackFixtures);
  console.table(
    opportunities.map(({ id, title, journeyStage, priority, feedbackIds }) => ({
      id,
      title,
      stage: journeyStage,
      priority,
      feedback: feedbackIds.join(' '),
    })),
  );
  for (const item of setAside)
    console.log(`set aside ${item.feedbackId}: ${item.reason}`);
} else if (command === 'synthesize' && idList) {
  const ids = new Set(idList.split(','));
  const records = feedbackFixtures.filter((record) => ids.has(record.id));
  if (records.length !== ids.size) throw new Error('Unknown feedback id.');
  console.log(
    JSON.stringify(await synthesizeOpportunity(records, focus), null, 2),
  );
} else {
  console.error(
    'Usage: collective.mjs prioritize | synthesize id,id,... [focus]',
  );
  process.exit(1);
}
