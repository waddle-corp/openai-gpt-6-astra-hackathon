'use client';
import {
  parseFeedbackRecords,
  type FeedbackRecord,
} from '../contracts/feedback.ts';
import {
  customerFeedbackRecord,
  normalizeStoredFeedback,
} from './feedback-adapters.ts';
import {
  emptyDraft,
  FEEDBACK_SUBMISSIONS_KEY,
  isRecordablePath,
  validFeedbackCart,
  feedbackSummary,
  selectedMomentIds,
  type FeedbackCartItem,
  type FeedbackDraft,
  type FeedbackSubmission,
  type JourneyEvent,
} from './feedback';

type Session = {
  id: string;
  consent: 'accepted' | 'declined' | null;
  startedAt: string;
  events: JourneyEvent[];
  draft: FeedbackDraft;
  receipt?: FeedbackSubmission;
  skipped?: boolean;
};
export type FeedbackState = { session: Session; persistent: boolean };
const SESSION_KEY = 'pay-feedback-session-v1';
let state: FeedbackState | null = null;
const listeners = new Set<() => void>();
function fresh(): Session {
  return {
    id: crypto.randomUUID(),
    consent: null,
    startedAt: new Date().toISOString(),
    events: [],
    draft: emptyDraft(),
  };
}
export function getFeedbackState(): FeedbackState {
  if (!state) {
    let session = fresh();
    let persistent = true;
    try {
      const parsed = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
      if (
        parsed?.id &&
        Array.isArray(parsed.events) &&
        parsed.draft &&
        Date.now() - Date.parse(parsed.startedAt) < 86400000
      )
        session = parsed;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      persistent = false;
    }
    state = { session, persistent };
  }
  return state;
}
export const serverFeedbackState = () => null;
export function subscribeFeedback(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function save(session: Session) {
  let persistent = true;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    persistent = false;
  }
  state = { session, persistent };
  listeners.forEach((listener) => listener());
}
export function setFeedbackConsent(consent: 'accepted' | 'declined') {
  const { session } = getFeedbackState();
  save({
    ...session,
    consent,
    ...(consent === 'declined' ? { events: [], draft: emptyDraft() } : {}),
  });
}
export function updateFeedbackDraft(patch: Partial<FeedbackDraft>) {
  const { session } = getFeedbackState();
  save({ ...session, draft: { ...session.draft, ...patch } });
}
export function recordJourney(event: Omit<JourneyEvent, 'id' | 'at'>) {
  const { session } = getFeedbackState();
  if (
    session.consent !== 'accepted' ||
    session.receipt ||
    session.skipped ||
    !isRecordablePath(event.path)
  )
    return;
  const last = session.events.at(-1);
  if (
    event.kind === 'page_view' &&
    last?.kind === 'page_view' &&
    last.path === event.path
  )
    return;
  save({
    ...session,
    events: [
      ...session.events,
      { ...event, id: crypto.randomUUID(), at: new Date().toISOString() },
    ].slice(-100),
  });
}
export function readFeedbackSubmissions(): FeedbackRecord[] {
  const parsed: unknown = JSON.parse(
    localStorage.getItem(FEEDBACK_SUBMISSIONS_KEY) ?? '[]',
  );
  if (!Array.isArray(parsed))
    throw new Error(
      'Saved feedback is unreadable. Export or reset the demo before retrying.',
    );
  const records = parseFeedbackRecords(parsed.map(normalizeStoredFeedback));
  // Validate all entries before replacing any legacy data. Preserve unknown data on error.
  if (parsed.some((record) => record?.contractVersion !== '1.1'))
    localStorage.setItem(FEEDBACK_SUBMISSIONS_KEY, JSON.stringify(records));
  return records;
}
export function submitFeedback(
  orderTotalCents: number,
  cartSnapshot: FeedbackCartItem[],
) {
  const { session } = getFeedbackState();
  if (session.receipt) return session.receipt;
  const draft = session.draft;
  const selectedIds = selectedMomentIds(draft);
  if (
    !validFeedbackCart(cartSnapshot) ||
    !cartSnapshot.length ||
    cartSnapshot.reduce(
      (sum, item) => sum + item.quantity * item.unitPriceCents,
      0,
    ) !== orderTotalCents
  )
    throw new Error('Invalid cart snapshot.');
  if (
    session.consent !== 'accepted' ||
    (draft.focus !== 'overall' &&
      (!selectedIds.length ||
        selectedIds.some(
          (id) => !session.events.some((event) => event.id === id),
        ))) ||
    !draft.reward ||
    !draft.category ||
    !draft.questions.length ||
    draft.questions.some((q) => !q.options.includes(draft.answers[q.id]))
  )
    throw new Error('Please finish the questions and choose a reward.');
  const now = new Date();
  const receipt: FeedbackSubmission = {
    schemaVersion: 2,
    conversational: draft.conversational,
    id: `FB-${crypto.randomUUID()}`,
    sessionId: session.id,
    submittedAt: now.toISOString(),
    reviewDueAt: new Date(now.getTime() + 72 * 3600000).toISOString(),
    status: 'pending_review',
    rewardPreference: draft.reward,
    orderTotalCents,
    cartSnapshot: structuredClone(cartSnapshot),
    journey: session.events,
    selectedScreen:
      draft.focus === 'overall'
        ? null
        : (session.events.find((event) => event.id === selectedIds[0]) ?? null),
    selection: {
      scope: draft.focus === 'overall' ? 'overall' : 'specific_moments',
      eventIds: selectedIds,
    },
    category: draft.category,
    note: draft.note.trim(),
    questions: draft.questions,
    answers: draft.answers,
    questionSource: draft.questionSource,
    summary: '',
    demo: true,
  };
  receipt.summary =
    draft.approvedSummary?.trim() || feedbackSummary(draft, session.events);
  // Write before confirming receipt. Storage failure must not look like success.
  const records = readFeedbackSubmissions();
  localStorage.setItem(
    FEEDBACK_SUBMISSIONS_KEY,
    JSON.stringify([
      ...records.filter((record) => record.sessionId !== session.id),
      customerFeedbackRecord(receipt),
    ]),
  );
  save({ ...session, receipt });
  window.dispatchEvent(new Event('pay-feedback-submitted'));
  return receipt;
}
export function linkFeedbackOrder(
  reference: string,
  items: FeedbackCartItem[],
) {
  const { session } = getFeedbackState();
  if (!session.receipt) return;
  if (!validFeedbackCart(items) || !items.length)
    throw new Error('Invalid order items.');
  const receipt = {
    ...session.receipt,
    orderReference: reference,
    completedOrder: {
      items: structuredClone(items),
      totalCents: items.reduce(
        (sum, item) => sum + item.quantity * item.unitPriceCents,
        0,
      ),
      completedAt: new Date().toISOString(),
    },
  };
  const records = readFeedbackSubmissions().map((record) =>
    record.id === receipt.id ? customerFeedbackRecord(receipt) : record,
  );
  localStorage.setItem(FEEDBACK_SUBMISSIONS_KEY, JSON.stringify(records));
  save({ ...session, receipt });
}
export function skipFeedback() {
  save({ ...getFeedbackState().session, skipped: true, draft: emptyDraft() });
}
export function resetFeedbackSession() {
  save(fresh());
}
