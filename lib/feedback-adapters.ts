import {
  assertFeedbackRecord,
  type FeedbackRecord,
  type FeedbackEvent,
} from '../contracts/feedback.ts';
import type { FeedbackSubmission } from './feedback.ts';

export function customerFeedbackRecord(
  receipt: FeedbackSubmission,
): FeedbackRecord {
  const events: FeedbackEvent[] = receipt.journey.map((event, index) => ({
    id: event.id,
    sequence: index + 1,
    occurredAt: event.at,
    type: event.kind,
    path: event.path,
    destinationPath: null,
    target: event.title,
    value: event.detail ?? null,
    keys: null,
    button: null,
    direction: null,
    scrollY: null,
    image: event.image ?? null,
  }));
  const record: FeedbackRecord = {
    contractVersion: '1.0',
    id: receipt.id,
    createdAt: receipt.submittedAt,
    source: {
      kind: receipt.synthetic ? 'synthetic' : 'demo_session',
      producer: receipt.synthetic
        ? 'compatibility-fixtures'
        : 'customer-checkout',
      datasetId: receipt.synthetic ? 'compatibility-demo-2026-09-10' : null,
      channel: 'checkout',
    },
    sessionId: receipt.sessionId,
    feedback: {
      message: receipt.note,
      category: receipt.category,
      responses: receipt.questions.map((question) => ({
        id: question.id,
        question: question.prompt,
        options: [...question.options],
        answer: receipt.answers[question.id],
      })),
      summary: receipt.summary,
      questionSource: receipt.questionSource,
    },
    context: {
      selectedPage: {
        path: receipt.selectedScreen.path,
        title: receipt.selectedScreen.title,
      },
      relatedProductHandles: [
        ...new Set([
          ...receipt.journey
            .filter((event) => event.path.startsWith('/store/products/'))
            .map((event) => event.path.split('/').at(-1)!),
          ...(receipt.cartSnapshot ?? []).map((item) => item.productHandle),
        ]),
      ],
      cart: receipt.cartSnapshot
        ? {
            currency: 'USD',
            capturedAt: receipt.submittedAt,
            totalCents: receipt.orderTotalCents,
            items: structuredClone(receipt.cartSnapshot),
          }
        : null,
    },
    journey: {
      evidence: receipt.synthetic ? 'synthetic' : 'demo_recording',
      viewport: 'unknown',
      startPath: events[0]?.path ?? null,
      events,
    },
    purchase: {
      status: receipt.orderReference ? 'completed_demo' : 'not_completed',
      orderReference: receipt.orderReference ?? null,
      completedAt: receipt.completedOrder?.completedAt ?? null,
      cart: receipt.completedOrder
        ? {
            currency: 'USD',
            capturedAt: receipt.completedOrder.completedAt,
            totalCents: receipt.completedOrder.totalCents,
            items: structuredClone(receipt.completedOrder.items),
          }
        : null,
    },
    rewardPreference: receipt.rewardPreference,
    review: { status: 'pending_review', dueAt: receipt.reviewDueAt },
  };
  assertFeedbackRecord(record);
  return record;
}

/** For existing local v1/v2 checkout records only. Reject unknown versions. */
export function normalizeStoredFeedback(value: unknown): FeedbackRecord {
  if (value && typeof value === 'object' && 'contractVersion' in value) {
    assertFeedbackRecord(value);
    return value;
  }
  if (
    !value ||
    typeof value !== 'object' ||
    !('schemaVersion' in value) ||
    ![1, 2].includes(Number(value.schemaVersion))
  )
    throw new Error('Unsupported stored feedback version');
  return customerFeedbackRecord(value as FeedbackSubmission);
}
