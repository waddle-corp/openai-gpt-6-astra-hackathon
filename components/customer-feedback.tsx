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
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  categories,
  feedbackReviewText,
  feedbackPages,
  journeyMoments,
  journeySummary,
  selectedMomentIds,
  selectionLabel,
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
    let observer: IntersectionObserver | undefined;
    let detach = () => {};
    const frame = requestAnimationFrame(() => {
      capturePage(pathname);
      const main = document.querySelector('main');
      const title = (
        main?.querySelector('h1')?.textContent?.trim() || 'Store page'
      ).slice(0, 120);
      const description = main?.querySelector('.product-description');
      if (description && typeof IntersectionObserver !== 'undefined') {
        observer = new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
              recordJourney({
                kind: 'description_reached',
                path: pathname,
                title,
              });
              observer?.disconnect();
            }
          },
          { threshold: 0.05 },
        );
        observer.observe(description);
      }
      const followLink = (event: Event) => {
        const link =
          event.target instanceof Element
            ? (event.target.closest('a[href]') as HTMLAnchorElement | null)
            : null;
        if (!link) return;
        const destination = new URL(link.href);
        if (
          destination.origin !== window.location.origin ||
          !/^\/store\/(products|collections|cart)(\/|$)/.test(
            destination.pathname,
          )
        )
          return;
        recordJourney({
          kind: 'link_clicked',
          path: pathname,
          title,
          destinationPath: destination.pathname,
          detail: link.textContent?.trim().slice(0, 120) || 'Store link',
        });
      };
      main?.addEventListener('click', followLink);
      detach = () => main?.removeEventListener('click', followLink);
    });
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      detach();
    };
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
              Let us save the pages you visit, product choices, store links you
              follow, and when product details enter your screen to help you
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
          <span className="pf-choice-label">{option}</span>
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
  const moments = journeyMoments(session.events);
  const chosenIds = selectedMomentIds(draft).filter((id) =>
    session.events.some((event) => event.id === id),
  );
  const chosenCount = moments.filter((moment) =>
    chosenIds.includes(moment.id),
  ).length;
  const focusLabel = selectionLabel(draft, session.events);
  function chooseMoment(moment: (typeof moments)[number]) {
    const ids = chosenIds.includes(moment.id)
      ? chosenIds.filter((id) => !moment.eventIds.includes(id))
      : [...new Set([...chosenIds, ...moment.eventIds])];
    const orderedIds = session.events
      .filter((event) => ids.includes(event.id))
      .map((event) => event.id);
    updateFeedbackDraft({
      focus: 'specific_moments',
      selectedIds: orderedIds,
      selected: session.events.find((event) => event.id === orderedIds[0]),
      questions: [],
      answers: {},
    });
  }
  const receipt = session.receipt;
  const question = draft.questions[questionIndex];
  const stepNumber =
    draft.step === 'journey' ? 1 : draft.step === 'review' ? 3 : 2;

  async function questions() {
    if ((draft.focus !== 'overall' && !chosenIds.length) || loading) return;
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
          selectedScreen: draft.focus === 'overall' ? null : draft.selected,
          focus: {
            scope: draft.focus === 'overall' ? 'overall' : 'specific_moments',
            eventIds: chosenIds,
          },
          journey: session.events,
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
      close(false);
    } catch {
      setError(
        'We could not save your feedback. Allow browser storage and try again. Your answers are still here.',
      );
    }
  }
  return (
    <>
      <section
        className="pf-checkout-entry"
        aria-label="Optional order feedback"
      >
        <Dialog open={open} onOpenChange={close}>
          <DialogTrigger className="pf-checkout-toggle">
            <span className="pf-checkout-toggle-icon">
              {receipt ? <Check size={18} /> : <Gift size={18} />}
            </span>
            <span className="pf-checkout-toggle-label">
              <strong>
                {receipt ? 'Feedback added' : 'Pay with your feedback'}
              </strong>
              <small>
                {receipt
                  ? receipt.rewardPreference === 'coupon'
                    ? 'Next-purchase coupon selected'
                    : 'Card cashback selected'
                  : 'Optional · about 30 seconds'}
              </small>
            </span>
            <ArrowRight size={17} />
          </DialogTrigger>
          <p className="pf-checkout-hint" aria-live="polite">
            {receipt
              ? 'We’ll review your contribution within 72 hours. You can place your order below.'
              : 'Share a shopping moment for a chance to earn a coupon or card cashback.'}
          </p>
          <DialogContent className="pf-dialog">
            <header className="pf-dialog-header">
              <span className="pf-brand">
                <MessageSquare size={19} /> Pay with your feedback
              </span>
            </header>
            <div className="pf-dialog-body">
              {receipt ? (
                <div className="pf-applied-feedback">
                  <DialogTitle className="pf-title">Feedback added</DialogTitle>
                  <DialogDescription className="pf-description">
                    Your contribution will be reviewed within 72 hours. You can
                    place your order after closing this window.
                  </DialogDescription>
                  <p>{receipt.summary}</p>
                  <small>
                    Reward eligibility and amount depend on your contribution.
                    No discount is applied to today’s total. Card refund
                    processing may take longer after confirmation.
                  </small>
                </div>
              ) : session.consent !== 'accepted' ? (
                <>
                  <DialogTitle className="pf-title">
                    Your experience, on your terms.
                  </DialogTitle>
                  <DialogDescription className="pf-description">
                    To share feedback, allow us to record the store pages you
                    visit, product choices, store links you follow, and when
                    product details enter your screen. Recording starts only
                    after you agree. Your feedback and journey may be processed
                    by AI; payment details are never recorded.
                  </DialogDescription>
                  <button
                    className="pf-primary"
                    onClick={() => setFeedbackConsent('accepted')}
                  >
                    Allow and continue
                  </button>
                  <button className="pf-text" onClick={() => close(false)}>
                    Maybe later
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
                    Done
                  </button>
                </>
              ) : (
                <>
                  <div
                    className="pf-progress"
                    aria-label={`Step ${stepNumber} of 3`}
                  >
                    <span className={stepNumber >= 1 ? 'active' : ''}>
                      01 Journey
                    </span>
                    <span className={stepNumber >= 2 ? 'active' : ''}>
                      02 Question
                    </span>
                    <span className={stepNumber >= 3 ? 'active' : ''}>
                      03 Reward
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
                        Choose the moments that belong to the same experience,
                        or tell us about your overall visit.
                      </DialogDescription>
                      <button
                        className={`pf-overall ${draft.focus === 'overall' ? 'is-selected' : ''}`}
                        aria-pressed={draft.focus === 'overall'}
                        onClick={() =>
                          updateFeedbackDraft({
                            focus: 'overall',
                            selectedIds: [],
                            selected: undefined,
                            questions: [],
                            answers: {},
                          })
                        }
                      >
                        <MessageSquare size={18} />
                        <span>My overall shopping experience</span>
                        {draft.focus === 'overall' && <Check size={18} />}
                      </button>
                      {moments.length ? (
                        <>
                          <p className="pf-journey-summary">
                            {journeySummary(session.events)}
                          </p>
                          <div
                            className="pf-timeline"
                            aria-label="Your recorded shopping journey"
                          >
                            {moments.map((moment, index) => (
                              <button
                                key={moment.id}
                                className={`pf-moment ${chosenIds.includes(moment.id) ? 'is-selected' : ''}`}
                                aria-pressed={chosenIds.includes(moment.id)}
                                onClick={() => chooseMoment(moment)}
                              >
                                <span className="pf-moment-marker">
                                  {chosenIds.includes(moment.id) ? (
                                    <Check size={16} />
                                  ) : (
                                    index + 1
                                  )}
                                </span>
                                {moment.page.image && (
                                  <img
                                    className="pf-moment-image"
                                    src={moment.page.image}
                                    alt=""
                                  />
                                )}
                                <span className="pf-moment-copy">
                                  <strong>{moment.label}</strong>
                                  <span>{moment.page.title}</span>
                                  {moment.details.length > 0 && (
                                    <span className="pf-moment-details">
                                      {moment.details.join(' · ')}
                                    </span>
                                  )}
                                </span>
                              </button>
                            ))}
                          </div>
                          <p className="pf-footnote">
                            Recorded actions, not a video replay. Product images
                            are representative. Returning to a page does not
                            tell us why.
                          </p>
                        </>
                      ) : (
                        <div className="pf-empty">
                          <strong>No recorded moments yet.</strong>
                          <p>
                            You can still share feedback about your overall
                            experience. Visits before you opted in were not
                            recorded.
                          </p>
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
                          disabled={
                            draft.focus !== 'overall' && !chosenIds.length
                          }
                          onClick={() => updateFeedbackDraft({ step: 'pain' })}
                        >
                          {draft.focus === 'overall'
                            ? 'Continue'
                            : `Continue with ${chosenCount} ${chosenCount === 1 ? 'moment' : 'moments'}`}{' '}
                          <ArrowRight size={16} />
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
                        Thinking about {focusLabel.toLowerCase()}. Pick the
                        closest match.
                      </DialogDescription>
                      <Choices
                        label="Type of difficulty"
                        options={categories}
                        value={draft.category}
                        onChange={(category) =>
                          updateFeedbackDraft({ category })
                        }
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
                          onClick={() =>
                            updateFeedbackDraft({ step: 'journey' })
                          }
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
                        {focusLabel} · {draft.category}
                      </DialogDescription>
                      <Choices
                        label={question.prompt}
                        options={question.options}
                        value={draft.answers[question.id]}
                        onChange={(answer) =>
                          updateFeedbackDraft({
                            answers: {
                              ...draft.answers,
                              [question.id]: answer,
                            },
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
                        <p>{feedbackReviewText(draft)}</p>
                        <div className="pf-review-context">
                          <strong>
                            {draft.focus === 'overall'
                              ? 'About your overall visit'
                              : 'Related products & pages'}
                          </strong>
                          {feedbackPages(draft, session.events).length > 0 && (
                            <ul>
                              {feedbackPages(draft, session.events).map(
                                (page) => (
                                  <li key={page}>{page}</li>
                                ),
                              )}
                            </ul>
                          )}
                        </div>
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
                          'A coupon for up to 10% off my next purchase',
                          'Up to 5% of this purchase back to my payment card',
                        ]}
                        value={
                          draft.reward === 'coupon'
                            ? 'A coupon for up to 10% off my next purchase'
                            : draft.reward === 'card_cashback'
                              ? 'Up to 5% of this purchase back to my payment card'
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
                          Apply feedback <ArrowRight size={16} />
                        </button>
                      </div>
                      <p className="pf-footnote">
                        Your order total stays the same. Any reward is confirmed
                        after review.
                      </p>
                    </>
                  )}
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </section>
    </>
  );
}
