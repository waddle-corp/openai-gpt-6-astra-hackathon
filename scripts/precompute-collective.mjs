// One live pass over the fixtures, cached for the demo so the page never waits on Astra.
// Usage: node --experimental-strip-types scripts/precompute-collective.mjs
import { writeFileSync } from 'node:fs';
import { embedFeedback } from '../agents/feedback-agent/embed.ts';
import { feedbackFixtures, prioritizeFeedback, rewardContributors, synthesizeOpportunity } from '../agents/index.ts';
import { strategy } from '../agents/shared/strategy.ts';

process.loadEnvFile('.env');

const [points, prioritization] = await Promise.all([
  embedFeedback(feedbackFixtures),
  prioritizeFeedback(feedbackFixtures),
]);
console.error(prioritization.opportunities.map((item) => `${item.priority} ${item.id} [${item.feedbackIds.join(' ')}]`).join('\n'));

const lead = prioritization.opportunities.find((item) => /compat/i.test(item.id + item.title)) ?? prioritization.opportunities[0];
const records = feedbackFixtures.filter((record) => lead.feedbackIds.includes(record.id));
const opportunity = await synthesizeOpportunity(records);
const reward = await rewardContributors(records, opportunity);

writeFileSync(
  'data/collective-cache.json',
  JSON.stringify({ generatedAt: new Date().toISOString(), goal: strategy.goal, points, prioritization, lead: lead.id, opportunities: { [lead.id]: opportunity }, reward }, null, 2) + '\n',
);
console.error(`cached lead=${lead.id} reward=${reward.contributions.length} contributors -> data/collective-cache.json`);
