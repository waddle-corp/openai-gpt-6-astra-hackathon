'use client';

import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import { feedbackFixtures, feedbackTargetPath } from '@/agents/feedback-agent/fixtures.ts';
import './feedback.css';

type Triage = {
  decision: 'fit' | 'review' | 'reject';
  score: number;
  summary: string;
  evidence: string[];
  risks: string[];
  nextStep: string;
};

type AgentResult = {
  triage?: Triage;
  computer?: {
    status: string;
    responseId: string;
    call?: { call_id: string; actions?: unknown[] };
    output?: string;
  };
  error?: string;
};

export default function FeedbackLab() {
  const [feedback, setFeedback] = useState('');
  const [feedbackId, setFeedbackId] = useState('');
  const [targetUrl, setTargetUrl] = useState(() =>
    typeof window === 'undefined' ? 'http://localhost:3000/store' : `${window.location.origin}/store`,
  );
  const [inspect, setInspect] = useState(true);
  const [result, setResult] = useState<AgentResult>();
  const [isLoading, setIsLoading] = useState(false);

  function loadFixture(id: string) {
    setFeedbackId(id);
    const record = feedbackFixtures.find((item) => item.id === id);
    if (!record) return;
    setFeedback(record.message);
    setTargetUrl(`${window.location.origin}${feedbackTargetPath(record)}`);
  }

  async function evaluate(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setResult(undefined);
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback, targetUrl, inspect, feedbackId: feedbackId || undefined }),
      });
      setResult((await response.json()) as AgentResult);
    } catch {
      setResult({ error: 'The feedback API could not be reached.' });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="feedback-lab">
      <div className="feedback-frame">
        <header className="feedback-header">
          <a className="back-link" href="/store">← Storefront</a>
          <a className="back-link" href="/tmp/feedback/collective">Collective lab →</a>
          <span className="lab-mark">Astra / feedback lab</span>
        </header>

        <section className="feedback-intro">
          <div>
            <p className="section-index">Strategy gate / temporary surface</p>
            <h1>Should this feedback become a storefront experiment?</h1>
          </div>
          <p className="intro-copy">
            Submit one shopper observation. Astra checks its fit against the growth strategy before any browser inspection begins.
          </p>
        </section>

        <div className="process-rail" aria-label="Agent process">
          <ProcessStep number="01" title="Triage" active={!result?.computer} done={Boolean(result?.triage)} />
          <span className="rail-line" />
          <ProcessStep number="02" title="Inspect" active={Boolean(result?.computer)} done={result?.computer?.status === 'complete'} />
          <span className="rail-line" />
          <ProcessStep number="03" title="Propose" active={result?.computer?.status === 'complete'} done={false} />
        </div>

        <form className="feedback-form" onSubmit={evaluate}>
          <div className="form-heading">
            <div>
              <span className="field-kicker">Input</span>
              <h2>Shopper feedback</h2>
            </div>
            <span className="character-count">{feedback.length} / 4,000</span>
          </div>
          <label className="url-label" htmlFor="fixture">Synthetic shopper feedback (optional)</label>
          <select id="fixture" value={feedbackId} onChange={(event) => loadFixture(event.target.value)}>
            <option value="">Write your own</option>
            {feedbackFixtures.map((record) => (
              <option key={record.id} value={record.id}>
                {record.id} · {record.topic} · {record.message.slice(0, 70)}
              </option>
            ))}
          </select>
          <textarea
            aria-label="Shopper feedback"
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="I was not sure whether this battery fits my Boosted Mini X."
            maxLength={4000}
            required
          />
          <label className="url-label" htmlFor="target-url">Page for optional inspection</label>
          <input
            id="target-url"
            type="url"
            value={targetUrl}
            onChange={(event) => setTargetUrl(event.target.value)}
            required
          />
          <div className="form-footer">
            <label className="inspect-toggle">
              <input checked={inspect} onChange={(event) => setInspect(event.target.checked)} type="checkbox" />
              <span>Inspect with computer use when accepted</span>
            </label>
            <button disabled={isLoading} type="submit">
              {isLoading ? 'Astra is evaluating' : 'Run strategy gate'}
            </button>
          </div>
        </form>

        {result?.error ? <div className="agent-error" role="alert">{result.error}</div> : null}
        {result?.triage ? <TriageResult result={result} /> : null}
      </div>
    </main>
  );
}

function ProcessStep({ number, title, active, done }: { number: string; title: string; active: boolean; done: boolean }) {
  return <div className={`process-step ${active ? 'is-active' : ''} ${done ? 'is-done' : ''}`}><span>{number}</span><strong>{title}</strong></div>;
}

function TriageResult({ result }: { result: AgentResult }) {
  const triage = result.triage!;
  return (
    <section className="triage-result" aria-live="polite">
      <div className="result-topline">
        <div>
          <span className="field-kicker">Astra decision</span>
          <h2>{triage.decision}</h2>
        </div>
        <div className="fit-score"><strong>{triage.score}</strong><span>/ 100 fit</span></div>
      </div>
      <div className="score-track"><span style={{ width: `${triage.score}%` }} /></div>
      <p className="result-summary">{triage.summary}</p>
      <div className="result-columns">
        <ResultList title="Why it fits" items={triage.evidence} />
        <ResultList title="Risks or gaps" items={triage.risks} />
      </div>
      <div className="next-step"><span className="field-kicker">Next step</span><p>{triage.nextStep}</p></div>
      {result.computer?.status === 'needs_screenshot' ? (
        <div className="computer-status"><span className="status-dot" /><div><strong>Computer use is queued</strong><p>The isolated browser runner should execute {result.computer.call?.actions?.length ?? 0} action(s), then send a screenshot to the continuation endpoint.</p></div></div>
      ) : result.computer?.output ? (
        <div className="computer-status"><span className="status-dot" /><div><strong>Proposal ready</strong><p>{result.computer.output}</p></div></div>
      ) : null}
    </section>
  );
}

function ResultList({ title, items }: { title: string; items: string[] }) {
  return <div><h3>{title}</h3>{items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="empty-list">Nothing identified.</p>}</div>;
}
