'use client';

import { useMemo, useState } from 'react';
import type { FeedbackPoint } from '@/agents/feedback-agent/embed.ts';
import cache from '@/data/collective-cache.json';
import { feedbackFixtures } from '@/agents/feedback-agent/fixtures.ts';
import type {
  ImprovementOpportunity,
  Prioritization,
} from '@/agents/feedback-agent/index.ts';
import type { RewardLedger } from '@/agents/reward-agent/index.ts';
import { rewardPolicy } from '@/agents/reward-agent/index.ts';
import { strategy } from '@/agents/shared/strategy.ts';
import '../feedback.css';
import { FeedbackMap, groupColor, type MapGroup } from './feedback-map';

const byId = new Map(feedbackFixtures.map((record) => [record.id, record]));

// ponytail: one cached Astra pass (scripts/precompute-collective.mjs) so the demo never waits on the model.
const cached = cache as unknown as {
  generatedAt: string;
  points: FeedbackPoint[];
  prioritization: Prioritization;
  lead: string;
  opportunities: Record<string, ImprovementOpportunity>;
  reward: RewardLedger;
};
const sameIds = (a: Iterable<string>, b: Iterable<string>) => {
  const left = [...new Set(a)].sort().join();
  return left === [...new Set(b)].sort().join();
};
const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function CollectiveLab() {
  const [prioritization, setPrioritization] = useState<Prioritization>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState('');
  const [opportunity, setOpportunity] = useState<ImprovementOpportunity>();
  const [ledger, setLedger] = useState<RewardLedger>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<'prioritize' | 'synthesize' | 'reward'>();
  const [points] = useState<FeedbackPoint[]>(cached.points);
  const [hoveredId, setHoveredId] = useState<string>();
  const [pinnedId, setPinnedId] = useState<string>();
  const [run, setRun] = useState(0); // remounts the map so the arrival animation starts over

  function restart() {
    setPrioritization(undefined);
    setOpportunity(undefined);
    setLedger(undefined);
    setSelected(new Set());
    setPinnedId(undefined);
    setError(undefined);
    setRun((current) => current + 1);
  }

  // Only the lead opportunity lights up on the map; every other record stays dim.
  const groups = useMemo(() => {
    const map = new Map<string, MapGroup>();
    prioritization?.opportunities.forEach((item, index) => {
      if (item.id !== cached.lead) return;
      item.feedbackIds.forEach((id) =>
        map.set(id, { index, title: item.title, priority: item.priority }),
      );
    });
    return map;
  }, [prioritization]);
  const bounties = useMemo(
    () =>
      new Map(
        ledger?.contributions.map((item) => [
          item.feedbackId,
          dollars(item.bountyCents),
        ]),
      ),
    [ledger],
  );
  const labels = useMemo(
    () =>
      new Map(
        feedbackFixtures.map((record) => [
          record.id,
          groups.get(record.id)?.title ??
            record.context.selectedPage?.title ??
            record.source.channel,
        ]),
      ),
    [groups],
  );

  async function call<T>(
    path: string,
    body: unknown,
    stage: 'prioritize' | 'synthesize' | 'reward',
  ) {
    setBusy(stage);
    setError(undefined);
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as T & { error?: string };
      if (payload.error) setError(payload.error);
      return payload.error ? undefined : payload;
    } catch {
      setError('The feedback API could not be reached.');
    } finally {
      setBusy(undefined);
    }
  }

  async function prioritize() {
    setOpportunity(undefined);
    setLedger(undefined);
    setBusy('prioritize');
    await wait(900);
    setPrioritization(cached.prioritization);
    setBusy(undefined);
  }

  async function synthesize() {
    setLedger(undefined);
    const lead = cached.prioritization.opportunities.find(
      (item) => item.id === cached.lead,
    );
    if (lead && sameIds(selected, lead.feedbackIds) && !focus) {
      setBusy('synthesize');
      await wait(700);
      setOpportunity(cached.opportunities[cached.lead]);
      setBusy(undefined);
      return;
    }
    const payload = await call<{ opportunity: ImprovementOpportunity }>(
      '/api/feedback/synthesize',
      { feedbackIds: [...selected], focus: focus || undefined },
      'synthesize',
    );
    if (payload) setOpportunity(payload.opportunity);
  }

  async function publish() {
    if (!opportunity) return;
    if (opportunity.title === cached.reward.opportunityTitle) {
      setBusy('reward');
      await wait(800);
      setLedger(cached.reward);
      setBusy(undefined);
      return;
    }
    const payload = await call<{ ledger: RewardLedger }>(
      '/api/reward',
      { feedbackIds: [...selected], opportunity },
      'reward',
    );
    if (payload) setLedger(payload.ledger);
  }

  function toggle(id: string) {
    setPinnedId((current) => (current === id ? undefined : id));
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  return (
    <main className="feedback-lab">
      <div className="feedback-frame">
        <header className="feedback-header">
          <a className="back-link" href="/tmp/feedback">
            ← Single feedback
          </a>
          <span className="lab-mark">Astra / collective lab</span>
        </header>

        <section className="feedback-intro">
          <div>
            <p className="section-index">Merchant side / steps 2, 3 and 6</p>
            <h1>Which shopper problems matter for this merchant?</h1>
          </div>
          <p className="intro-copy">
            Astra maps {feedbackFixtures.length} recorded shopper experiences,
            ranks them against the merchant strategy, then synthesizes the
            records you select into one improvement opportunity. Publishing it
            pays the shoppers behind it out of the merchant bounty budget.
          </p>
        </section>

        <div className="process-rail" aria-label="Agent process">
          <ProcessStep
            number="02"
            title="Prioritize"
            active={!prioritization}
            done={Boolean(prioritization)}
          />
          <span className="rail-line" />
          <ProcessStep
            number="03"
            title="Synthesize"
            active={Boolean(prioritization) && !opportunity}
            done={Boolean(opportunity)}
          />
          <span className="rail-line" />
          <ProcessStep
            number="04"
            title="Build"
            active={Boolean(opportunity)}
            done={Boolean(ledger)}
          />
          <span className="rail-line" />
          <ProcessStep
            number="06"
            title="Reward"
            active={Boolean(opportunity) && !ledger}
            done={Boolean(ledger)}
          />
        </div>

        <section className="feedback-form">
          <div className="form-heading">
            <div>
              <span className="field-kicker">Merchant strategy</span>
              <h2>{strategy.goal}</h2>
            </div>
          </div>
          <div className="result-columns">
            <ResultList
              title="Priorities (ordered)"
              items={[...strategy.priorities]}
            />
            <ResultList title="Constraints" items={[...strategy.constraints]} />
          </div>
          <div className="form-footer">
            <span className="character-count">
              {feedbackFixtures.length} feedback records with journeys
            </span>
            <button disabled={Boolean(busy)} onClick={prioritize} type="button">
              {busy === 'prioritize'
                ? 'Astra is prioritizing'
                : 'Prioritize against strategy'}
            </button>
            <button
              className="secondary"
              disabled={Boolean(busy)}
              onClick={restart}
              type="button"
            >
              Replay from start
            </button>
          </div>
        </section>

        {error ? (
          <div className="agent-error" role="alert">
            {error}
          </div>
        ) : null}

        <section className="map-section">
          <div className="form-heading">
            <div>
              <span className="field-kicker">Feedback map</span>
              <h2>
                {ledger
                  ? 'Every star that earned a bounty now carries what its shopper is paid'
                  : prioritization
                    ? 'Stars are the feedback behind the lead opportunity; everything else stays dim'
                    : 'Shopper feedback arriving in embedding space, not yet judged'}
              </h2>
            </div>
            <span className="character-count">
              {points.length
                ? `${points.length} points · text-embedding-3-small → PCA · Astra run ${cached.generatedAt.slice(0, 10)}`
                : 'Embedding…'}
            </span>
          </div>
          {points.length ? (
            <div className="map-stage">
              <FeedbackMap
                key={run}
                bounties={bounties}
                groups={groups}
                judged={Boolean(prioritization)}
                labels={labels}
                onHover={setHoveredId}
                onToggle={toggle}
                points={points}
                selected={selected}
              />
              <JourneyPlayer
                key={pinnedId ?? hoveredId}
                id={pinnedId ?? hoveredId}
                label={labels.get(pinnedId ?? hoveredId ?? '')}
                onClose={pinnedId ? () => setPinnedId(undefined) : undefined}
              />
            </div>
          ) : null}
          {prioritization ? (
            <div className="map-legend">
              {prioritization.opportunities.map((item, index) => (
                <button
                  className="legend-item"
                  key={item.id}
                  onClick={() => setSelected(new Set(item.feedbackIds))}
                  type="button"
                >
                  <span
                    className="legend-dot"
                    style={{ background: groupColor(index) }}
                  />
                  {item.title}
                </button>
              ))}
            </div>
          ) : (
            <p className="empty-list">
              Position comes from the message embedding only. Astra assigns the
              groups; the map shows where they land.
            </p>
          )}
        </section>

        {prioritization ? (
          <section className="triage-result" aria-live="polite">
            <div className="result-topline">
              <div>
                <span className="field-kicker">Ranked opportunities</span>
                <h2>{prioritization.opportunities.length} problem areas</h2>
              </div>
            </div>
            {prioritization.opportunities.map((item, index) => (
              <article className="opportunity" key={item.id}>
                <div className="result-topline">
                  <div>
                    <span className="field-kicker">
                      #{index + 1} · {item.journeyStage} ·{' '}
                      {item.feedbackIds.length} shopper(s)
                    </span>
                    <h3>{item.title}</h3>
                  </div>
                  <div className="fit-score">
                    <strong>{item.priority}</strong>
                    <span>/ 100 priority</span>
                  </div>
                </div>
                <div className="score-track">
                  <span style={{ width: `${item.priority}%` }} />
                </div>
                <p className="result-summary">{item.problem}</p>
                <p className="opportunity-rationale">{item.rationale}</p>
                <div className="result-columns">
                  <ResultList title="Serves" items={item.goalAlignment} />
                  <ResultList
                    title="Constraint risks"
                    items={item.constraintRisks}
                  />
                </div>
                <div className="chips">
                  {item.feedbackIds.map((id) => (
                    <label
                      className={`chip ${selected.has(id) ? 'is-selected' : ''}`}
                      key={id}
                      title={byId.get(id)?.feedback.message}
                    >
                      <input
                        checked={selected.has(id)}
                        onChange={() => toggle(id)}
                        type="checkbox"
                      />
                      {id.replace('shopper-feedback-', '#')}{' '}
                      {byId.get(id)?.context.selectedPage?.title ??
                        byId.get(id)?.source.channel}
                    </label>
                  ))}
                  <button
                    className="chip-action"
                    onClick={() => setSelected(new Set(item.feedbackIds))}
                    type="button"
                  >
                    Select this group
                  </button>
                </div>
              </article>
            ))}
            {prioritization.setAside.length ? (
              <ResultList
                title="Set aside"
                items={prioritization.setAside.map(
                  (item) => `${item.feedbackId}: ${item.reason}`,
                )}
              />
            ) : null}
            <div className="synthesize-bar">
              <input
                aria-label="Merchant focus"
                onChange={(event) => setFocus(event.target.value)}
                placeholder="Optional focus, e.g. reduce returns this quarter"
                type="text"
                value={focus}
              />
              <button
                disabled={Boolean(busy) || selected.size === 0}
                onClick={synthesize}
                type="button"
              >
                {busy === 'synthesize'
                  ? 'Astra is synthesizing'
                  : `Synthesize ${selected.size} selected`}
              </button>
            </div>
          </section>
        ) : null}

        {opportunity ? (
          <OpportunityResult
            busy={busy === 'reward'}
            ledger={ledger}
            onPublish={publish}
            opportunity={opportunity}
          />
        ) : null}
        {ledger ? <RewardResult ledger={ledger} /> : null}
      </div>
    </main>
  );
}

function JourneyPlayer({
  id,
  label,
  onClose,
}: {
  id?: string;
  label?: string;
  onClose?: () => void;
}) {
  const [missing, setMissing] = useState(false); // remounted per id via key
  if (!id) return null;
  return (
    <div className="journey-player">
      <div className="journey-topline">
        <span>
          {id.replace('shopper-feedback-', '#')} · {label}
        </span>
        {onClose ? (
          <button aria-label="Unpin" onClick={onClose} type="button">
            ×
          </button>
        ) : (
          <span className="journey-hint">click to pin</span>
        )}
      </div>
      {missing ? (
        <p className="empty-list">
          No computer-use recording for this feedback yet.
        </p>
      ) : (
        <video
          autoPlay
          key={id}
          loop
          muted
          onError={() => setMissing(true)}
          playsInline
          src={`/media/journeys/${id}.webm`}
        />
      )}
    </div>
  );
}

function OpportunityResult({
  opportunity,
  ledger,
  busy,
  onPublish,
}: {
  opportunity: ImprovementOpportunity;
  ledger?: RewardLedger;
  busy: boolean;
  onPublish: () => void;
}) {
  return (
    <section className="triage-result" aria-live="polite">
      <div className="result-topline">
        <div>
          <span className="field-kicker">Improvement opportunity</span>
          <h2>{opportunity.title}</h2>
        </div>
      </div>
      <p className="result-summary">{opportunity.underlyingProblem}</p>
      <p className="opportunity-rationale">{opportunity.opportunity}</p>
      <div className="result-columns">
        <ResultList
          title="Design direction"
          items={opportunity.designDirection}
        />
        <ResultList
          title="Constraints honored"
          items={opportunity.constraintsHonored}
        />
      </div>
      <ResultList
        title="Tensions resolved"
        items={opportunity.tensions.map(
          (item) =>
            `${item.feedbackIds.join(', ')}: ${item.tension} → ${item.resolution}`,
        )}
      />
      <ResultList
        title="Evidence"
        items={opportunity.evidence.map(
          (item) => `${item.feedbackId} (${item.role}): “${item.quote}”`,
        )}
      />
      <div className="next-step">
        <span className="field-kicker">Success metric</span>
        <p>{opportunity.successMetric}</p>
      </div>
      <div className="next-step">
        <span className="field-kicker">
          Build brief for Astra (proposal only)
        </span>
        <p>{opportunity.buildBrief}</p>
      </div>
      <div className="synthesize-bar">
        <span className="character-count">
          Merchant bounty budget {dollars(rewardPolicy.poolCents)} per published
          improvement
        </span>
        <button
          disabled={busy || Boolean(ledger)}
          onClick={onPublish}
          type="button"
        >
          {busy
            ? 'Astra is weighing contributions'
            : ledger
              ? 'Published'
              : 'Publish and reward contributors'}
        </button>
      </div>
    </section>
  );
}

function RewardResult({ ledger }: { ledger: RewardLedger }) {
  return (
    <section className="triage-result" aria-live="polite">
      <div className="result-topline">
        <div>
          <span className="field-kicker">
            Step 6 · rewarded on publish · {ledger.contributions.length}{' '}
            contributors
          </span>
          <h2>{dollars(ledger.poolCents)} split by contribution</h2>
        </div>
      </div>
      <p className="result-summary">
        Shares come from the roles Astra assigned and the order it ranked them
        in, weighted by the merchant policy. Astra does not choose amounts.
      </p>
      <div className="result-columns">
        <ResultList
          title="Measured on these records"
          items={[
            `${dollars(ledger.basket.cartValueCents)} of basket value across ${ledger.basket.recordsWithCart} carts`,
            `${ledger.basket.notCompleted} of ${ledger.contributions.length} shoppers did not complete the purchase`,
          ]}
        />
        <ResultList
          title="Metric this improvement is aimed at"
          // The full metric is already on the opportunity above; one sentence keeps the panels level.
          items={[`${ledger.successMetric.split('. ')[0]}.`]}
        />
      </div>
      {ledger.contributions.map((item) => (
        <article className="opportunity" key={item.feedbackId}>
          <div className="result-topline">
            <div>
              <span className="field-kicker">
                #{item.rank} ·{' '}
                {item.feedbackId.replace('shopper-feedback-', '#')} ·{' '}
                {item.roles.join(' · ')} ·{' '}
                {item.cartCents === null
                  ? 'no cart recorded'
                  : `${dollars(item.cartCents)} cart, ${item.purchased ? 'purchased' : 'not completed'}`}{' '}
                ·{' '}
                {item.rewardPreference === 'card_cashback'
                  ? 'card cashback'
                  : item.rewardPreference === 'coupon'
                    ? 'store coupon'
                    : 'reward preference not chosen'}
              </span>
              <h3>{dollars(item.bountyCents)}</h3>
            </div>
            <div className="fit-score">
              <strong>{Math.round(item.share * 100)}</strong>
              <span>% of pool</span>
            </div>
          </div>
          <div className="score-track">
            <span style={{ width: `${item.share * 100}%` }} />
          </div>
          <p className="result-summary">{item.rationale}</p>
        </article>
      ))}
      {ledger.excluded.length ? (
        <ResultList
          title="No bounty"
          items={ledger.excluded.map(
            (item) => `${item.feedbackId}: ${item.reason}`,
          )}
        />
      ) : null}
    </section>
  );
}

function ProcessStep({
  number,
  title,
  active,
  done,
}: {
  number: string;
  title: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div
      className={`process-step ${active ? 'is-active' : ''} ${done ? 'is-done' : ''}`}
    >
      <span>{number}</span>
      <strong>{title}</strong>
    </div>
  );
}

function ResultList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3>{title}</h3>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="empty-list">Nothing identified.</p>
      )}
    </div>
  );
}
