'use client';
import { useRef, useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Check,
  Play,
  Plus,
  LockKeyhole,
  ScanLine,
  ChevronDown,
} from 'lucide-react';
import { useDemo } from './feedback-state';
import {
  reproduce,
  propose,
  approve,
  pay,
  calculate,
  allocate,
  supported,
  type Feedback,
  type Forecast,
  type Proposal,
} from '@/lib/feedback';
const usd = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
const fields: { key: keyof Forecast; label: string; step: number }[] = [
  { key: 'sessions', label: 'Affected sessions', step: 100 },
  { key: 'baseline', label: 'Baseline paid conversion (%)', step: 0.1 },
  { key: 'lift', label: 'Absolute lift (percentage points)', step: 0.1 },
  { key: 'aov', label: 'Average order value ($)', step: 10 },
  { key: 'margin', label: 'Contribution margin (%)', step: 1 },
  { key: 'cap', label: 'Reward budget cap ($)', step: 50 },
];
export default function FeedbackAdmin() {
  const { state, ready, error, update } = useDemo();
  const [selected, setSelected] = useState('F-014');
  const [stage, setStage] = useState(0);
  const [moment, setMoment] = useState(0);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState('');
  const feedback =
    state.feedback.find((f) => f.id === selected) || state.feedback[0];
  const proposal = state.proposals.find((p) => p.id === feedback.group);
  const locked = !!proposal && proposal.status !== 'proposed';
  const activeStage = stage === 2 && !proposal ? 1 : stage;
  const currentMoment = feedback.moments[moment] || feedback.moments[0];
  const related = state.feedback.filter(
    (f) => f.sample && f.group === feedback.group && f.id !== feedback.id,
  );
  function selectReport(id: string) {
    setSelected(id);
    setStage(0);
    setMoment(0);
    setNotice('');
  }
  async function investigate() {
    if (running || locked) return;
    setRunning(true);
    setStage(1);
    setNotice('');
    try {
      const reports = [feedback, ...related.filter((f) => !f.run)];
      const results = await Promise.all(
        reports.map(async (f) => ({ id: f.id, run: await reproduce(f) })),
      );
      update((s) => ({
        ...s,
        feedback: s.feedback.map((f) => {
          const result = results.find((r) => r.id === f.id);
          return result ? { ...f, run: result.run, reviewed: false } : f;
        }),
      }));
    } catch {
      setNotice(
        'The check could not finish. Your feedback is saved; try again.',
      );
    } finally {
      setRunning(false);
    }
  }
  function createImprovement() {
    update((s) => {
      const next = {
        ...s,
        feedback: s.feedback.map((f) =>
          f.id === feedback.id ? { ...f, reviewed: true } : f,
        ),
      };
      return {
        ...next,
        proposals: s.proposals.some((p) => p.id === feedback.group)
          ? s.proposals
          : [...s.proposals, propose(feedback.group, next.feedback)],
      };
    });
    setStage(2);
  }
  function changeProposal(next: Proposal) {
    update((s) => ({
      ...s,
      proposals: s.proposals.map((p) =>
        p.id === next.id && p.status === 'proposed'
          ? { ...next, version: p.version + 1 }
          : p,
      ),
    }));
  }
  return (
    <div className="pf-admin">
      <header className="pf-header">
        <a
          className="pf-brand"
          href="/admin"
          aria-label="Pay with Feedback home"
        >
          <span className="pf-symbol" aria-hidden="true">
            <Plus size={23} />
          </span>
          Pay with Feedback<span className="pf-demo-label">DEMO</span>
        </a>
        <a className="pf-store-link" href="/store">
          Try the shopper experience
          <ArrowUpRight size={16} />
        </a>
      </header>
      <main>
        <div className="pf-opening">
          <div>
            <p className="pf-eyebrow">SHOPPER INSIGHT → SHARED UPSIDE</p>
            <h1>
              Feedback becomes <span>value.</span>
            </h1>
            <p>
              Shoppers pay with feedback. Your agent investigates. You reward
              what helps.
            </p>
          </div>
        </div>
        <div className="pf-session-bar">
          <nav className="pf-stages" aria-label="Feedback workflow">
            {['Feedback', 'Investigation', 'Improvement & reward'].map(
              (label, i) => (
                <button
                  key={label}
                  aria-current={activeStage === i ? 'step' : undefined}
                  disabled={
                    running ||
                    (i === 1 && !feedback.run) ||
                    (i === 2 && !proposal)
                  }
                  onClick={() => setStage(i)}
                >
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  {label}
                </button>
              ),
            )}
          </nav>
          <div className="pf-report-picker">
            <label htmlFor="pf-feedback">Feedback</label>
            <select
              id="pf-feedback"
              disabled={running}
              value={feedback.id}
              onChange={(e) => selectReport(e.target.value)}
            >
              {state.feedback.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.sample ? '' : 'New · '}
                  {f.persona.split(' · ')[0]} — {f.title}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </div>
        </div>
        {(error || notice) && (
          <output className="pf-notice">{error || notice}</output>
        )}
        <div className="pf-stage-content" key={`${feedback.id}-${activeStage}`}>
          {activeStage === 0 && (
            <section className="pf-story" aria-label="Shopper feedback">
              <div className="pf-journey">
                <div className="pf-window-bar">
                  <span className="pf-window-dots" aria-hidden="true">
                    •••
                  </span>
                  <span className="pf-moment-route" title={currentMoment.route}>
                    {currentMoment.route}
                  </span>
                  <span>
                    {feedback.sample ? 'Sample · ' : ''}
                    {moment + 1} / {feedback.moments.length}
                  </span>
                </div>
                <div className="pf-visual">
                  {feedback.sample && currentMoment.image ? (
                    <a
                      href={currentMoment.image}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        src={currentMoment.image}
                        alt="Local storefront reference, not a shopper recording or replay result"
                      />
                    </a>
                  ) : (
                    <div className="pf-activity">
                      <ScanLine size={38} />
                      <h2>{currentMoment.label}</h2>
                      <p>{currentMoment.detail}</p>
                    </div>
                  )}
                </div>
                <div className="pf-journey-bottom">
                  <div className="pf-moments">
                    {feedback.moments.map((m, i) => (
                      <button
                        key={m.id}
                        aria-pressed={i === moment}
                        onClick={() => setMoment(i)}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <InfoPanel
                    label="Moment details"
                    pages={[
                      {
                        title: 'Journey context',
                        content: (
                          <>
                            <h3>{currentMoment.label}</h3>
                            <p>{currentMoment.detail}</p>
                            <h3>Storefront route</h3>
                            <p>{currentMoment.route}</p>
                            <p>
                              {feedback.sample && currentMoment.image
                                ? 'This screenshot is a storefront reference. It is not a shopper recording or reproduction result.'
                                : 'This is a shopper-selected activity summary, not a screen recording.'}
                            </p>
                          </>
                        ),
                      },
                    ]}
                  />
                </div>
              </div>
              <div className="pf-story-copy">
                <div className="pf-person">
                  <span className="pf-avatar">{feedback.persona[0]}</span>
                  <div>
                    {feedback.persona.split(' · ')[0]}
                    <small>
                      {feedback.sample
                        ? 'Sample shopper'
                        : 'Submitted with Pay with Feedback'}
                    </small>
                  </div>
                </div>
                <blockquote>
                  “
                  {feedback.comment.length > 160
                    ? feedback.comment.slice(0, 160) + '…'
                    : feedback.comment}
                  ”
                </blockquote>
                {feedback.comment.length > 160 && (
                  <InfoPanel
                    label="Read full feedback"
                    pages={(feedback.comment.match(/[\s\S]{1,400}/g) || []).map(
                      (text, i) => ({
                        title: `Part ${i + 1}`,
                        content: <p>{text}</p>,
                      }),
                    )}
                  />
                )}

                <p className="pf-context">
                  {feedback.sample
                    ? 'Shared at checkout instead of paying for a demo order.'
                    : 'Your shopper selected these moments and shared what made shopping difficult.'}
                </p>
                <div className="pf-next">
                  <button
                    className="pf-primary"
                    disabled={!ready || running}
                    onClick={() => (feedback.run ? setStage(1) : investigate())}
                  >
                    {feedback.run
                      ? 'View investigation'
                      : 'Investigate feedback'}
                    <ArrowRight size={18} />
                  </button>
                  <small>
                    {feedback.run
                      ? feedback.run.verdict
                      : `Demo replay${related.length ? ` · includes ${related.length} related report` : ''}`}
                  </small>
                </div>
              </div>
            </section>
          )}
          {activeStage === 1 && (
            <section
              className="pf-investigation"
              aria-label="Investigation result"
            >
              <div
                className={`pf-agent-orb ${running ? 'is-running' : ''}`}
                aria-hidden="true"
              >
                <ScanLine size={30} />
              </div>
              {running ? (
                <output className="pf-running">
                  <p className="pf-eyebrow">DEMO REPLAY</p>
                  <h2>Following the shopper’s trail.</h2>
                  <p>
                    Reviewing selected moments
                    {related.length ? ' and related feedback' : ''}…
                  </p>
                </output>
              ) : (
                <>
                  <div className="pf-result-heading">
                    <p className="pf-eyebrow">
                      {feedback.run?.verdict || 'CHECK INTERRUPTED'} · DEMO
                      REPLAY
                    </p>
                    <h2>
                      {supported(feedback)
                        ? 'The friction is worth fixing.'
                        : feedback.run?.verdict === 'Could not reproduce'
                          ? 'The report is still open.'
                          : 'A clue, not a conclusion.'}
                    </h2>
                    <p>
                      {supported(feedback)
                        ? 'The sample shopper couldn’t find delivery timing at the moment they needed it.'
                        : feedback.run?.observation ||
                          'Run the check again to continue.'}
                    </p>
                  </div>
                  {supported(feedback) && (
                    <div className="pf-hypothesis">
                      <span>Working hypothesis</span>
                      <p>
                        Delivery guidance is too far from the purchase decision.
                      </p>
                      <small>
                        Validate placement and destination rules before making a
                        change.
                      </small>
                    </div>
                  )}
                  <InfoPanel
                    label="Inspect the evidence"
                    pages={[
                      {
                        title: 'Finding',
                        content: (
                          <>
                            <h3>Observation</h3>
                            <p>{feedback.run?.observation}</p>
                            <h3>Root-cause hypothesis</h3>
                            <p>{feedback.run?.hypothesis}</p>
                            <h3>Confidence</h3>
                            <p>{feedback.run?.confidence}</p>
                          </>
                        ),
                      },
                      {
                        title: 'Replay steps',
                        content: (
                          <>
                            <h3>Deterministic demo</h3>
                            <ol>
                              {feedback.run?.steps.map((step) => (
                                <li key={step}>{step}</li>
                              ))}
                            </ol>
                            {related.length > 0 && (
                              <p>
                                {related.length + 1} reports describe this
                                friction. Supported contributions share one
                                improvement.
                              </p>
                            )}
                            <p>
                              These are illustrative outcomes, not a live
                              computer-use run.
                            </p>
                            <button
                              className="pf-text-button"
                              disabled={locked || running}
                              onClick={investigate}
                            >
                              Run demo again <Play size={13} />
                            </button>
                            {locked && (
                              <p>
                                Replay is locked because the reward has been
                                approved.
                              </p>
                            )}
                          </>
                        ),
                      },
                    ]}
                  />

                  <div className="pf-result-action">
                    {supported(feedback) ? (
                      <button
                        className="pf-primary"
                        disabled={!ready}
                        onClick={
                          proposal ? () => setStage(2) : createImprovement
                        }
                      >
                        {proposal
                          ? 'View improvement'
                          : 'Review & create improvement'}
                        <ArrowRight size={18} />
                      </button>
                    ) : (
                      <button
                        className="pf-secondary"
                        onClick={() => setStage(0)}
                      >
                        <ArrowLeft size={16} />
                        Back to feedback
                      </button>
                    )}
                    <small>
                      {supported(feedback)
                        ? 'Based on illustrative evidence. No live browser run.'
                        : 'The original feedback stays saved. More evidence is needed.'}
                    </small>
                  </div>
                </>
              )}
            </section>
          )}
          {activeStage === 2 && proposal && (
            <RewardStage
              proposal={proposal}
              feedback={state.feedback}
              onChange={changeProposal}
              onApprove={() =>
                update((s) => ({
                  ...s,
                  proposals: s.proposals.map((p) =>
                    p.id === proposal.id ? approve(p, s.feedback) : p,
                  ),
                }))
              }
              onPay={() =>
                update((s) => ({
                  ...s,
                  proposals: s.proposals.map((p) =>
                    p.id === proposal.id ? pay(p) : p,
                  ),
                }))
              }
            />
          )}
        </div>
      </main>
    </div>
  );
}
function RewardStage({
  proposal: p,
  feedback,
  onChange,
  onApprove,
  onPay,
}: {
  proposal: Proposal;
  feedback: Feedback[];
  onChange: (p: Proposal) => void;
  onApprove: () => void;
  onPay: () => void;
}) {
  const locked = p.status !== 'proposed';
  let problem = '';
  let scenarios: ReturnType<typeof calculate>[] = [];
  let allocations: { id: string; cents: number }[] = [];
  try {
    scenarios = [0, 1, 2].map((m) => calculate(p.forecast, m));
    allocations =
      p.snapshot?.allocations || allocate(scenarios[1].pool, p.contributors);
  } catch (e) {
    problem = e instanceof Error ? e.message : 'Invalid assumptions';
  }
  const pool = p.snapshot?.pool ?? scenarios[1]?.pool ?? 0;
  return (
    <section className="pf-reward" aria-label="Improvement and reward">
      <div className="pf-change">
        <p className="pf-eyebrow">THE PROPOSED IMPROVEMENT</p>
        <h2>{p.title}</h2>
        <p className="pf-change-description">{p.change}</p>
        <div className="pf-profit">
          <span>Expected extra profit / 30 days</span>
          <strong>{scenarios[1] ? usd(scenarios[1].profit) : '—'}</strong>
          <small>Unmeasured estimate · contribution profit</small>
        </div>
        <InfoPanel
          label="How is this estimated?"
          pages={[
            {
              title: 'Proposed change',
              content: (
                <>
                  <h3>{p.title}</h3>
                  <p>{p.change}</p>
                  <p>
                    This is a proposal. Approving the reward does not modify the
                    storefront.
                  </p>
                </>
              ),
            },
            {
              title: 'Assumptions',
              content: (
                <>
                  <fieldset disabled={locked} className="pf-inputs">
                    {fields.map((f) => (
                      <label key={f.key}>
                        {f.label}
                        <input
                          type="number"
                          min={0}
                          max={
                            ['baseline', 'margin', 'lift'].includes(f.key)
                              ? 100
                              : 100000000
                          }
                          step={f.step}
                          value={p.forecast[f.key]}
                          onChange={(e) =>
                            onChange({
                              ...p,
                              forecast: {
                                ...p.forecast,
                                [f.key]: Number(e.target.value),
                              },
                            })
                          }
                        />
                      </label>
                    ))}
                  </fieldset>
                  {locked && (
                    <p>These inputs are locked to the approved version.</p>
                  )}
                  {problem && (
                    <p role="alert" className="pf-validation">
                      {problem}
                    </p>
                  )}
                </>
              ),
            },
            {
              title: 'Scenarios',
              content: (
                <>
                  <div className="pf-scenarios">
                    {['Low', 'Base', 'High'].map((label, i) => (
                      <div key={label}>
                        <span>{label}</span>
                        <strong>
                          {scenarios[i] ? usd(scenarios[i].profit) : '—'}
                        </strong>
                        <small>+{scenarios[i]?.lift ?? '—'} pp</small>
                      </div>
                    ))}
                  </div>
                  <h3>30-day contribution profit</h3>
                  <p>
                    Sessions × absolute conversion lift × AOV × contribution
                    margin.
                  </p>
                  <p>
                    Baseline is context. Low = zero lift; high = 2× base lift,
                    capped at 100% conversion. One improvement has one forecast;
                    reports do not multiply its value.
                  </p>
                  <p>
                    These are unmeasured estimates, not evidence of actual
                    uplift.
                  </p>
                </>
              ),
            },
            {
              title: 'Validation',
              content: (
                <>
                  <h3>Acceptance check</h3>
                  <p>{p.acceptance}</p>
                  <h3>Measure after shipping</h3>
                  <p>
                    Paid checkout conversion, cancellations and delivery-promise
                    accuracy. Exclude feedback-funded demo orders from paid
                    conversion and revenue.
                  </p>
                </>
              ),
            },
          ]}
        />
      </div>
      <div className="pf-reward-panel">
        <div className="pf-reward-label">
          <span>
            {p.status === 'paid'
              ? 'REWARD COMPLETE'
              : locked
                ? 'REWARD APPROVED'
                : 'SHARE THE UPSIDE'}
          </span>
          {locked && <LockKeyhole size={15} />}
        </div>
        <h3>
          {p.status === 'paid'
            ? 'Good feedback. Rewarded.'
            : 'Give value back.'}
        </h3>
        <div className="pf-share-control">
          <label htmlFor="pf-share">Share of expected profit</label>
          <span>{p.forecast.rate}%</span>
          <input
            id="pf-share"
            type="range"
            min={0}
            max={100}
            step={1}
            disabled={locked}
            value={p.forecast.rate}
            onChange={(e) =>
              onChange({
                ...p,
                forecast: { ...p.forecast, rate: Number(e.target.value) },
              })
            }
          />
        </div>
        <div className="pf-reward-total">
          <strong>{usd(pool / 100)}</strong>
          <span>
            shared with {p.contributors.length} contributor
            {p.contributors.length === 1 ? '' : 's'}
          </span>
        </div>
        {!problem && (
          <div className="pf-allocations">
            {p.contributors.map((c) => (
              <div key={c.id}>
                <span className="pf-avatar">
                  {feedback.find((f) => f.id === c.id)?.persona[0] || 'S'}
                </span>
                <span>
                  {feedback
                    .find((f) => f.id === c.id)
                    ?.persona.split(' · ')[0] || c.id}
                  <small>{c.id}</small>
                </span>
                <strong>
                  {usd(
                    (allocations.find((a) => a.id === c.id)?.cents || 0) / 100,
                  )}
                </strong>
              </div>
            ))}
          </div>
        )}
        <InfoPanel
          label="Allocation & reward policy"
          pages={[
            {
              title: 'Contribution weights',
              content: (
                <>
                  {p.contributors.map((c) => (
                    <label className="pf-weight" key={c.id}>
                      <span>
                        {c.id}
                        <small>{c.reason}</small>
                      </span>
                      <input
                        aria-label={`Weight for ${c.id}`}
                        disabled={locked}
                        type="number"
                        min={0}
                        max={1000}
                        value={c.weight}
                        onChange={(e) =>
                          onChange({
                            ...p,
                            contributors: p.contributors.map((person) =>
                              person.id === c.id
                                ? { ...person, weight: Number(e.target.value) }
                                : person,
                            ),
                          })
                        }
                      />
                    </label>
                  ))}
                  {problem && (
                    <p role="alert" className="pf-validation">
                      {problem}
                    </p>
                  )}
                </>
              ),
            },
            {
              title: 'Reward policy',
              content: (
                <>
                  <h3>One improvement. One reward pool.</h3>
                  <p>
                    {p.forecast.rate}% of expected contribution profit, capped
                    at {usd(p.forecast.cap)}.
                  </p>
                  <p>
                    Weights are reward-policy choices, not measured causal
                    shares. Exact repeat submissions reuse their report. Related
                    reports share a single benefit estimate.
                  </p>
                  <p>
                    Approval locks version {p.version}, forecast, pool and
                    allocations. Payout is simulated and repeat requests reuse
                    the same receipt.
                  </p>
                </>
              ),
            },
          ]}
        />

        {problem && (
          <p className="pf-validation" role="alert">
            {problem}
          </p>
        )}
        <button
          className="pf-primary"
          disabled={!!problem || p.status === 'paid' || pool <= 0}
          onClick={locked ? onPay : onApprove}
        >
          {p.status === 'paid' ? (
            <>
              <Check size={18} />
              Demo payout complete
            </>
          ) : locked ? (
            <>
              Simulate payout
              <ArrowRight size={18} />
            </>
          ) : (
            <>
              Approve {usd(pool / 100)} reward
              <ArrowRight size={18} />
            </>
          )}
        </button>
        <p className="pf-payout-note">
          {p.receipt
            ? `${p.receipt} · No money moved.`
            : locked
              ? `Version ${p.snapshot?.version} locked. No real money will move.`
              : 'Demo reward · Approval locks this forecast and allocation.'}
        </p>
      </div>
    </section>
  );
}

function InfoPanel({
  label,
  pages,
}: {
  label: string;
  pages: { title: string; content: ReactNode }[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState(0);
  return (
    <>
      <button
        className="pf-info-trigger"
        onClick={() => {
          setPage(0);
          dialog.current?.showModal();
        }}
      >
        {label}
        <Plus size={14} />
      </button>
      <dialog ref={dialog} className="pf-info-dialog" aria-label={label}>
        <div className="pf-dialog-header">
          <h2>{label}</h2>
          <button
            aria-label="Close details"
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </div>
        <nav aria-label={`${label} sections`} className="pf-dialog-tabs">
          {pages.map((p, i) => (
            <button
              key={p.title}
              aria-pressed={page === i}
              onClick={() => setPage(i)}
            >
              {p.title}
            </button>
          ))}
        </nav>
        <div className="pf-dialog-body">{pages[page]?.content}</div>
        <div className="pf-dialog-footer">
          <span>
            {page + 1} / {pages.length}
          </span>
          <button
            className="pf-text-button"
            onClick={() =>
              page < pages.length - 1
                ? setPage(page + 1)
                : dialog.current?.close()
            }
          >
            {page < pages.length - 1 ? 'Next' : 'Done'}
            <ArrowRight size={15} />
          </button>
        </div>
      </dialog>
    </>
  );
}
