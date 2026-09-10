'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import {
  ArrowRight,
  Check,
  Clock3,
  Gift,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  CreditCard,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  categories,
  emptyDraft,
  feedbackSummary,
  highlights,
  preparedQuestions,
  type FeedbackCartItem,
  validQuestions,
  type Reward,
} from '@/lib/feedback';
import {
  getFeedbackState,
  serverFeedbackState,
  subscribeFeedback,
  setFeedbackConsent,
  recordJourney,
  updateFeedbackDraft,
  submitFeedback,
  skipFeedback,
  resetFeedbackSession,
} from '@/lib/feedback-storage';

function useFeedback() {
  return useSyncExternalStore(
    subscribeFeedback,
    getFeedbackState,
    serverFeedbackState,
  );
}

function capturePage(path: string) {
  const main = document.querySelector('main');
  const image = main?.querySelector<HTMLImageElement>(
    '.product-main-image, .product-card img, img',
  );
  const src = image?.getAttribute('src');
  recordJourney({
    kind: 'page_view',
    path,
    title:
      path === '/store/search'
        ? 'Product search'
        : (
            main?.querySelector('h1')?.textContent?.trim() || 'Boosted USA'
          ).slice(0, 120),
    image: src?.startsWith('/media/') ? src : undefined,
  });
}

export function FeedbackRecorder() {
  const state = useFeedback();
  const pathname = usePathname();
  const [preferences, setPreferences] = useState(false);
  useEffect(() => {
    if (state?.session.consent !== 'accepted') return;
    const frame = requestAnimationFrame(() => capturePage(pathname));
    return () => cancelAnimationFrame(frame);
  }, [pathname, state?.session.consent]);
  if (!state) return null;
  const banner = state.session.consent === null || preferences;
  return (
    <>
      {banner && (
        <section
          className="pf-consent"
          aria-label="Shopping feedback participation"
        >
          <div className="pf-consent-icon">
            <MessageSquare size={24} />
          </div>
          <div className="pf-consent-copy">
            <strong>Your experience could pay you back.</strong>
            <p>
              Let us save the pages you visit and product choices to help you
              leave quick feedback at checkout. Your feedback and journey may be
              processed by AI. No screen video, typed searches, or payment
              details are recorded.
            </p>
            <small>
              Useful contributions can earn a coupon or card cashback. Rewards
              are reviewed within 72 hours.
            </small>
          </div>
          <div className="pf-consent-actions">
            <button
              className="pf-primary"
              onClick={() => {
                setFeedbackConsent('accepted');
                setPreferences(false);
              }}
            >
              Count me in <ArrowRight size={16} />
            </button>
            <button
              className="pf-text"
              onClick={() => {
                setFeedbackConsent('declined');
                setPreferences(false);
              }}
            >
              No thanks
            </button>
          </div>
        </section>
      )}
      <div className="pf-preferences">
        <button className="pf-text" onClick={() => setPreferences(true)}>
          <ShieldCheck size={14} /> Feedback preferences
        </button>
        <button
          className="pf-text"
          onClick={() => {
            resetFeedbackSession();
            setPreferences(false);
          }}
        >
          Restart feedback demo
        </button>
        <span>New session only · saved submissions stay</span>
      </div>
    </>
  );
}

function Choices({
  options,
  value,
  onChange,
  label,
}: {
  options: string[];
  value?: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <RadioGroup
      className="pf-choices"
      value={value ?? ''}
      onValueChange={(next) => onChange(String(next))}
      aria-label={label}
    >
      {options.map((option, index) => (
        <label
          className={`pf-choice ${value === option ? 'is-selected' : ''}`}
          key={option}
        >
          <RadioGroupItem value={option} className="pf-radio" />
          <span>{option}</span>
          <span className="pf-choice-number" aria-hidden="true">
            {value === option ? <Check size={16} /> : index + 1}
          </span>
        </label>
      ))}
    </RadioGroup>
  );
}

export function FeedbackCheckout({
  orderTotalCents,
  cartSnapshot,
}: {
  orderTotalCents: number;
  cartSnapshot: FeedbackCartItem[];
}) {
  const state = useFeedback();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [questionIndex, setQuestionIndex] = useState(0);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  if (!state) return null;
  const { session } = state;
  const draft = session.draft;
  const screens = highlights(session.events);
  const receipt = session.receipt;
  const question = draft.questions[questionIndex];
  const stepNumber =
    draft.step === 'journey' ? 1 : draft.step === 'review' ? 3 : 2;

  async function questions() {
    if (!draft.selected || loading) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    const timer = setTimeout(() => controller.abort(), 10000);
    let next = preparedQuestions(draft.category, draft.note);
    let source: 'prepared' | 'astra' = 'prepared';
    try {
      const response = await fetch('/api/feedback/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: draft.category,
          note: draft.note,
          selectedScreen: draft.selected,
          journey: session.events.slice(-30),
          cartSnapshot,
        }),
        signal: controller.signal,
      });
      if (response.ok) {
        const result = (await response.json()) as {
          questions?: unknown;
          source?: unknown;
        };
        if (validQuestions(result.questions)) {
          next = result.questions;
          source = result.source === 'astra' ? 'astra' : 'prepared';
        }
      }
    } catch {
      /* The prepared questions keep the demo usable offline. */
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
    if (request.current !== controller) return;
    updateFeedbackDraft({
      questions: next,
      answers: {},
      questionSource: source,
      step: 'questions',
    });
    setQuestionIndex(0);
  }
  function close(next: boolean) {
    setOpen(next);
    if (!next) {
      request.current?.abort();
      request.current = null;
      setLoading(false);
    }
  }
  function submit() {
    try {
      submitFeedback(orderTotalCents, cartSnapshot);
      setError('');
    } catch {
      setError(
        'We could not save your feedback. Allow browser storage and try again. Your answers are still here.',
      );
    }
  }
  return (
    <>
      <div className="pf-checkout-entry">
        <span className="pf-eyebrow">
          <Gift size={15} /> A little feedback. A little payback.
        </span>
        <button
          className="pf-primary"
          onClick={() => {
            setQuestionIndex(0);
            setOpen(true);
          }}
        >
          {receipt ? 'View your feedback' : 'Pay with your feedback'}{' '}
          <ArrowRight size={18} />
        </button>
        <p>
          {receipt
            ? 'Feedback received · reward review pending'
            : 'About 30 seconds. Choose a coupon or card cashback.'}
        </p>
        <small>
          Rewards depend on your contribution. Reviewed within 72 hours; no
          discount is applied today.
        </small>
      </div>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="pf-dialog">
          <header className="pf-dialog-header">
            <span className="pf-brand">
              <MessageSquare size={19} /> pay with your feedback
            </span>
            <span className="pf-demo-label">Demo</span>
          </header>
          <div className="pf-dialog-body">
            {receipt ? (
              <div className="pf-success">
                <span className="pf-success-icon">
                  <Check size={32} />
                </span>
                <DialogTitle className="pf-title">
                  You spotted it. We’ll take it from here.
                </DialogTitle>
                <DialogDescription className="pf-description">
                  Your feedback is saved in this demo. Continue checkout to
                  finish your purchase.
                </DialogDescription>
                <div className="pf-receipt">
                  <span>
                    <Clock3 size={19} /> Review within 72 hours
                  </span>
                  <p>
                    Reward eligibility and amount depend on how usefully your
                    feedback is incorporated.
                  </p>
                  <hr />
                  <span>
                    {receipt.rewardPreference === 'coupon' ? (
                      <Gift size={19} />
                    ) : (
                      <CreditCard size={19} />
                    )}
                    {receipt.rewardPreference === 'coupon'
                      ? 'Next-purchase coupon'
                      : 'Cashback to your payment card'}
                  </span>
                  <p>
                    {receipt.rewardPreference === 'coupon'
                      ? 'A discount toward your next order.'
                      : 'A partial refund of this purchase. Card processing can take longer after reward confirmation.'}
                  </p>
                </div>
                <small>
                  Reference {receipt.id.slice(0, 11).toUpperCase()} · No real
                  coupon or refund is issued in this demo.
                </small>
                <button className="pf-primary" onClick={() => close(false)}>
                  Continue checkout <ArrowRight size={18} />
                </button>
              </div>
            ) : session.consent !== 'accepted' ? (
              <>
                <DialogTitle className="pf-title">
                  Your experience, on your terms.
                </DialogTitle>
                <DialogDescription className="pf-description">
                  To share feedback, allow us to record the store pages you
                  visit and product choices. Recording starts only after you
                  agree. Your feedback and journey may be processed by AI;
                  payment details are never recorded.
                </DialogDescription>
                <button
                  className="pf-primary"
                  onClick={() => setFeedbackConsent('accepted')}
                >
                  Allow and continue
                </button>
                <button className="pf-text" onClick={() => close(false)}>
                  Return to checkout
                </button>
              </>
            ) : session.skipped ? (
              <>
                <DialogTitle className="pf-title">
                  Glad your shopping went smoothly.
                </DialogTitle>
                <DialogDescription className="pf-description">
                  No feedback is needed. You can continue with checkout.
                </DialogDescription>
                <button className="pf-primary" onClick={() => close(false)}>
                  Continue checkout
                </button>
              </>
            ) : (
              <>
                <div
                  className="pf-progress"
                  aria-label={`Step ${stepNumber} of 3`}
                >
                  <span className={stepNumber >= 1 ? 'active' : ''}>
                    01 Your journey
                  </span>
                  <span className={stepNumber >= 2 ? 'active' : ''}>
                    02 A quick question
                  </span>
                  <span className={stepNumber >= 3 ? 'active' : ''}>
                    03 Your reward
                  </span>
                </div>
                {!state.persistent && (
                  <output className="pf-warning">
                    Browser storage is unavailable. Keep this page open to
                    retain your answers.
                  </output>
                )}
                {draft.step === 'journey' && (
                  <>
                    <DialogTitle className="pf-title">
                      Where could shopping feel easier?
                    </DialogTitle>
                    <DialogDescription className="pf-description">
                      Pick one moment from your visit. A few taps can help us
                      make it better.
                    </DialogDescription>
                    {screens.length ? (
                      <>
                        <div className="pf-journey">
                          {screens.map((screen, index) => (
                            <button
                              key={screen.id}
                              className={`pf-screen ${draft.selected?.id === screen.id ? 'is-selected' : ''}`}
                              aria-pressed={draft.selected?.id === screen.id}
                              onClick={() =>
                                updateFeedbackDraft({
                                  ...emptyDraft(),
                                  selected: screen,
                                })
                              }
                            >
                              <div className="pf-screen-image">
                                {screen.image ? (
                                  <img src={screen.image} alt="" />
                                ) : (
                                  <MessageSquare size={36} />
                                )}
                                <span>
                                  {String(index + 1).padStart(2, '0')}
                                </span>
                              </div>
                              <div className="pf-screen-caption">
                                <small>
                                  {screen.path.includes('/products/')
                                    ? 'Product details'
                                    : screen.path.includes('/collections/')
                                      ? 'Collection'
                                      : screen.path.endsWith('/cart')
                                        ? 'Your cart'
                                        : 'Store page'}
                                </small>
                                <strong>{screen.title}</strong>
                                <span>
                                  {session.events.filter(
                                    (event) =>
                                      event.path === screen.path &&
                                      event.kind !== 'page_view',
                                  ).length
                                    ? 'You interacted here'
                                    : 'You visited this page'}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                        <p className="pf-footnote">
                          Highlights from your recorded visits · representative
                          page imagery
                        </p>
                      </>
                    ) : (
                      <div className="pf-empty">
                        <strong>No shopping moments saved yet.</strong>
                        <p>
                          Visit a product or collection after opting in, then
                          return here. We never reconstruct visits from before
                          your consent.
                        </p>
                        <a className="pf-primary" href="/store/collections/all">
                          Explore the store <ArrowRight size={16} />
                        </a>
                      </div>
                    )}
                    <div className="pf-actions">
                      <button
                        className="pf-text"
                        onClick={() => {
                          skipFeedback();
                        }}
                      >
                        Nothing felt difficult
                      </button>
                      <button
                        className="pf-primary"
                        disabled={!draft.selected}
                        onClick={() => updateFeedbackDraft({ step: 'pain' })}
                      >
                        This moment <ArrowRight size={16} />
                      </button>
                    </div>
                  </>
                )}
                {draft.step === 'pain' && (
                  <>
                    <DialogTitle className="pf-title">
                      What got in your way?
                    </DialogTitle>
                    <DialogDescription className="pf-description">
                      Thinking about {draft.selected?.title}. Pick the closest
                      match.
                    </DialogDescription>
                    <Choices
                      label="Type of difficulty"
                      options={categories}
                      value={draft.category}
                      onChange={(category) => updateFeedbackDraft({ category })}
                    />
                    <label className="pf-note">
                      Anything you want to add? <span>Optional</span>
                      <textarea
                        maxLength={500}
                        rows={2}
                        placeholder="A few words are plenty…"
                        value={draft.note}
                        onChange={(event) =>
                          updateFeedbackDraft({ note: event.target.value })
                        }
                      />
                    </label>
                    <div className="pf-actions">
                      <button
                        className="pf-text"
                        disabled={loading}
                        onClick={() => updateFeedbackDraft({ step: 'journey' })}
                      >
                        Back
                      </button>
                      <button
                        className="pf-primary"
                        disabled={!draft.category || loading}
                        onClick={() => void questions()}
                      >
                        {loading ? 'Preparing your questions…' : 'Continue'}{' '}
                        {!loading && <ArrowRight size={16} />}
                      </button>
                    </div>
                    <output className="pf-footnote">
                      {loading
                        ? 'Finding the details that will help us understand.'
                        : 'One or two quick follow-ups. No long review needed.'}
                    </output>
                  </>
                )}
                {draft.step === 'questions' && question && (
                  <>
                    <div className="pf-question-context">
                      <Sparkles size={16} />{' '}
                      {draft.questionSource === 'astra'
                        ? 'Astra follow-up'
                        : 'Quick follow-up'}
                      <span>
                        {questionIndex + 1} of {draft.questions.length}
                      </span>
                    </div>
                    <DialogTitle className="pf-title">
                      {question.prompt}
                    </DialogTitle>
                    <DialogDescription className="pf-description">
                      {draft.selected?.title} · {draft.category}
                    </DialogDescription>
                    <Choices
                      label={question.prompt}
                      options={question.options}
                      value={draft.answers[question.id]}
                      onChange={(answer) =>
                        updateFeedbackDraft({
                          answers: { ...draft.answers, [question.id]: answer },
                        })
                      }
                    />
                    <div className="pf-actions">
                      <button
                        className="pf-text"
                        onClick={() =>
                          questionIndex
                            ? setQuestionIndex(questionIndex - 1)
                            : updateFeedbackDraft({ step: 'pain' })
                        }
                      >
                        Back
                      </button>
                      <button
                        className="pf-primary"
                        disabled={!draft.answers[question.id]}
                        onClick={() =>
                          questionIndex + 1 < draft.questions.length
                            ? setQuestionIndex(questionIndex + 1)
                            : updateFeedbackDraft({ step: 'review' })
                        }
                      >
                        {questionIndex + 1 < draft.questions.length
                          ? 'Next question'
                          : 'Review feedback'}{' '}
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  </>
                )}
                {draft.step === 'review' && (
                  <>
                    <DialogTitle className="pf-title">
                      A better store starts here.
                    </DialogTitle>
                    <DialogDescription className="pf-description">
                      Check your feedback and choose how you’d like to be
                      rewarded if it contributes to an improvement.
                    </DialogDescription>
                    <div className="pf-summary">
                      <span>Your feedback</span>
                      <p>{feedbackSummary(draft)}</p>
                      <button
                        className="pf-text"
                        onClick={() => updateFeedbackDraft({ step: 'pain' })}
                      >
                        Edit feedback
                      </button>
                    </div>
                    <Choices
                      label="Preferred reward"
                      options={[
                        'A coupon for my next purchase',
                        'Cashback to my payment card',
                      ]}
                      value={
                        draft.reward === 'coupon'
                          ? 'A coupon for my next purchase'
                          : draft.reward === 'card_cashback'
                            ? 'Cashback to my payment card'
                            : undefined
                      }
                      onChange={(value) =>
                        updateFeedbackDraft({
                          reward: (value.startsWith('A coupon')
                            ? 'coupon'
                            : 'card_cashback') as Reward,
                        })
                      }
                    />
                    <p className="pf-reward-explainer">
                      Coupons apply to a future order. Card cashback is a
                      partial refund of this purchase. Amounts depend on your
                      actual contribution; no reward is guaranteed.
                    </p>
                    <div className="pf-review-time">
                      <Clock3 size={17} />
                      <span>
                        Reviewed within <strong>72 hours</strong>. Card refund
                        processing may take longer.
                      </span>
                    </div>
                    {error && (
                      <p role="alert" className="pf-warning">
                        {error}
                      </p>
                    )}
                    <div className="pf-actions">
                      <button
                        className="pf-text"
                        onClick={() => {
                          setQuestionIndex(draft.questions.length - 1);
                          updateFeedbackDraft({ step: 'questions' });
                        }}
                      >
                        Back
                      </button>
                      <button
                        className="pf-primary"
                        disabled={!draft.reward}
                        onClick={submit}
                      >
                        Submit feedback <ArrowRight size={16} />
                      </button>
                    </div>
                    <p className="pf-footnote">
                      Demo submission stays in this browser. Checkout is
                      completed separately.
                    </p>
                  </>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
