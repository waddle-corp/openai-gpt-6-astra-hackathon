import shopper from '../../data/shopper-feedback.json' with { type: 'json' };
import compatibility from '../../data/feedback/synthetic-submissions.json' with { type: 'json' };
import {
  FEEDBACK_CONTRACT_VERSION,
  parseFeedbackRecords,
  type FeedbackRecord,
} from '../../contracts/feedback.ts';

export type { FeedbackRecord } from '../../contracts/feedback.ts';

// SYN-FB-01 is the rehearsal twin of the live demo submission (docs/compatibility-demo.md), so it is not a separate shopper.
export const feedbackFixtures: FeedbackRecord[] = [
  ...parseFeedbackRecords(shopper),
  ...parseFeedbackRecords(compatibility).filter(
    (record) => record.id !== 'SYN-FB-01',
  ),
];

export function findFeedback(id: string) {
  return feedbackFixtures.find((record) => record.id === id);
}

export function feedbackTargetPath(record: FeedbackRecord) {
  return (
    record.context.selectedPage?.path ?? record.journey.startPath ?? '/store'
  );
}

/** Minimal v1.1 record for free-text lab input; everything unknown stays null. */
export function labRecord(message: string, path = '/store'): FeedbackRecord {
  return {
    contractVersion: FEEDBACK_CONTRACT_VERSION,
    id: `LAB-${Date.now()}`,
    createdAt: new Date().toISOString(),
    source: {
      kind: 'synthetic',
      producer: 'feedback-lab',
      datasetId: null,
      channel: 'lab',
    },
    sessionId: null,
    feedback: {
      message,
      category: null,
      responses: [],
      summary: null,
      questionSource: null,
    },
    context: {
      focus: {
        scope: path.startsWith('/store') ? 'legacy_page' : 'overall',
        eventIds: [],
      },
      selectedPage: path.startsWith('/store') ? { path, title: null } : null,
      relatedProductHandles: [],
      cart: null,
    },
    journey: {
      evidence: 'synthetic',
      viewport: 'unknown',
      startPath: null,
      events: [],
    },
    purchase: {
      status: 'unknown',
      orderReference: null,
      completedAt: null,
      cart: null,
    },
    rewardPreference: null,
    review: { status: 'pending_review', dueAt: null },
  };
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// ponytail: one line per event is enough context for triage and replay; raw JSON if Astra needs coordinates.
export function journeySummary(journey: FeedbackRecord['journey']) {
  const events = journey.events.map((event) => {
    const detail = event.target ?? event.value ?? event.keys?.join('+') ?? '';
    const value = event.target && event.value ? ` "${event.value}"` : '';
    const move =
      event.destinationPath && event.destinationPath !== event.path
        ? ` -> ${event.destinationPath}`
        : '';
    return `${event.sequence}. ${event.type}${detail ? ` "${detail}"` : ''}${value}${event.scrollY ? ` ${event.scrollY}px` : ''} @ ${event.path}${move}`;
  });
  return [
    `Recorded shopper journey (${journey.evidence}, ${journey.viewport}${journey.startPath ? `, started at ${journey.startPath}` : ''}):`,
    ...events,
  ].join('\n');
}

export function recordContext(record: FeedbackRecord) {
  const lines = [
    `Feedback record: ${record.id} (${record.source.channel}, ${record.source.kind})`,
  ];
  lines.push(`Customer feedback scope: ${record.context.focus.scope}`);
  if (record.context.focus.eventIds.length) {
    lines.push(
      `Customer-selected journey event IDs: ${record.context.focus.eventIds.join(', ')}`,
    );
    for (const event of record.journey.events.filter((event) =>
      record.context.focus.eventIds.includes(event.id),
    )) {
      lines.push(
        `Selected moment ${event.id}: ${event.type} @ ${event.path}${event.target ? ` (${event.target})` : ''}`,
      );
    }
  }
  if (record.feedback.summary)
    lines.push(
      `Customer-approved feedback summary: ${record.feedback.summary}`,
    );
  const page = record.context.selectedPage;
  if (page)
    lines.push(
      `Page the shopper singled out: ${page.title ?? page.path} (${page.path})`,
    );
  if (record.context.relatedProductHandles.length)
    lines.push(
      `Products in context: ${record.context.relatedProductHandles.join(', ')}`,
    );
  if (record.feedback.category)
    lines.push(`Customer-selected category: ${record.feedback.category}`);
  for (const response of record.feedback.responses)
    lines.push(`Q: ${response.question} A: ${response.answer}`);
  const cart = record.context.cart;
  if (cart)
    lines.push(
      `Cart at submission: ${cart.items.map((item) => `${item.quantity}x ${item.productTitle}`).join(', ') || 'empty'} (${dollars(cart.totalCents)})`,
    );
  if (record.purchase.status !== 'unknown')
    lines.push(
      `Purchase: ${record.purchase.status}${record.purchase.cart ? ` ${dollars(record.purchase.cart.totalCents)}` : ''}`,
    );
  if (record.journey.events.length) lines.push(journeySummary(record.journey));
  return lines;
}
