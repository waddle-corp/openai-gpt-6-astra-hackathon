import { isAcceptedTriage, parseTriage, triagePrompt } from '../agents/feedback-agent/triage.ts';

const result = parseTriage(JSON.stringify({
  decision: 'fit',
  score: 88,
  summary: 'The request reduces purchase uncertainty.',
  evidence: ['It concerns product compatibility.'],
  risks: [],
  nextStep: 'Inspect the product page.',
}));

if (!isAcceptedTriage(result) || isAcceptedTriage({ ...result, score: 69 }) || !triagePrompt('Test feedback').includes('Goal:')) {
  throw new Error('Agent self-check failed.');
}

console.log('Agent self-check passed.');
