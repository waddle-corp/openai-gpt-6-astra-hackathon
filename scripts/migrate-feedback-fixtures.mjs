import { readFile, writeFile } from 'node:fs/promises';
import { customerFeedbackRecord } from '../lib/feedback-adapters.ts';
import { parseFeedbackRecords } from '../contracts/feedback.ts';

const shopperPath = new URL('../data/shopper-feedback.json', import.meta.url);
const compatibilityPath = new URL(
  '../data/feedback/synthetic-submissions.json',
  import.meta.url,
);
const write = (url, value) =>
  writeFile(url, `${JSON.stringify(value, null, 2)}\n`);
const shopper = JSON.parse(await readFile(shopperPath, 'utf8'));
if (!Array.isArray(shopper)) {
  // Deliberately separate author annotations from analyst input.
  const labels = shopper.feedback.map((record) => ({
    feedbackId: record.id,
    topic: record.topic,
    priority: record.priority,
    sentiment: record.sentiment,
    originalStatus: record.status,
  }));
  const records = shopper.feedback.map((record) => ({
    contractVersion: '1.0',
    id: record.id,
    createdAt: record.createdAt,
    source: {
      kind: 'synthetic',
      producer: 'shopper-feedback-fixtures',
      datasetId: 'shopper-feedback-2026-09-10',
      channel: record.channel,
    },
    sessionId: null,
    feedback: {
      message: record.message,
      category: null,
      responses: [],
      summary: null,
      questionSource: null,
    },
    context: {
      selectedPage: record.productHandle
        ? {
            path: `/store/products/${record.productHandle}`,
            title: record.productTitle,
          }
        : null,
      relatedProductHandles: record.productHandle ? [record.productHandle] : [],
      cart: null,
    },
    journey: {
      evidence: 'synthetic',
      viewport: record.journey.viewport ?? 'unknown',
      startPath: record.journey.startPath ?? null,
      events: record.journey.steps.map((step, index) => ({
        id: `${record.id}-event-${index + 1}`,
        sequence: index + 1,
        occurredAt: null,
        type: step.action,
        path: step.path,
        destinationPath: step.toPath ?? null,
        target: step.target ?? null,
        value: step.text ?? null,
        keys: step.keys ?? null,
        button: step.button ?? null,
        direction: step.direction ?? null,
        scrollY: step.scrollY ?? null,
        image: null,
      })),
    },
    purchase: {
      status: 'unknown',
      orderReference: null,
      completedAt: null,
      cart: null,
    },
    rewardPreference: null,
    review: { status: 'pending_review', dueAt: null },
  }));
  parseFeedbackRecords(records);
  await write(
    new URL('../evaluation/feedback/shopper-labels.json', import.meta.url),
    {
      purpose:
        'Author labels for evaluation only. Never include in analyst input.',
      cases: labels,
    },
  );
  await write(shopperPath, records);
} else parseFeedbackRecords(shopper);

const compatibility = JSON.parse(await readFile(compatibilityPath, 'utf8'));
const records = compatibility.map((record) =>
  record.contractVersion ? record : customerFeedbackRecord(record),
);
parseFeedbackRecords(records);
await write(compatibilityPath, records);
console.log(
  'Both fixture files now contain FeedbackRecord v1.0 arrays; unknown evidence stays null.',
);
