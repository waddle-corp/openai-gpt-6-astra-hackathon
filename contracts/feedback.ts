/** Shared customer → merchant boundary. No UI, provider, or browser dependencies. */
export const FEEDBACK_CONTRACT_VERSION = '1.0' as const;
export type FeedbackCart = {
  currency: 'USD';
  capturedAt: string | null;
  totalCents: number;
  items: {
    variantId: string;
    productHandle: string;
    productTitle: string;
    variantTitle: string;
    quantity: number;
    unitPriceCents: number;
  }[];
};
export type FeedbackEvent = {
  id: string;
  sequence: number;
  occurredAt: string | null;
  type:
    | 'page_view'
    | 'variant_selected'
    | 'cart_added'
    | 'click'
    | 'type'
    | 'keypress'
    | 'scroll'
    | 'drag';
  path: string;
  destinationPath: string | null;
  target: string | null;
  value: string | null;
  keys: string[] | null;
  button: string | null;
  direction: string | null;
  scrollY: number | null;
  image: string | null;
};
export type FeedbackRecord = {
  contractVersion: typeof FEEDBACK_CONTRACT_VERSION;
  id: string;
  createdAt: string;
  source: {
    kind: 'demo_session' | 'synthetic';
    producer: string;
    datasetId: string | null;
    channel: string;
  };
  sessionId: string | null;
  feedback: {
    message: string;
    /** Customer-selected category only; never a model/fixture topic label. */
    category: string | null;
    responses: {
      id: string;
      question: string;
      options: string[];
      answer: string;
    }[];
    summary: string | null;
    questionSource: 'prepared' | 'astra' | null;
  };
  context: {
    selectedPage: { path: string; title: string | null } | null;
    /** Context references, not assertions that products were abandoned or compatible. */
    relatedProductHandles: string[];
    cart: FeedbackCart | null;
  };
  journey: {
    evidence: 'demo_recording' | 'synthetic';
    viewport: 'desktop' | 'mobile' | 'unknown';
    startPath: string | null;
    events: FeedbackEvent[];
  };
  purchase: {
    status: 'completed_demo' | 'not_completed' | 'unknown';
    orderReference: string | null;
    completedAt: string | null;
    cart: FeedbackCart | null;
  };
  rewardPreference: 'coupon' | 'card_cashback' | null;
  review: { status: 'pending_review'; dueAt: string | null };
};

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
const string = (value: unknown): value is string => typeof value === 'string';
const nullableString = (value: unknown) => value === null || string(value);
const timestamp = (value: unknown) =>
  string(value) &&
  /(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
  Number.isFinite(Date.parse(value));
const nullableTime = (value: unknown) => value === null || timestamp(value);
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(string);
const path = (value: unknown) =>
  string(value) &&
  (value === '/store' || value.startsWith('/store/')) &&
  !value.includes('://');
function keys(value: Record<string, unknown>, names: string[]) {
  return (
    Object.keys(value).length === names.length &&
    names.every((name) => name in value)
  );
}
function cart(value: unknown): boolean {
  if (value === null) return true;
  if (
    !object(value) ||
    !keys(value, ['currency', 'capturedAt', 'totalCents', 'items']) ||
    value.currency !== 'USD' ||
    !nullableTime(value.capturedAt) ||
    !Number.isSafeInteger(value.totalCents) ||
    !Array.isArray(value.items)
  )
    return false;
  let total = 0;
  const variants = new Set<string>();
  for (const item of value.items) {
    if (
      !object(item) ||
      !keys(item, [
        'variantId',
        'productHandle',
        'productTitle',
        'variantTitle',
        'quantity',
        'unitPriceCents',
      ]) ||
      !['variantId', 'productHandle', 'productTitle', 'variantTitle'].every(
        (key) => string(item[key]) && item[key].length > 0,
      ) ||
      !Number.isSafeInteger(item.quantity) ||
      Number(item.quantity) < 1 ||
      !Number.isSafeInteger(item.unitPriceCents) ||
      Number(item.unitPriceCents) < 0
    )
      return false;
    const id = item.variantId as string;
    if (variants.has(id)) return false;
    variants.add(id);
    total += Number(item.quantity) * Number(item.unitPriceCents);
  }
  return Number.isSafeInteger(total) && total === value.totalCents;
}

/** Strict boundary validation also prevents fixture labels leaking into model input. */
export function assertFeedbackRecord(
  value: unknown,
): asserts value is FeedbackRecord {
  const fail = () => {
    throw new Error('Invalid FeedbackRecord v1.0');
  };
  if (
    !object(value) ||
    !keys(value, [
      'contractVersion',
      'id',
      'createdAt',
      'source',
      'sessionId',
      'feedback',
      'context',
      'journey',
      'purchase',
      'rewardPreference',
      'review',
    ])
  )
    return fail();
  if (
    value.contractVersion !== FEEDBACK_CONTRACT_VERSION ||
    !string(value.id) ||
    !value.id ||
    !timestamp(value.createdAt) ||
    !nullableString(value.sessionId)
  )
    return fail();
  const { source, feedback, context, journey, purchase, review } = value;
  if (
    !object(source) ||
    !keys(source, ['kind', 'producer', 'datasetId', 'channel']) ||
    !['demo_session', 'synthetic'].includes(String(source.kind)) ||
    !string(source.producer) ||
    !source.producer ||
    !nullableString(source.datasetId) ||
    !string(source.channel)
  )
    return fail();
  if (
    !object(feedback) ||
    !keys(feedback, [
      'message',
      'category',
      'responses',
      'summary',
      'questionSource',
    ]) ||
    !string(feedback.message) ||
    !nullableString(feedback.category) ||
    !nullableString(feedback.summary) ||
    ![null, 'prepared', 'astra'].includes(
      feedback.questionSource as string | null,
    ) ||
    !Array.isArray(feedback.responses)
  )
    return fail();
  const questionIds = new Set<string>();
  for (const response of feedback.responses) {
    if (
      !object(response) ||
      !keys(response, ['id', 'question', 'options', 'answer']) ||
      !string(response.id) ||
      !response.id ||
      questionIds.has(response.id) ||
      !string(response.question) ||
      !strings(response.options) ||
      !response.options.length ||
      new Set(response.options).size !== response.options.length ||
      !string(response.answer) ||
      !response.options.includes(response.answer)
    )
      return fail();
    questionIds.add(response.id);
  }
  if (
    !object(context) ||
    !keys(context, ['selectedPage', 'relatedProductHandles', 'cart']) ||
    !strings(context.relatedProductHandles) ||
    !cart(context.cart)
  )
    return fail();
  if (
    context.selectedPage !== null &&
    (!object(context.selectedPage) ||
      !keys(context.selectedPage, ['path', 'title']) ||
      !path(context.selectedPage.path) ||
      !nullableString(context.selectedPage.title))
  )
    return fail();
  if (
    !object(journey) ||
    !keys(journey, ['evidence', 'viewport', 'startPath', 'events']) ||
    !['demo_recording', 'synthetic'].includes(String(journey.evidence)) ||
    !['desktop', 'mobile', 'unknown'].includes(String(journey.viewport)) ||
    !(journey.startPath === null || path(journey.startPath)) ||
    !Array.isArray(journey.events)
  )
    return fail();
  if ((source.kind === 'synthetic') !== (journey.evidence === 'synthetic'))
    return fail();
  const eventIds = new Set<string>();
  let lastTime = -Infinity;
  for (const [index, event] of journey.events.entries()) {
    if (
      !object(event) ||
      !keys(event, [
        'id',
        'sequence',
        'occurredAt',
        'type',
        'path',
        'destinationPath',
        'target',
        'value',
        'keys',
        'button',
        'direction',
        'scrollY',
        'image',
      ]) ||
      !string(event.id) ||
      !event.id ||
      eventIds.has(event.id) ||
      event.sequence !== index + 1 ||
      !nullableTime(event.occurredAt) ||
      ![
        'page_view',
        'variant_selected',
        'cart_added',
        'click',
        'type',
        'keypress',
        'scroll',
        'drag',
      ].includes(String(event.type)) ||
      !path(event.path) ||
      !(event.destinationPath === null || path(event.destinationPath)) ||
      !['target', 'value', 'button', 'direction', 'image'].every((key) =>
        nullableString(event[key]),
      ) ||
      !(event.keys === null || strings(event.keys)) ||
      !(
        event.scrollY === null ||
        (typeof event.scrollY === 'number' && Number.isFinite(event.scrollY))
      )
    )
      return fail();
    eventIds.add(event.id);
    if (event.occurredAt !== null) {
      const time = Date.parse(event.occurredAt as string);
      if (time < lastTime) return fail();
      lastTime = time;
    }
  }
  if (
    !object(purchase) ||
    !keys(purchase, ['status', 'orderReference', 'completedAt', 'cart']) ||
    !['completed_demo', 'not_completed', 'unknown'].includes(
      String(purchase.status),
    ) ||
    !nullableString(purchase.orderReference) ||
    !nullableTime(purchase.completedAt) ||
    !cart(purchase.cart)
  )
    return fail();
  if (purchase.status === 'completed_demo' && !purchase.orderReference)
    return fail();
  if (
    purchase.status !== 'completed_demo' &&
    (purchase.orderReference !== null ||
      purchase.completedAt !== null ||
      purchase.cart !== null)
  )
    return fail();
  if (
    ![null, 'coupon', 'card_cashback'].includes(
      value.rewardPreference as string | null,
    ) ||
    !object(review) ||
    !keys(review, ['status', 'dueAt']) ||
    review.status !== 'pending_review' ||
    !nullableTime(review.dueAt)
  )
    return fail();
}

export function parseFeedbackRecords(value: unknown): FeedbackRecord[] {
  if (!Array.isArray(value))
    throw new Error('Expected an array of FeedbackRecord v1.0');
  const ids = new Set<string>();
  for (const record of value) {
    assertFeedbackRecord(record);
    if (ids.has(record.id))
      throw new Error(`Duplicate feedback ID: ${record.id}`);
    ids.add(record.id);
  }
  return value;
}
