'use client';
import { useRef, useState, useSyncExternalStore, useEffect } from 'react';
import {
  ArrowRight,
  Check,
  Sparkles,
  LoaderCircle,
  Clock3,
  MapPin,
  MessageCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  getFeedbackState,
  serverFeedbackState,
  subscribeFeedback,
  setFeedbackConsent,
  updateFeedbackDraft,
  submitFeedback,
} from '@/lib/feedback-storage';
import { journeyMoments, type FeedbackCartItem } from '@/lib/feedback';
import {
  preparedConversation,
  suggestFocus,
  type ConversationReply,
  type ConversationTurn,
} from '@/lib/feedback-conversation';

export function FeedbackCheckout({
  orderTotalCents,
  cartSnapshot,
}: {
  orderTotalCents: number;
  cartSnapshot: FeedbackCartItem[];
}) {
  const state = useSyncExternalStore(
    subscribeFeedback,
    getFeedbackState,
    serverFeedbackState,
  );
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState<ConversationReply | null>(null);
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [summary, setSummary] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  if (!state) return null;
  const { session } = state;
  const receipt = session.receipt;
  const moments = journeyMoments(session.events);
  const selected = moments.filter((m) =>
    m.eventIds.some((id) => ids.includes(id)),
  );
  const inspected = moments.find((m) => m.id === inspectedId);
  const anchor = selected.at(-1);
  async function advance(
    nextTurns: ConversationTurn[],
    focus = ids,
    message = note,
  ) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    setConfirmed(false);
    setTurns(nextTurns);
    updateFeedbackDraft({
      questions: nextTurns.map((t) => t.question),
      answers: Object.fromEntries(
        nextTurns.map((t) => [t.question.id, t.answer]),
      ),
      note: message,
      selectedIds: focus,
      selected: session.events.find((e) => focus.includes(e.id)),
      focus: focus.length ? 'specific_moments' : 'overall',
      category: 'Something else',
      conversational: true,
      approvedSummary: undefined,
    });
    const timer = setTimeout(() => controller.abort(), 50000);
    try {
      const response = await fetch('/api/feedback/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          events: session.events,
          cart: cartSnapshot,
          turns: nextTurns,
          note: message,
          focusIds: focus,
        }),
      });
      if (!response.ok) throw Error();
      const result: ConversationReply = await response.json();
      if (request.current !== controller) return;
      setReply(result);
      setSummary(result.summary);
      if (!result.question)
        updateFeedbackDraft({ approvedSummary: result.summary });
      updateFeedbackDraft({
        questionSource: result.source,
        step: result.question ? 'questions' : 'review',
      });
    } catch {
      if (request.current !== controller) return;
      const result = preparedConversation(
        session.events,
        cartSnapshot,
        nextTurns,
        message,
        focus,
      );
      setReply(result);
      setSummary(result.summary);
      if (!result.question)
        updateFeedbackDraft({ approvedSummary: result.summary });
      setError(
        'Live assistance is unavailable. You can continue with the guided preview.',
      );
      updateFeedbackDraft({
        questionSource: 'prepared',
        step: result.question ? 'questions' : 'review',
      });
    } finally {
      clearTimeout(timer);
      if (request.current === controller) setBusy(false);
    }
  }
  function changeOpen(value: boolean) {
    setOpen(value);
    if (!value) {
      request.current?.abort();
      request.current = null;
      setBusy(false);
      return;
    }
    if (receipt || session.consent !== 'accepted') return;
    const focus = session.draft.conversational
      ? (session.draft.selectedIds ?? [])
      : suggestFocus(session.events, cartSnapshot);
    const saved = session.draft.conversational
      ? session.draft.questions
          .filter((q) => session.draft.answers[q.id])
          .map((question) => ({
            question,
            answer: session.draft.answers[question.id],
          }))
      : [];
    setIds(focus);
    setNote(session.draft.conversational ? session.draft.note : '');
    setManual(false);
    setInspectedId(null);
    if (saved.length === 2 && session.draft.approvedSummary) {
      const restored = preparedConversation(
        session.events,
        cartSnapshot,
        saved,
        session.draft.note,
        focus,
      );
      setTurns(saved);
      setSummary(session.draft.approvedSummary);
      setConfirmed(false);
      setReply({
        ...restored,
        source: session.draft.questionSource,
        summary: session.draft.approvedSummary,
      });
      return;
    }
    void advance(
      saved,
      focus,
      session.draft.conversational ? session.draft.note : '',
    );
  }
  function apply() {
    try {
      updateFeedbackDraft({ approvedSummary: summary.trim() });
      submitFeedback(orderTotalCents, cartSnapshot);
      changeOpen(false);
    } catch {
      setError(
        'Your feedback could not be saved. Your answers are still here; please try again.',
      );
    }
  }
  return (
    <section className="pf-checkout-entry" aria-label="Optional order feedback">
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogTrigger className="pf-checkout-toggle">
          <span className="pf-checkout-toggle-label">
            <strong>{receipt ? 'Feedback added' : 'Pay with feedback'}</strong>
            <small>
              {receipt
                ? 'Review within 72 hours'
                : 'Up to 10% off next time or 5% cashback'}
            </small>
          </span>
          {receipt ? <Check size={18} /> : <ArrowRight size={18} />}
        </DialogTrigger>
        <p className="pf-checkout-hint">
          {receipt
            ? 'Your feedback is attached. You can place your order below.'
            : 'A quick conversation about your shopping experience.'}
        </p>
        <DialogContent
          className="pf-dialog pf-conversation-dialog"
          showCloseButton
        >
          <header className="pf-dialog-header">
            <span className="pf-brand">Pay with your feedback</span>
          </header>
          <div className="pf-conversation-body">
            <DialogTitle className="pf-title">
              {receipt
                ? 'Thanks for sharing your experience.'
                : reply && !reply.question && !busy
                  ? 'Does this capture your experience?'
                  : 'Let’s make your next visit better.'}
            </DialogTitle>
            <DialogDescription className="pf-description">
              {receipt
                ? 'Your contribution will be reviewed within 72 hours.'
                : 'A couple of quick answers. We’ll connect the details.'}
            </DialogDescription>
            {receipt ? (
              <div className="pf-summary">
                <p>{receipt.summary}</p>
                <button
                  className="pf-primary"
                  onClick={() => changeOpen(false)}
                >
                  Back to checkout
                </button>
              </div>
            ) : session.consent !== 'accepted' ? (
              <div className="pf-summary">
                <p>
                  Allow us to use your store visits and product choices to help
                  you leave feedback. Your journey and answers may be processed
                  by AI. No payment details are recorded.
                </p>
                <button
                  className="pf-primary"
                  onClick={() => {
                    setFeedbackConsent('accepted');
                    setIds([]);
                    void advance([], [], '');
                  }}
                >
                  Count me in
                </button>
              </div>
            ) : (
              <div className="pf-journey-workspace">
                <aside
                  className="pf-timeline"
                  aria-label="Your shopping timeline"
                >
                  <div className="pf-timeline-heading">
                    <span className="pf-eyebrow">YOUR VISIT, CONNECTED</span>
                    <h3>
                      Your shopping journey <span>{moments.length}</span>
                    </h3>
                    <p>Recorded moments. A little context goes a long way.</p>
                  </div>
                  <ol className="pf-timeline-list">
                    {moments.map((m, index) => {
                      const related = selected.some((item) => item.id === m.id);
                      const active = anchor?.id === m.id;
                      return (
                        <li key={m.id} className={related ? 'is-related' : ''}>
                          <span className="pf-timeline-dot" aria-hidden="true">
                            {active ? <MessageCircle size={13} /> : index + 1}
                          </span>
                          <button
                            className="pf-timeline-card"
                            aria-pressed={inspectedId === m.id}
                            aria-label={`Explore ${m.page.title}: ${m.label}`}
                            onClick={() =>
                              setInspectedId(inspectedId === m.id ? null : m.id)
                            }
                          >
                            <div className="pf-timeline-card-top">
                              {m.page.image ? (
                                <img src={m.page.image} alt="" />
                              ) : (
                                <span className="pf-timeline-placeholder">
                                  <MapPin size={20} />
                                </span>
                              )}
                              <div>
                                <small>{m.label}</small>
                                <strong>{m.page.title}</strong>
                              </div>
                            </div>
                            {m.details.length > 0 && (
                              <ul>
                                {m.details.slice(-2).map((detail, i) => (
                                  <li key={i}>{detail}</li>
                                ))}
                              </ul>
                            )}
                            {related && (
                              <span className="pf-moment-status">
                                {busy
                                  ? 'In focus'
                                  : active
                                    ? 'Conversation starts here'
                                    : 'Connected moment'}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                  {!moments.length && (
                    <p className="pf-timeline-empty">
                      No earlier moments recorded. We can still talk about your
                      visit.
                    </p>
                  )}
                  {turns.length > 0 && (
                    <div className="pf-timeline-confirmed">
                      <span className="pf-eyebrow">WHAT YOU SHARED</span>
                      <p>
                        About{' '}
                        {selected.length
                          ? `${selected.length} connected moment${selected.length === 1 ? '' : 's'}`
                          : 'your visit'}
                      </p>
                      {turns.map((turn) => (
                        <div key={turn.question.id}>
                          <Check size={14} />
                          <span>{turn.answer}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="pf-timeline-caption">
                    Product images illustrate your visits.
                  </p>
                </aside>
                <section
                  className="pf-active-conversation"
                  aria-label="Feedback conversation"
                  aria-busy={busy}
                >
                  {inspected && (
                    <div className="pf-moment-explorer">
                      <span className="pf-eyebrow">EXPLORE THIS MOMENT</span>
                      <strong>{inspected.page.title}</strong>
                      <p>{inspected.details.join('. ') || inspected.label}</p>
                      <button
                        className="pf-text"
                        onClick={() => setInspectedId(null)}
                      >
                        Keep current conversation
                      </button>
                      <button
                        className="pf-primary"
                        disabled={busy}
                        onClick={() => {
                          setIds(inspected.eventIds);
                          setNote('');
                          setManual(false);
                          setInspectedId(null);
                          void advance([], inspected.eventIds, '');
                        }}
                      >
                        Start a new conversation here <ArrowRight size={16} />
                      </button>
                      {turns.length > 0 && (
                        <small>This replaces your current answers.</small>
                      )}
                    </div>
                  )}
                  <div className="pf-agent-label">
                    <span className="pf-agent-orb">
                      <Sparkles size={20} />
                    </span>
                    <div>
                      <strong>
                        {busy
                          ? 'Connecting your moments'
                          : reply?.source === 'astra'
                            ? 'Gentoo'
                            : 'Guided preview'}
                      </strong>
                      <small>
                        {busy
                          ? 'Reading your journey and responses'
                          : 'Let’s fill in the missing piece'}
                      </small>
                    </div>
                    <span className="pf-question-progress">
                      {!busy && reply && !reply.question
                        ? 'Review'
                        : `Question ${Math.min(turns.length + 1, 2)} of 2`}
                    </span>
                  </div>
                  {selected.length > 0 && (
                    <div className="pf-focus-context">
                      <span className="pf-eyebrow">CONNECTING THE DOTS</span>
                      <p>{selected.map((m) => m.page.title).join(' → ')}</p>
                    </div>
                  )}
                  {turns.length > 0 && (
                    <details className="pf-conversation-history">
                      <summary>
                        {turns.length === 1
                          ? turns[0].answer
                          : 'Your answers so far'}
                      </summary>
                      {turns.map((t) => (
                        <div key={t.question.id}>
                          <small>{t.question.prompt}</small>
                          <p>{t.answer}</p>
                        </div>
                      ))}
                    </details>
                  )}
                  {busy ? (
                    <div className="pf-agent-working" aria-live="polite">
                      <LoaderCircle className="pf-spin" size={20} />
                      <div>
                        <strong>
                          {turns.length === 0
                            ? 'Finding the moments that matter'
                            : turns.length === 1
                              ? 'Checking the product details'
                              : 'Putting your feedback into words'}
                        </strong>
                        <p>
                          {turns.length === 1
                            ? 'Looking up descriptions and options for these products.'
                            : 'Using your recorded journey and the answers you share.'}
                        </p>
                      </div>
                    </div>
                  ) : !manual && reply ? (
                    <>
                      {(reply.question || turns.length < 2) && (
                        <p className="pf-agent-observation">
                          {reply.observation}
                        </p>
                      )}
                      {reply.evidence.length > 0 && (
                        <details className="pf-evidence">
                          <summary>
                            Product details checked · {reply.evidence.length}{' '}
                            sources
                          </summary>
                          {reply.evidence.map((e) => (
                            <div key={e.path}>
                              <strong>{e.title}</strong>
                              <blockquote>{e.excerpt}</blockquote>
                            </div>
                          ))}
                        </details>
                      )}
                      {reply.question ? (
                        <div className="pf-agent-question">
                          <div className="pf-question-label">
                            <MessageCircle size={15} aria-hidden="true" />{' '}
                            Question {Math.min(turns.length + 1, 2)} of 2{' '}
                            <span>Choose one answer</span>
                          </div>
                          <h3>{reply.question.prompt}</h3>
                          <div className="pf-conversation-options">
                            {reply.question.options.map((answer, i) => (
                              <button
                                key={answer}
                                onClick={() => {
                                  if (answer === 'Something else') {
                                    setManual(true);
                                    return;
                                  }
                                  void advance([
                                    ...turns,
                                    { question: reply.question!, answer },
                                  ]);
                                }}
                              >
                                <span>{answer}</span>
                                <span aria-hidden="true">{i + 1}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="pf-conversation-review">
                          <label htmlFor="feedback-summary">
                            Your feedback
                          </label>
                          <textarea
                            id="feedback-summary"
                            value={summary}
                            maxLength={1200}
                            onChange={(e) => {
                              setSummary(e.target.value);
                              updateFeedbackDraft({
                                approvedSummary: e.target.value,
                              });
                              setConfirmed(false);
                            }}
                          />
                          <p className="pf-footnote">
                            Adjust anything that doesn’t sound like you.
                          </p>
                          {!confirmed ? (
                            <button
                              className="pf-primary"
                              disabled={!summary.trim()}
                              onClick={() => setConfirmed(true)}
                            >
                              That’s right <Check size={17} />
                            </button>
                          ) : (
                            <>
                              <h3>How would you like to be rewarded?</h3>
                              <div className="pf-conversation-options">
                                {(['coupon', 'card_cashback'] as const).map(
                                  (reward) => (
                                    <button
                                      key={reward}
                                      aria-pressed={
                                        session.draft.reward === reward
                                      }
                                      onClick={() =>
                                        updateFeedbackDraft({ reward })
                                      }
                                    >
                                      <span>
                                        {reward === 'coupon'
                                          ? 'Up to 10% off my next purchase'
                                          : 'Up to 5% back to my payment card'}
                                      </span>
                                      {session.draft.reward === reward && (
                                        <Check size={18} />
                                      )}
                                    </button>
                                  ),
                                )}
                              </div>
                              <p className="pf-reward-explainer">
                                Rewards depend on your actual contribution. Your
                                order total stays the same today.
                              </p>
                              <p className="pf-review-time">
                                <Clock3 size={17} />
                                Reviewed within 72 hours.
                              </p>
                              <button
                                className="pf-primary"
                                disabled={!session.draft.reward}
                                onClick={apply}
                              >
                                Submit feedback <ArrowRight size={17} />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </>
                  ) : null}
                  {manual && !busy && (
                    <div className="pf-manual-context">
                      <h3>Tell us about a different experience</h3>
                      <p>
                        Choose any related moments, or leave them empty for your
                        overall visit.
                      </p>
                      <div className="pf-manual-moments">
                        {moments.map((m) => (
                          <button
                            key={m.id}
                            aria-pressed={ids.includes(m.id)}
                            onClick={() =>
                              setIds(
                                ids.includes(m.id)
                                  ? ids.filter((id) => !m.eventIds.includes(id))
                                  : [...new Set([...ids, ...m.eventIds])],
                              )
                            }
                          >
                            {m.page.title}
                            <small>{m.label}</small>
                          </button>
                        ))}
                      </div>
                      <label htmlFor="feedback-note">What happened?</label>
                      <textarea
                        id="feedback-note"
                        placeholder="I was trying to…"
                        value={note}
                        maxLength={500}
                        onChange={(e) => setNote(e.target.value)}
                      />
                      <button
                        className="pf-primary"
                        disabled={!note.trim()}
                        onClick={() => {
                          setManual(false);
                          void advance([], ids, note);
                        }}
                      >
                        Talk about this <ArrowRight size={17} />
                      </button>
                    </div>
                  )}
                  {!busy && (
                    <button
                      className="pf-text pf-change-topic"
                      onClick={() => {
                        setManual(!manual);
                        setConfirmed(false);
                      }}
                    >
                      {' '}
                      {manual
                        ? 'Back to conversation'
                        : 'I have other feedback to share'}
                    </button>
                  )}
                  {error && (
                    <p className="pf-warning" aria-live="polite">
                      {error}
                    </p>
                  )}
                  {!busy && reply?.source === 'prepared' && (
                    <p className="pf-footnote">
                      Live AI isn’t connected for this conversation. These
                      prompts are a guided preview.
                    </p>
                  )}
                </section>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
